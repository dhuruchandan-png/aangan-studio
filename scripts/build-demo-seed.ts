// npm run demo:seed-sql  →  db/demo_seed.sql
// Sample data for reviewers: the 20 real phone transcripts (T01–T20), run through the REAL rules engine
// (decide()) using the hand-written golden extractions, then spread across the 14 employees with realistic
// statuses, handoffs, a reassignment, an escalation and an audit trail.
// Every row is stored with simulated = true, so it never mixes with real numbers: when DEMO_OPEN is turned
// off, the sample rows drop out of every figure. Dates are fixed (Sept–Oct 2026); costs use invented rates.
import { writeFileSync } from 'node:fs';
import { PHONE_FIXTURES, type Fixture } from '../lib/fixtures';
import { cleanTurns } from '../lib/pipeline/clean';
import { decide } from '../lib/pipeline/decide';
import { callbackPromise, istParts } from '../lib/time';
import { GOLDEN } from './golden';

const NOTES: Record<string, string> = {
  T01: 'Priya, 3BHK in Kothrud (Dahanukar Colony), ~1,400 sq ft carpet, still the builder finish.\nWants the whole flat redone: kitchen, living room, both bedrooms.\nWants it done by March and is in no rush. Owner, with her husband (he agrees).\nReferred by Shruti Joshi (past client, Aundh).\nTo ask: style preference, and whether they want a site visit.',
  T02: '2BHK in Wakad, about 950 sq ft. Found us on Instagram.\nFull redesign: modular kitchen, wardrobes, living room, both bedrooms.\nMoves in November, so design would start in October.\nAsked for a rough price twice; told the designer will cover it at the consultation.\nDecision-maker not discussed.',
  T03: 'Suresh Patil wants his home office and study redone, but the site is in Nashik.\nOutside Pune and PCMC, so politely declined. No designer call promised.',
  T04: 'Wants suggestions on colours and furniture arrangement for a living room, with no execution.\nOur minimum engagement is design plus execution, so declined kindly. Door left open for a full project.',
  T05: 'Aarti Mehta, 4BHK in Koregaon Park, ~2,400 sq ft. Complete redesign: flooring, kitchen, all four bedrooms.\nAlready moved out; wants to be back by February (about 4 months).\nReferred by Vikram Agarwal, a close friend of Nikhil. Prefers a site-visit consultation.\nDecision-maker not discussed.',
  T06: 'Startup founder (decision-maker), first office in Baner, ~800 sq ft, bare shell.\nNeeds 20 workstations, a small cabin, a meeting room and a break area.\nWants to be operational by December.',
  T07: 'Wants the living room and kitchen done before Diwali, about three weeks away.\nThen asked about starting after Diwali, and said he would think and call back.\nNo location given and the timeline is open, so one question is still needed.',
  T08: 'Missed call at 22:47. No conversation took place and no voicemail was left.\nCall this number back (Nanded City area).',
  T09: 'EXISTING CLIENT, frustrated: Sheetal Deshpande, 2BHK in Viman Nagar, project running three months.\nHer designer (Aryan) has not replied in five days; she has sent three messages and called twice.\nShe asked for a callback from Nikhil or a senior person within 15 minutes.',
  T10: 'Kitchen plus one bedroom in a 550 sq ft 1BHK in Kharadi (adjoining Pune).\nVolunteered a budget of 1 to 1.5 lakh for everything, well below what design plus execution needs.\nTold kindly and honestly; no designer call promised.',
  T11: '2BHK in Baner, rented on a 3-year lease, quite bare. Landlord is fine with it, no structural changes.\nWants the living room, bedroom and kitchen properly designed.\nTimeline was not discussed, so the front desk assigned it to a designer to ask first.',
  T12: 'Anand Sharma, new 5,500 sq ft villa in Kalyani Nagar (ground + two floors), possession last month, empty.\nFull end-to-end design; wants to move in by March next year, no rush.\nWould like the principal designer on site this week or next.',
  T13: '3BHK in Aundh, ~1,100 sq ft: kitchen, wardrobes in both bedrooms, living room.\nPushed twice for a price range; told the designer will cover it. Agreed to book a consultation.\nTimeline was not discussed.',
  T14: 'Caller is the son, enquiring for his parents (3BHK in Hadapsar, new possession). Parents decide and will both attend.\nHe is checking whether it is worth pursuing.\nTimeline not discussed; decision-maker not confirmed on the call.',
  T15: 'Smita, 2BHK in Undri, 875 sq ft. Possession in about six weeks; the builder will let us in now.\nFull home: kitchen, wardrobes, living room. Wants to start the design right away.\nOwner, with her husband.',
  T16: 'PRIORITY. Girish Nair, 3BHK in Viman Nagar. Called on Monday and nobody followed up; now frustrated.\nHas not said what work he wants or when. Needs a warm, direct call.',
  T17: 'Ritu Kapoor, 3BHK in Pimple Saudagar, ~1,050 sq ft, lived in two years with basic builder furniture.\nKitchen, wardrobes, living room. Wants it done by March, plenty of time.\nFirst call dropped after a minute; she rang back at once (two calls merged).',
  T18: '180 sq ft coworking pod: lighting, a desk, some storage.\nNo location given. Commercial spaces under 500 sq ft are "check with designer" (rule to confirm with Nikhil).',
  T19: 'Restaurant interiors in Koregaon Park. Restaurants and hospitality are outside our scope.\nDeclined kindly; no designer call promised.',
  T20: 'Pooja, 2BHK in Magarpatta (Cybercity), ~900 sq ft: kitchen, both bedrooms, living room.\nA January start for execution would be ideal. Owner, with her husband; both want to be at the consultation.',
};

// Readable reasons for the criteria the golden data left terse (shown on the lead's criteria cards).
const REASONS: Record<string, Record<string, string>> = {
  T04: { real_project: 'Only wants ideas and suggestions: no design and execution.' },
  T10: { budget: 'Volunteered 1 to 1.5 lakh for a kitchen and a bedroom, far below what design plus execution needs.' },
  T19: { real_project: 'A restaurant is hospitality, which is outside our scope.' },
};
const PASS_REASON = "Clear from the caller's own words (quoted).";

interface Sc {
  date?: string;                 // YYYY-MM-DD override (keeps the fixture's time of day)
  designer?: string;             // final assignee
  firstDesigner?: string;        // handed here first, no Accept, moved on after 15 min
  assignedByFrontDesk?: number;  // minutes after the call the front desk assigned it (unsure leads)
  status: string;
  acceptMin?: number; callbackMin?: number;
  consult?: { daysAfter: number; hour: number; minute?: number; location?: 'site' | 'studio' };
  fdCalledMin?: number;          // front desk called the client (minutes after the call, or the next morning)
  ackMin?: number;
  notes?: string;
}
const SC: Record<string, Sc> = {
  T01: { designer: 'Priya Kulkarni', status: 'consult_booked', acceptMin: 6, callbackMin: 28, consult: { daysAfter: 3, hour: 11 } },
  T02: { designer: 'Rhea Shah', status: 'called_back', acceptMin: 4, callbackMin: 41 },
  T03: { status: 'closed' }, T04: { status: 'closed' },
  T05: { designer: 'Pooja Kelkar', status: 'consult_booked', acceptMin: 3, callbackMin: 20, consult: { daysAfter: 2, hour: 10, minute: 30 } },
  T06: { designer: 'Karan Mehta', status: 'consult_booked', acceptMin: 9, callbackMin: 35, consult: { daysAfter: 4, hour: 15, location: 'studio' } },
  T07: { status: 'called_back', fdCalledMin: 1470 },
  T08: { status: 'called_back', fdCalledMin: 700 },
  T09: { status: 'accepted', ackMin: 6 },
  T10: { status: 'closed' },
  T11: { date: '2026-10-01', designer: 'Neha Deshmukh', assignedByFrontDesk: 140, status: 'consult_booked', acceptMin: 12, callbackMin: 50, consult: { daysAfter: 4, hour: 12 } },
  T12: { date: '2026-10-02', designer: 'Aryan Joshi', status: 'consult_booked', acceptMin: 5, callbackMin: 18, consult: { daysAfter: 10, hour: 11 } },
  T13: { date: '2026-10-05', designer: 'Sneha Patil', assignedByFrontDesk: 25, status: 'accepted', acceptMin: 8 },
  T14: { date: '2026-10-06', designer: 'Omkar Bhosale', assignedByFrontDesk: 60, status: 'called_back', acceptMin: 10, callbackMin: 75 },
  T15: { date: '2026-10-06', firstDesigner: 'Isha Kapoor', designer: 'Tanmay Jadhav', status: 'called_back', acceptMin: 7, callbackMin: 30 },
  T16: { date: '2026-10-07', designer: 'Meera Pawar', assignedByFrontDesk: 12, status: 'called_back', acceptMin: 3, callbackMin: 22 },
  T17: { date: '2026-10-07', designer: 'Siddhesh Rane', status: 'called_back', acceptMin: 5, callbackMin: 22 },
  T18: { date: '2026-10-08', status: 'routed' },
  T19: { date: '2026-10-08', status: 'closed' },
  T20: { date: '2026-10-08', designer: 'Anjali Gokhale', status: 'accepted', acceptMin: 11 },
};

// ------------------------------------------------------------------ SQL helpers
const dq = (s: string) => { if (s.includes('$q$')) throw new Error('dollar-quote clash'); return `$q$${s}$q$`; };
const lit = (v: unknown): string => v == null ? 'null' : typeof v === 'boolean' ? String(v) : typeof v === 'number' ? String(v) : dq(String(v));
const ts = (d: Date | null) => (d ? `'${d.toISOString()}'::timestamptz` : 'null');
const js = (o: unknown) => `${dq(JSON.stringify(o))}::jsonb`;
const des = (name: string) => `_dd(${lit(name)})`;
const mins = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const withDate = (iso: string, date?: string) => (date ? date + iso.slice(10) : iso);

const out: string[] = [
  '-- helper lookups (dropped at the end)',
  'create or replace function public._de(r text) returns uuid language sql stable set search_path = public as $$ select id from enquiries where ref = r $$;',
  'create or replace function public._dd(n text) returns uuid language sql stable set search_path = public as $$ select id from designers where name = n $$;',
  'create or replace function public._dc(p text) returns uuid language sql stable set search_path = public as $$ select id from calls where provider_call_id = p $$;',
  '-- SAMPLE DATA for reviewers. Generated by scripts/build-demo-seed.ts. All rows are simulated=true.',
  '-- Re-running inserts duplicates of the DEMO-xx refs, so run it once.',
];
const add = (s: string) => out.push(s);

PHONE_FIXTURES.forEach((fx: Fixture, i: number) => {
  const sc = SC[fx.id];
  const ref = `DEMO-${String(i + 1).padStart(2, '0')}`;
  const E = `_de('${ref}')`;
  const calls = [...fx.calls].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const first = fx.missed ? new Date(withDate(fx.started_at, sc.date)) : new Date(withDate(calls[0].started_at, sc.date));
  const lastCall = fx.missed ? null : calls[calls.length - 1];
  const lastStart = lastCall ? new Date(withDate(lastCall.started_at, sc.date)) : first;
  const callEnd = lastCall ? mins(lastStart, lastCall.duration_sec / 60) : first;
  const afterHours = istParts(first).dow === 0 || istParts(first).h < 10 || istParts(first).h >= 19;
  const callIds: string[] = [];

  // ---- verdict from the REAL rules engine
  let verdict = 'unsure', category = 'new_enquiry', priority = false, priorityReason: string | null = null;
  let decided: ReturnType<typeof decide> | null = null;
  if (!fx.missed) {
    const turns = cleanTurns(calls.flatMap((c) => c.turns));
    const hist = fx.history ? { priorEnquiryAt: fx.history.prior_at, priorRef: fx.history.prior_ref, priorStatus: fx.history.prior_status, existingProject: false } : null;
    const raw = structuredClone(GOLDEN[fx.id]);
    for (const c of raw.criteria) c.reason = REASONS[fx.id]?.[c.key] ?? (c.status === 'pass' ? PASS_REASON : c.status === 'unclear' ? 'Not discussed on the call.' : c.reason);
    decided = decide({ raw, turns, callDate: first, history: hist });
    verdict = decided.final_verdict; category = decided.category; priority = decided.priority; priorityReason = decided.priority_reason;
  }
  const promise = callbackPromise(callEnd);
  const due = verdict === 'escalate' ? mins(callEnd, 15) : verdict === 'unsure' ? new Date(callbackPromise(callEnd, undefined, '11:00').dueAt) : promise.dueAt;
  const f = decided?.fields;
  const note = [NOTES[fx.id], ...(decided?.notes ?? []).filter((n) => !n.startsWith('Not a fit'))].filter(Boolean).join('\n');
  const designerName = sc.designer ?? null;

  // ---- handoff timeline
  const handoffs: { to: string; sent: Date; accepted: Date | null; reassigned: Date | null; from: string | null; nudges: number }[] = [];
  const log: { actorType: 'designer' | 'admin' | 'system'; actor: string; action: string; detail: string; at: Date }[] = [];
  let calledBackAt: Date | null = null, consultAt: Date | null = null, consultBookedAt: Date | null = null, ackAt: Date | null = null, fdHandledAt: Date | null = null;
  let acceptedAt: Date | null = null;
  const sentAt = sc.assignedByFrontDesk ? mins(callEnd, sc.assignedByFrontDesk) : mins(callEnd, 1);

  if (verdict === 'qualified' && designerName) {
    if (sc.firstDesigner) {
      handoffs.push({ to: sc.firstDesigner, sent: sentAt, accepted: null, reassigned: mins(sentAt, 15), from: null, nudges: 1 });
      log.push({ actorType: 'system', actor: 'The assistant', action: 'handoff_sent', detail: `Lead emailed to ${sc.firstDesigner}`, at: sentAt });
      log.push({ actorType: 'system', actor: 'The assistant', action: 'reminder_sent', detail: `Reminder emailed to ${sc.firstDesigner}`, at: mins(sentAt, 10) });
      log.push({ actorType: 'system', actor: 'The assistant', action: 'reassigned', detail: `${sc.firstDesigner} → ${designerName} (no Accept in 15 minutes)`, at: mins(sentAt, 15) });
      const s2 = mins(sentAt, 15);
      acceptedAt = mins(s2, sc.acceptMin ?? 5);
      handoffs.push({ to: designerName, sent: s2, accepted: acceptedAt, reassigned: null, from: sc.firstDesigner, nudges: 0 });
      log.push({ actorType: 'system', actor: 'The assistant', action: 'handoff_sent', detail: `Lead emailed to ${designerName}`, at: s2 });
    } else {
      acceptedAt = mins(sentAt, sc.acceptMin ?? 5);
      handoffs.push({ to: designerName, sent: sentAt, accepted: acceptedAt, reassigned: null, from: null, nudges: 0 });
      log.push({ actorType: 'system', actor: 'The assistant', action: 'handoff_sent', detail: `Lead emailed to ${designerName}`, at: sentAt });
    }
  } else if (verdict === 'unsure' && designerName && sc.assignedByFrontDesk) {
    log.push({ actorType: 'admin', actor: 'Front desk', action: 'assign', detail: `Assigned the lead · ${designerName}`, at: sentAt });
    acceptedAt = mins(sentAt, sc.acceptMin ?? 8);
    handoffs.push({ to: designerName, sent: sentAt, accepted: acceptedAt, reassigned: null, from: null, nudges: 0 });
    log.push({ actorType: 'system', actor: 'The assistant', action: 'handoff_sent', detail: `Lead emailed to ${designerName}`, at: sentAt });
  }
  if (designerName && acceptedAt) log.push({ actorType: 'designer', actor: designerName, action: 'accept', detail: 'Accepted the lead', at: acceptedAt });
  if (designerName && sc.callbackMin && acceptedAt) { calledBackAt = mins(acceptedAt, sc.callbackMin - (sc.acceptMin ?? 0) > 0 ? sc.callbackMin - (sc.acceptMin ?? 0) : 10); log.push({ actorType: 'designer', actor: designerName, action: 'called_back', detail: 'Called the client back', at: calledBackAt }); }
  if (designerName && sc.consult && calledBackAt) {
    consultBookedAt = mins(calledBackAt, 4);
    const day = new Date(lastStart.getTime() + sc.consult.daysAfter * 86_400_000);
    const p = istParts(day);
    consultAt = new Date(Date.UTC(p.y, p.m - 1, p.d, sc.consult.hour, sc.consult.minute ?? 0) - 330 * 60_000);
    log.push({ actorType: 'designer', actor: designerName, action: 'book', detail: `Booked a consultation · ${consultAt.toISOString().slice(0, 10)}`, at: consultBookedAt });
  }
  if (verdict === 'escalate') {
    ackAt = mins(callEnd, sc.ackMin ?? 6);
    log.push({ actorType: 'system', actor: 'The assistant', action: 'escalated', detail: 'Emailed Nikhil and the senior person', at: mins(callEnd, 1) });
    log.push({ actorType: 'admin', actor: 'Nikhil Deshpande', action: 'ack', detail: 'Took ownership of the escalation', at: ackAt });
  }
  if (sc.fdCalledMin) {
    fdHandledAt = mins(callEnd, sc.fdCalledMin);
    log.push({ actorType: 'admin', actor: 'Front desk', action: 'fd_called', detail: 'Front desk called the client', at: fdHandledAt });
  }
  if (verdict === 'unsure' && fx.id === 'T16') log.push({ actorType: 'system', actor: 'The assistant', action: 'needs_designer', detail: 'PRIORITY caller: emailed the front desk to call straight away', at: mins(callEnd, 1) });
  if (verdict === 'unsure' && fx.id === 'T18') log.push({ actorType: 'system', actor: 'The assistant', action: 'needs_designer', detail: 'Commercial space under 500 sq ft: front desk to check with a designer', at: mins(callEnd, 1) });

  // ---- enquiry
  const status = sc.status;
  add(`insert into enquiries (ref, channel, caller_number, caller_name, first_contact_at, last_contact_at, merged_call_ids, category, verdict, verdict_source, priority, priority_reason, referral_name, status, callback_due_at, assigned_designer_id, locality, property_type, handoff_note, after_hours, simulated, extraction_pending, escalated_at, last_escalation_at, escalation_acked_at, unassigned_alert_at, frontdesk_handled_at) values (${[
    lit(ref), "'phone'", lit(fx.caller_number), lit(f?.name ?? null), ts(first), ts(callEnd), 'ARRAY[]::uuid[]', lit(category), lit(verdict), "'code'", lit(priority), lit(priorityReason), lit(f?.referral_name ?? null), lit(status),
    verdict === 'not_a_fit' || verdict === 'other' ? 'null' : ts(due), designerName ? des(designerName) : 'null', lit(f?.locality ?? null), lit(f?.property_type ?? null), lit(note), lit(afterHours), 'true', 'false',
    verdict === 'escalate' ? ts(mins(callEnd, 1)) : 'null', verdict === 'escalate' ? ts(mins(callEnd, 1)) : 'null', ts(ackAt),
    (fx.id === 'T16' || fx.id === 'T18') ? ts(mins(callEnd, 1)) : 'null', ts(fdHandledAt)].join(', ')});`);

  // ---- calls
  if (fx.missed) {
    add(`insert into calls (enquiry_id, provider, provider_call_id, started_at, ended_at, duration_sec, after_hours, answered, answered_by, transcript, simulated, cost_inr) values (${[E, "'demo'", lit('demo-' + fx.id), ts(first), ts(first), '0', lit(afterHours), 'false', "'agent'", js([]), 'true', '0'].join(', ')});`);
  } else {
    calls.forEach((c, k) => {
      const pcid = `demo-${fx.id}-${k + 1}`;
      const st = new Date(withDate(c.started_at, sc.date)), en = mins(st, c.duration_sec / 60);
      const ring = [2.6, 3.1, 2.8, 3.4, 2.9][(i + k) % 5];
      const minutes = Math.ceil(c.duration_sec / 60);
      add(`insert into calls (enquiry_id, provider, provider_call_id, started_at, answered_at, ring_to_answer_sec, ended_at, duration_sec, after_hours, answered, answered_by, transcript, simulated, cost_inr) values (${[E, "'demo'", lit(pcid), ts(st), ts(new Date(st.getTime() + ring * 1000)), String(ring), ts(en), String(c.duration_sec), lit(istParts(st).dow === 0 || istParts(st).h < 10 || istParts(st).h >= 19), 'true', "'agent'", js(c.turns), 'true', String(minutes * 6)].join(', ')});`);
      add(`insert into cost_ledger (date, source, units, amount_inr, call_id, enquiry_id, simulated, meta) values (${[lit(st.toISOString().slice(0, 10)), "'vaani'", String(minutes), String(minutes * 6), `_dc(${lit(pcid)})`, E, 'true', js({ sample: true })].join(', ')});`);
    });
    add(`update enquiries set merged_call_ids = array(select id from calls where enquiry_id = ${E} order by started_at) where id = ${E};`);
    add(`insert into cost_ledger (date, source, units, amount_inr, enquiry_id, simulated, meta) values (${[lit(callEnd.toISOString().slice(0, 10)), "'gemini'", '3250', '0.42', E, 'true', js({ sample: true })].join(', ')});`);
  }

  // ---- extraction
  if (decided) {
    add(`insert into extractions (enquiry_id, fields, criteria, handoff_note, still_unknown, existing_client, category, suggested_verdict, final_verdict, verdict_mismatch, caller_mood, price_asked, model, input_tokens, output_tokens, cost_inr, quotes_verified, notes, created_at) values (${[
      E, js(decided.fields), js(decided.criteria), lit(NOTES[fx.id]), js(fx.id === 'T01' ? ['style preference', 'whether they want a site visit'] : fx.id === 'T12' ? ['site visit date', 'style preference'] : verdict === 'unsure' ? ['timeline', 'what work is wanted'] : []),
      fx.id === 'T09' ? js({ designer_name: 'Aryan', project: '2BHK in Viman Nagar, three months in' }) : 'null', lit(category), lit(decided.suggested_verdict), lit(verdict), lit(decided.verdict_mismatch), lit(decided.caller_mood), lit(decided.price_asked),
      "'gemini-2.5-flash'", '2800', '450', '0.42', lit(decided.quotes_verified), js(decided.notes), ts(mins(callEnd, 0.5))].join(', ')});`);
  }

  // ---- handoffs, notifications, log, outcomes, consultation
  for (const h of handoffs) {
    add(`insert into handoffs (enquiry_id, designer_id, sent_at, silent, accepted_at, accepted_via, reassigned_from, reassigned_at, nudges_sent, last_nudge_at, nudge_email_sent_at, simulated) values (${[
      E, des(h.to), ts(h.sent), lit(afterHours), ts(h.accepted), h.accepted ? "'dashboard'" : 'null', h.from ? des(h.from) : 'null', ts(h.reassigned), String(h.nudges), h.nudges ? ts(mins(h.sent, 10)) : 'null', h.nudges ? ts(mins(h.sent, 10)) : 'null', 'true'].join(', ')});`);
    add(`insert into notifications (recipient_type, recipient_id, enquiry_id, channel, kind, payload, sent_at, delivered, simulated, acted_at, action, acted_via) values (${[
      "'designer'", des(h.to), E, "'email'", "'handoff'", js({ subject: `New enquiry · ${f?.name ?? 'Caller'} · ${f?.locality ?? ''}`, for: h.to, sample: true }), ts(h.sent), 'true', 'true', ts(h.accepted), h.accepted ? "'accept'" : 'null', h.accepted ? "'dashboard'" : 'null'].join(', ')});`);
  }
  for (const e of log) {
    add(`insert into actions_log (enquiry_id, actor_type, actor_id, actor_name, action, detail, via, at) values (${[E, lit(e.actorType), e.actorType === 'designer' ? des(e.actor) : 'null', lit(e.actor), lit(e.action), lit(e.detail), e.actorType === 'system' ? 'null' : "'dashboard'", ts(e.at)].join(', ')});`);
  }
  if (calledBackAt || consultBookedAt || fdHandledAt) {
    add(`insert into outcomes (enquiry_id, called_back_at, called_back_via, consult_booked_at) values (${[E, ts(calledBackAt ?? fdHandledAt), lit(calledBackAt ? 'dashboard' : 'frontdesk'), ts(consultBookedAt)].join(', ')});`);
  }
  if (consultAt && designerName) {
    add(`insert into consultations (enquiry_id, designer_id, scheduled_at, location, ics_sent_at) values (${[E, des(designerName), ts(consultAt), lit(sc.consult?.location ?? 'site'), ts(consultBookedAt)].join(', ')});`);
  }
});

out.push('drop function public._de(text); drop function public._dd(text); drop function public._dc(text);');
writeFileSync('db/demo_seed.sql', out.join('\n') + '\n');
console.log(`Wrote db/demo_seed.sql: ${out.length - 2} statements, ${(out.join('\n').length / 1024).toFixed(0)} KB`);
