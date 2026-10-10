// Rehearsal Room engine: replays fixtures or pasted transcripts through STEPS B-F exactly like a real call
// (marked simulated), plus a text chat that uses the SAME system prompt as the voice agent.
import { generateChat } from './ai/gemini';
import { logCost, geminiCostInr } from './cost';
import { db, getSetting, setSetting } from './db';
import { appBase } from './env';
import { fixtureById, type Fixture } from './fixtures';
import { loadLead, getDesigner } from './leads';
import { runLadder } from './ladder';
import { cleanTurns } from './pipeline/clean';
import { processCall, type ProcessResult } from './pipeline/run';
import { buildAgentPrompt, defaultRules } from './rules/defaults';
import { liveRules } from './rules/store';
import {
  emailBatch, emailCompliance, emailConsultation, emailDay, emailEscalation, emailHandoff, emailMoved, emailUnassigned, headline,
} from './notify/templates';
import type { CallRecord, Turn } from './types';
import { fmtTime } from './time';

const rnd = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const uid = () => Math.random().toString(36).slice(2, 10);

export interface RehearsalResult extends Partial<ProcessResult> { fixture?: string; skipped?: boolean; message?: string; results?: ProcessResult[] }

export async function runFixture(id: string, o: { designerId?: string } = {}): Promise<RehearsalResult> {
  const fx = fixtureById(id);
  if (!fx) throw new Error(`Unknown fixture ${id}`);
  if (fx.missed) {
    return { fixture: id, skipped: true, message: `Missed call at ${fx.started_at.slice(11, 16)}: ${fx.staff_note ?? ''} With the assistant this call is now answered within seconds, day or night, and the caller is qualified like any other. Routing skipped (no transcript).` };
  }
  const number = '+91900' + rnd(7); // fresh number per run so repeated rehearsals never merge
  const results: ProcessResult[] = [];
  const calls = [...fx.calls].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const t0 = Date.now();
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const started = new Date(Date.now() + i * 1000); // real now; the model gets the fixture's own date via asIfDate
    const rec: CallRecord = {
      provider: 'rehearsal', providerCallId: `sim-${id}-${uid()}`, channel: 'phone', callerNumber: number,
      startedAt: started.toISOString(), endedAt: new Date(started.getTime() + c.duration_sec * 1000).toISOString(), ringToAnswerSec: 3, durationSec: c.duration_sec,
      answered: true, answeredBy: 'agent', turns: c.turns, raw: { fixture: id, staff_note: fx.staff_note }, simulated: true, asIfDate: calls[0].started_at,
      costInr: undefined,
    };
    results.push(await processCall(rec, { simulated: true, designerId: o.designerId, history: fx.history, finalizeNow: i === calls.length - 1 }));
  }
  const last = results[results.length - 1];
  return { ...last, fixture: id, results, elapsedMs: Date.now() - t0 };
}

/** Parse pasted text: lines starting "Caller:" / "Front Desk:" / "Assistant:" / "Agent:". */
export function parsePasted(text: string): Turn[] {
  const turns: Turn[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(caller|customer|user|client|front desk|assistant|agent|bot|ai)\s*:\s*(.*)$/i);
    if (m) turns.push({ speaker: /caller|customer|user|client/i.test(m[1]) ? 'caller' : 'agent', text: m[2].trim() });
    else if (line.trim() && turns.length) turns[turns.length - 1].text += ' ' + line.trim();
  }
  return turns;
}

export async function runPasted(text: string, o: { designerId?: string; asIfDate?: string } = {}): Promise<RehearsalResult> {
  const turns = parsePasted(text);
  if (!turns.some((t) => t.speaker === 'caller')) throw new Error('No "Caller:" lines found. Start each line with "Caller:" or "Assistant:".');
  const now = new Date();
  const rec: CallRecord = {
    provider: 'rehearsal', providerCallId: `sim-paste-${uid()}`, channel: 'phone', callerNumber: '+91900' + rnd(7), startedAt: now.toISOString(),
    endedAt: new Date(now.getTime() + 180_000).toISOString(), ringToAnswerSec: 3, durationSec: 180, answered: true, answeredBy: 'agent', turns, raw: { pasted: true }, simulated: true, asIfDate: o.asIfDate,
  };
  const r = await processCall(rec, { simulated: true, designerId: o.designerId, finalizeNow: true });
  return { ...r, fixture: 'pasted' };
}

/** "Talk to the agent": same system prompt as the voice agent (approved version, or the default draft). */
export async function chatWithAgent(history: { role: 'user' | 'model'; text: string }[]): Promise<{ reply: string; version: number; approved: boolean }> {
  const rules = (await liveRules()) ?? ({ version: 0, ...defaultRules() } as any);
  const system = buildAgentPrompt(rules) + `\n\n[Rehearsal: this is a text chat standing in for a phone call. Speak briefly, as you would on the phone. The caller's number is not known unless they say it. Current time in Pune: ${fmtTime(new Date())}.]`;
  const msgs = history.length ? history : [{ role: 'user' as const, text: '(The caller has just been connected. Begin with your opening line.)' }];
  const r = await generateChat({ system, messages: msgs });
  await logCost({ source: 'gemini', units: r.usage.input + r.usage.output, amount_inr: geminiCostInr(r.usage), simulated: true, meta: { rehearsal: 'chat' } });
  return { reply: r.text.trim(), version: rules.version, approved: !!rules.approved_at };
}

// ---------------------------------------------------------------- fast-forward clock (simulated enquiries only)
export async function getClockOffset(): Promise<number> { return getSetting<number>('sim_clock_offset_min', 0); }
export async function advanceClock(minutes: number | 'reset'): Promise<{ offset: number; events: Awaited<ReturnType<typeof runLadder>> }> {
  const cur = await getClockOffset();
  const offset = minutes === 'reset' ? 0 : cur + minutes;
  await setSetting('sim_clock_offset_min', offset);
  const events = await runLadder({ now: new Date(Date.now() + offset * 60_000), simulated: true });
  return { offset, events };
}

// ---------------------------------------------------------------- notification preview (renders only: nothing is sent)
export interface Preview { title: string; channel: 'email'; subject: string; html: string; text: string; note?: string }

export async function previewFor(ref: string, designerId?: string): Promise<Preview[]> {
  const lead = await loadLead(ref);
  if (!lead) throw new Error('Enquiry not found');
  const designer = designerId ? await getDesigner(designerId) : lead.assignedDesignerId ? await getDesigner(lead.assignedDesignerId) : null;
  const did = designer?.id ?? '00000000-0000-0000-0000-000000000000';
  const name = designer?.name ?? 'Priya Kulkarni';
  const now = new Date();
  const base = appBase();
  const brief = `${base}/me/lead/${lead.ref}`, dash = `${base}/brief/${lead.ref}`;
  const item = { ref: lead.ref, headline: headline(lead), due: lead.callbackDue, briefUrl: brief, number: lead.callerNumber };
  void did;
  const mk = (title: string, m: { subject: string; html: string; text: string }, note?: string): Preview => ({ title, channel: 'email', ...m, note });
  return [
    mk('T+0 · Handoff to the designer on duty', emailHandoff(lead, { openUrl: brief }), lead.afterHours ? 'After hours: it is sent at once and waits in the inbox; the ladder clock starts at 09:30.' : 'In designer hours: the 1-hour callback clock is running.'),
    mk('T+10 min · "Still waiting" reminder (same buttons)', emailHandoff(lead, { openUrl: brief, reminder: true })),
    mk('T+15 min · the first designer is told it moved', emailMoved(lead, 'Rhea Shah')),
    mk('After 2 reassignments · front desk', emailUnassigned(lead, 'Nobody accepted after 2 reassignments.', dash)),
    mk('Due −15 min · callback reminder (batched into one email)', emailBatch('Callbacks due soon', [item], now)),
    mk('Existing client · escalation to Nikhil + the senior person', emailEscalation(lead, { briefUrl: dash, repeat: 0 }), 'Repeats every 10 minutes until someone opens it and takes ownership.'),
    mk('House Rule broken · red alert to Nikhil', emailCompliance(lead.ref, [{ rule: 'price_figure', excerpt: '…it will cost around ₹2,000 per sq ft…' }], dash), 'Example excerpt: only sent when a breach is detected.'),
    mk('9:30 "Your day"', emailDay(name, [{ title: 'Callbacks due today', items: [item] }], now, brief)),
    mk('Consultation booked · calendar invite', emailConsultation({ headline: headline(lead), ref: lead.ref, when: new Date(now.getTime() + 2 * 86_400_000), location: 'Client site', number: lead.callerNumber, note: lead.note }), 'The real email carries a .ics attachment.'),
  ];
}

export { cleanTurns, db };
export type { Fixture };
