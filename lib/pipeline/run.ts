// The post-call pipeline, STEPS A-F, as one orchestrator. Used by the Vaani webhook, the poller and the Rehearsal Room.
import { db, must } from '../db';
import { env } from '../env';
import { logCost, geminiCostInr, vaaniCostInr, vaaniMinutes } from '../cost';
import { loadLead } from '../leads';
import { send } from '../notify';
import { emailCompliance } from '../notify/templates';
import { routeEnquiry, type RouteOutcome } from '../route';
import { effectiveRules } from '../rules/store';
import { appBase } from '../env';
import { isAfterHours } from '../time';
import { cleanTurns, isThinCall, MERGE_WINDOW_MS, normalizePhone } from './clean';
import { complianceScan } from './compliance';
import { decide } from './decide';
import { extractFromTranscript } from './extract';
import type { CallRecord, CallerHistory, DecidedExtraction, Turn } from '../types';
import { geminiConfigured } from '../ai/gemini';
import { syncEnquiry } from '../crm/sync';

export interface ProcessOptions {
  simulated?: boolean;
  /** Rehearsal: hand the lead to this designer (the email still goes to the test address). */
  designerId?: string;
  /** Rehearsal: seed a prior enquiry for this number so repeat-caller logic fires (T16). */
  history?: { prior_at: string; prior_ref: string; prior_status: string } | null;
  /** Do not wait out the 15-minute merge window for a dropped call; finalise immediately. */
  finalizeNow?: boolean;
}

export interface ProcessResult {
  enquiryId: string; ref: string; callId: string; merged: boolean; deferred: boolean;
  verdict: string | null; route: RouteOutcome | null; extraction: DecidedExtraction | null;
  complianceHits: number; error?: string; elapsedMs: number; geminiMs?: number;
}

const iso = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString() : null);

/** STEP A/B storage + merge + history. */
async function storeCall(rec: CallRecord, opts: ProcessOptions): Promise<{ callId: string; enquiryId: string; merged: boolean; history: CallerHistory; ref: string; existed?: boolean }> {
  const rules = await effectiveRules();
  const startedAt = new Date(rec.startedAt);
  const number = normalizePhone(rec.callerNumber);

  // Idempotent: the same provider call id is never stored twice.
  const { data: existing } = await db().from('calls').select('id, enquiry_id').eq('provider', rec.provider).eq('provider_call_id', rec.providerCallId).maybeSingle();
  if (existing) {
    const e = (await db().from('enquiries').select('ref').eq('id', existing.enquiry_id).single()).data;
    return { callId: existing.id, enquiryId: existing.enquiry_id, merged: false, history: emptyHistory(), ref: e?.ref ?? '', existed: true };
  }

  // Merge calls from the same number within 15 minutes into one enquiry.
  let enquiry: any = null;
  let history = emptyHistory();
  if (number) {
    const { data: prior } = await db().from('enquiries').select('*').eq('caller_number', number).eq('simulated', !!rec.simulated).eq('channel', 'phone').order('last_contact_at', { ascending: false }).limit(5);
    const near = (prior ?? []).find((p: any) => p.last_contact_at && startedAt.getTime() - new Date(p.last_contact_at).getTime() <= MERGE_WINDOW_MS && startedAt.getTime() >= new Date(p.first_contact_at).getTime() - 1000);
    if (near) enquiry = near;
    else {
      const earlier = (prior ?? [])[0];
      if (earlier) history = { priorEnquiryAt: earlier.first_contact_at, priorRef: earlier.ref, priorStatus: earlier.status, existingProject: ['accepted', 'called_back', 'consult_booked'].includes(earlier.status) };
      else if (opts.history) history = { priorEnquiryAt: opts.history.prior_at, priorRef: opts.history.prior_ref, priorStatus: opts.history.prior_status, existingProject: false };
    }
  }

  const callEnd = rec.endedAt ? new Date(rec.endedAt) : new Date(startedAt.getTime() + (rec.durationSec ?? 0) * 1000);
  const afterHours = isAfterHours(startedAt, rules.config.hours);
  if (!enquiry) {
    const ref = must(await db().rpc('next_enquiry_ref', { sim: !!rec.simulated }), 'next ref') as string;
    enquiry = must(await db().from('enquiries').insert({
      ref, channel: 'phone', caller_number: number, first_contact_at: startedAt.toISOString(), last_contact_at: callEnd.toISOString(),
      after_hours: afterHours, simulated: !!rec.simulated, extraction_pending: true, status: 'new',
    }).select('*').single(), 'insert enquiry');
  }

  const cost = rec.costInr ?? vaaniCostInr(rec.durationSec);
  const call = must(await db().from('calls').insert({
    enquiry_id: enquiry.id, provider: rec.provider, provider_call_id: rec.providerCallId, started_at: startedAt.toISOString(), answered_at: iso(rec.answeredAt),
    ring_to_answer_sec: rec.ringToAnswerSec, ended_at: callEnd.toISOString(), duration_sec: rec.durationSec, after_hours: afterHours, answered: rec.answered,
    answered_by: rec.answeredBy, transcript: rec.turns, recording_url: rec.recordingUrl ?? null, raw_payload: rec.raw as object, cost_inr: cost, simulated: !!rec.simulated,
  }).select('id').single(), 'insert call');

  await db().from('enquiries').update({
    merged_call_ids: [...(enquiry.merged_call_ids ?? []), call.id], last_contact_at: callEnd.toISOString(),
  }).eq('id', enquiry.id);
  if (rec.durationSec) await logCost({ source: 'vaani', units: vaaniMinutes(rec.durationSec), amount_inr: cost, call_id: call.id, enquiry_id: enquiry.id, simulated: !!rec.simulated, at: startedAt });

  return { callId: call.id, enquiryId: enquiry.id, merged: !!enquiry.merged_call_ids?.length, history, ref: enquiry.ref };
}

const emptyHistory = (): CallerHistory => ({ priorEnquiryAt: null, priorRef: null, priorStatus: null, existingProject: false });

/** All turns of every call on an enquiry, oldest first (a merged enquiry reads as one conversation). */
async function enquiryTurns(enquiryId: string): Promise<{ turns: Turn[]; rawTurns: Turn[]; callIds: string[] }> {
  const calls = must(await db().from('calls').select('id, transcript, started_at').eq('enquiry_id', enquiryId).order('started_at'), 'calls for enquiry');
  const raw: Turn[] = calls.flatMap((c: any) => (c.transcript ?? []) as Turn[]);
  return { turns: cleanTurns(raw), rawTurns: raw, callIds: calls.map((c: any) => c.id) };
}

export async function processCall(rec: CallRecord, opts: ProcessOptions = {}): Promise<ProcessResult> {
  const t0 = Date.now();
  const sim = !!(opts.simulated ?? rec.simulated);
  rec = { ...rec, simulated: sim };
  const stored = await storeCall(rec, opts);
  const base = { enquiryId: stored.enquiryId, ref: stored.ref, callId: stored.callId, merged: stored.merged };
  if (stored.existed) {
    const { data: e } = await db().from('enquiries').select('verdict').eq('id', stored.enquiryId).single();
    return { ...base, deferred: false, verdict: e?.verdict ?? null, route: null, extraction: null, complianceHits: 0, elapsedMs: Date.now() - t0 };
  }

  // Missed, failed or silent call: nothing to qualify, but someone should still ring the number back.
  if (!rec.answered || !rec.turns.length) {
    const note = rec.answered ? 'The caller was connected but said nothing. Call this number back.' : 'Missed call: no conversation took place. Call this number back.';
    await db().from('enquiries').update({ verdict: 'unsure', category: 'new_enquiry', verdict_source: 'code', handoff_note: note, extraction_pending: false }).eq('id', stored.enquiryId);
    const route = await routeEnquiry(stored.enquiryId, {});
    return { ...base, deferred: false, verdict: 'unsure', route, extraction: null, complianceHits: 0, elapsedMs: Date.now() - t0 };
  }

  // A dropped call carries too little to qualify. Wait out the 15-minute merge window for the caller to ring back.
  if (isThinCall(cleanTurns(rec.turns)) && !stored.merged && !opts.finalizeNow) {
    await db().from('enquiries').update({ extraction_pending: true }).eq('id', stored.enquiryId);
    return { ...base, deferred: true, verdict: null, route: null, extraction: null, complianceHits: 0, elapsedMs: Date.now() - t0 };
  }
  const res = await finalizeEnquiry(stored.enquiryId, { ...opts, simulated: sim, history: undefined }, stored.history, new Date(rec.asIfDate ?? rec.startedAt));
  return { ...base, ...res, elapsedMs: Date.now() - t0 };
}

/** STEPS C-F for an enquiry: read, decide, check compliance, route. Safe to re-run after a merge. */
export async function finalizeEnquiry(
  enquiryId: string, opts: ProcessOptions, history: CallerHistory = emptyHistory(), callDate?: Date,
): Promise<{ deferred: boolean; verdict: string | null; route: RouteOutcome | null; extraction: DecidedExtraction | null; complianceHits: number; geminiMs?: number; error?: string }> {
  const sim = !!opts.simulated;
  const { data: enq } = await db().from('enquiries').select('*').eq('id', enquiryId).single();
  if (!enq) throw new Error('enquiry vanished');
  const { turns, rawTurns, callIds } = await enquiryTurns(enquiryId);
  const when = callDate ?? new Date(enq.first_contact_at);

  if (!geminiConfigured()) {
    await db().from('enquiries').update({ extraction_pending: true }).eq('id', enquiryId);
    return { deferred: true, verdict: null, route: null, extraction: null, complianceHits: 0, error: 'GEMINI_API_KEY is not set, so the call was stored but not read yet.' };
  }

  // STEP C
  const g0 = Date.now();
  let ex;
  try { ex = await extractFromTranscript(turns, when); }
  catch (e) {
    await db().from('enquiries').update({ extraction_pending: true }).eq('id', enquiryId);
    return { deferred: true, verdict: null, route: null, extraction: null, complianceHits: 0, error: (e as Error).message };
  }
  const geminiMs = Date.now() - g0;

  // STEP D
  const rules = await effectiveRules();
  const hist: CallerHistory = history.priorEnquiryAt ? history : await priorHistory(enq);
  const decided = decide({ raw: ex.raw, turns, callDate: when, history: hist, rules });
  const hits = complianceScan(rawTurns); // scans the agent's lines; caller lines are only used to ignore echoed figures

  const cost = geminiCostInr(ex.usage);
  must(await db().from('extractions').insert({
    enquiry_id: enquiryId, fields: decided.fields, criteria: decided.criteria, handoff_note: decided.handoff_note, still_unknown: decided.still_unknown,
    existing_client: decided.existing_client, category: decided.category, suggested_verdict: decided.suggested_verdict, final_verdict: decided.final_verdict,
    verdict_mismatch: decided.verdict_mismatch, caller_mood: decided.caller_mood, price_asked: decided.price_asked, model: ex.model,
    input_tokens: ex.usage.input, output_tokens: ex.usage.output, cost_inr: cost, quotes_verified: decided.quotes_verified, notes: decided.notes,
  }), 'insert extraction');
  await logCost({ source: 'gemini', units: ex.usage.input + ex.usage.output, amount_inr: cost, enquiry_id: enquiryId, call_id: callIds[callIds.length - 1], simulated: sim, meta: { input: ex.usage.input, output: ex.usage.output, model: ex.model } });

  const wasRouted = !!enq.verdict && enq.status !== 'new' && enq.status !== 'closed';
  const prevVerdict = enq.verdict as string | null;
  const noteText = [decided.handoff_note, ...decided.notes.filter((n) => !n.startsWith('Not a fit'))].filter(Boolean).join('\n');
  await db().from('enquiries').update({
    caller_name: decided.fields.name ?? enq.caller_name, category: decided.category, verdict: decided.final_verdict,
    verdict_source: decided.verdict_mismatch ? 'code' : 'gemini', priority: decided.priority, priority_reason: decided.priority_reason,
    referral_name: decided.fields.referral_name, locality: decided.fields.locality, property_type: decided.fields.property_type, handoff_note: noteText,
    extraction_pending: false,
  }).eq('id', enquiryId);

  // compliance flags -> red alert to Nikhil, once per hit
  if (hits.length) {
    const lastCall = callIds[callIds.length - 1];
    const rows = hits.map((h) => ({ call_id: lastCall, enquiry_id: enquiryId, rule: h.rule, excerpt: h.excerpt, simulated: sim }));
    must(await db().from('compliance_flags').insert(rows), 'insert flags');
    const url = `${appBase()}/brief/${enq.ref}`;
    await send({ kind: 'compliance', to: { type: 'nikhil' }, enquiryId, simulated: sim, email: emailCompliance(enq.ref, hits, url) });
    await db().from('compliance_flags').update({ notified_at: new Date().toISOString() }).eq('enquiry_id', enquiryId).is('notified_at', null);
  }

  // STEP E: route (do not double-send a handoff that already went out for the same verdict)
  let route: RouteOutcome | null = null;
  const alreadyHandedOff = wasRouted && prevVerdict === decided.final_verdict && decided.final_verdict === 'qualified';
  if (alreadyHandedOff) route = { kind: 'logged' };
  else route = await routeEnquiry(enquiryId, { designerId: opts.designerId });
  await syncEnquiry(enquiryId); // HubSpot: contact + deal + brief note (never throws; failures are retried by the 5-minute tick)
  return { deferred: false, verdict: decided.final_verdict, route, extraction: decided, complianceHits: hits.length, geminiMs };
}

async function priorHistory(enq: any): Promise<CallerHistory> {
  if (!enq.caller_number) return emptyHistory();
  const { data } = await db().from('enquiries').select('ref, first_contact_at, status').eq('caller_number', enq.caller_number).eq('simulated', enq.simulated).neq('id', enq.id).lt('first_contact_at', enq.first_contact_at).order('first_contact_at', { ascending: false }).limit(1);
  const p = data?.[0];
  return p ? { priorEnquiryAt: p.first_contact_at, priorRef: p.ref, priorStatus: p.status, existingProject: ['accepted', 'called_back', 'consult_booked'].includes(p.status) } : emptyHistory();
}

/** Dropped calls that never rang back: after the merge window, qualify them with what we have (usually "unsure"). */
export async function finalizePendingEnquiries(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MERGE_WINDOW_MS).toISOString();
  const { data } = await db().from('enquiries').select('id, simulated').eq('extraction_pending', true).lt('last_contact_at', cutoff).limit(20);
  let n = 0;
  for (const e of data ?? []) { const r = await finalizeEnquiry(e.id, { simulated: e.simulated }); if (!r.deferred) n++; }
  return n;
}

export const hasKeys = () => ({ gemini: !!env('GEMINI_API_KEY'), resend: !!env('RESEND_API_KEY') });
export { loadLead };
