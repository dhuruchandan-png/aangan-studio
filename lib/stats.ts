import { simScope } from './demo';
// Numbers for The Courtyard, the summaries and the reports. Volumes are small (~200 enquiries a month),
// so we fetch the month's rows and aggregate in TypeScript. Simulated (rehearsal) rows are always excluded.
import { db, getSetting, must } from './db';
import { addDays, istDayKey, istParts, median, startOfIstDay } from './time';

export interface DesignerStat { id: string; name: string; handoffs: number; medianAcceptMin: number | null; calledBackOnTimePct: number | null; consults: number; nudged: number; movedAway: number; hasEmail: boolean }
export interface Stats {
  range: { start: string; end: string };
  calls: number; answered: number; answeredPct: number | null; medianRingSec: number | null; afterHoursCalls: number; afterHoursPct: number | null;
  byHour: { hour: number; calls: number }[];
  verdicts: Record<string, number>;
  qualified: number; handedUnder5Pct: number | null; acceptedUnder15Pct: number | null; callbackKeptPct: number | null;
  consultations: number; escalations: number; ruleBreaks: number; missedPromises: number;
  callbackBuckets: { label: string; n: number }[];
  daily: { day: string; calls: number; answered: number }[];
  cost: { vaani: number; gemini: number; fixed: number; total: number };
  costPerCall: number | null; costPerQualified: number | null; costPerConsult: number | null;
  avgProjectValue: number; pipeline: number; pipelineRatio: number | null;
  reach: { medianAcceptMin: number | null; via: Record<string, number>; viaPct: Record<string, number | null>; nudgesPerLead: number | null; reassignments: number; noEmail: string[] };
  designers: DesignerStat[];
}

const pct = (n: number, d: number): number | null => (d ? Math.round((n / d) * 100) : null);
const mins = (a: string | Date, b: string | Date) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
const inChunks = <T>(xs: T[], n = 100): T[][] => { const o: T[][] = []; for (let i = 0; i < xs.length; i += n) o.push(xs.slice(i, i + n)); return o; };

async function byIds(table: string, col: string, ids: string[], select = '*'): Promise<any[]> {
  const out: any[] = [];
  for (const c of inChunks(ids)) out.push(...must(await db().from(table).select(select).in(col, c), `stats ${table}`));
  return out;
}

export async function computeStats(start: Date, end: Date): Promise<Stats> {
  const s = start.toISOString(), e = end.toISOString();
  const [calls, enquiries, flags, ledger, consultOutcomes, designers, avgVal] = await Promise.all([
    db().from('calls').select('id, enquiry_id, started_at, ended_at, answered, ring_to_answer_sec, after_hours').in('simulated', simScope()).gte('started_at', s).lt('started_at', e).then((r) => must(r, 'calls')),
    db().from('enquiries').select('id, ref, verdict, status, category, first_contact_at, callback_due_at, assigned_designer_id, missed_promise_at').in('simulated', simScope()).gte('first_contact_at', s).lt('first_contact_at', e).then((r) => must(r, 'enquiries')),
    db().from('compliance_flags').select('id, resolved_at').in('simulated', simScope()).gte('created_at', s).lt('created_at', e).then((r) => must(r, 'flags')),
    db().from('cost_ledger').select('source, amount_inr').in('simulated', simScope()).gte('date', istDayKey(start)).lt('date', istDayKey(end)).then((r) => must(r, 'ledger')),
    db().from('outcomes').select('enquiry_id').gte('consult_booked_at', s).lt('consult_booked_at', e).then((r) => must(r, 'outcomes')),
    db().from('designers').select('id, name, active, email').order('name').then((r) => must(r, 'designers')),
    getSetting<number | string>('avg_project_value_inr', 1_100_000),
  ]);

  const ids = enquiries.map((x: any) => x.id as string);
  const [handoffs, outcomes, enqCalls] = ids.length
    ? await Promise.all([byIds('handoffs', 'enquiry_id', ids), byIds('outcomes', 'enquiry_id', ids), byIds('calls', 'enquiry_id', ids, 'enquiry_id, ended_at')])
    : [[], [], []];

  // ---- calls
  const answered = calls.filter((c: any) => c.answered);
  const ring = answered.map((c: any) => Number(c.ring_to_answer_sec)).filter((x: number) => isFinite(x));
  const afterHours = calls.filter((c: any) => c.after_hours).length;
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, calls: 0 }));
  for (const c of calls) byHour[istParts(new Date(c.started_at)).h].calls++;
  const daily: Stats['daily'] = [];
  for (let d = startOfIstDay(start); d < end && daily.length < 32; d = addDays(d, 1)) {
    const k = istDayKey(d);
    const day = calls.filter((c: any) => istDayKey(new Date(c.started_at)) === k);
    daily.push({ day: k, calls: day.length, answered: day.filter((c: any) => c.answered).length });
  }

  // ---- verdicts + funnel
  const verdicts: Record<string, number> = {};
  for (const x of enquiries) verdicts[x.verdict ?? 'pending'] = (verdicts[x.verdict ?? 'pending'] ?? 0) + 1;
  const qualifiedE = enquiries.filter((x: any) => x.verdict === 'qualified');
  const escalations = enquiries.filter((x: any) => x.verdict === 'escalate').length;
  const hByEnq = new Map<string, any[]>();
  for (const h of handoffs) hByEnq.set(h.enquiry_id, [...(hByEnq.get(h.enquiry_id) ?? []), h]);
  for (const arr of hByEnq.values()) arr.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  const lastEnd = new Map<string, string>();
  for (const c of enqCalls) if (c.ended_at && (!lastEnd.get(c.enquiry_id) || c.ended_at > lastEnd.get(c.enquiry_id)!)) lastEnd.set(c.enquiry_id, c.ended_at);
  const outBy = new Map<string, any>(outcomes.map((o: any) => [o.enquiry_id, o]));

  const handed = [...hByEnq.entries()].filter(([id]) => ids.includes(id));
  const under5 = handed.filter(([id, hs]) => lastEnd.get(id) && mins(lastEnd.get(id)!, hs[0].sent_at) <= 5).length;
  const withEnd = handed.filter(([id]) => lastEnd.get(id)).length;
  const acceptedFast = handed.filter(([, hs]) => hs.some((h) => h.accepted_at && mins(h.sent_at, h.accepted_at) <= 15)).length;
  const dueQ = qualifiedE.filter((x: any) => x.callback_due_at && (outBy.get(x.id)?.called_back_at || new Date(x.callback_due_at) < new Date()));
  const kept = dueQ.filter((x: any) => { const o = outBy.get(x.id); return o?.called_back_at && new Date(o.called_back_at) <= new Date(x.callback_due_at); }).length;

  const buckets = [{ label: 'under 15 min', max: 15, n: 0 }, { label: '15–60 min', max: 60, n: 0 }, { label: '1–3 hrs', max: 180, n: 0 }, { label: '3–12 hrs', max: 720, n: 0 }, { label: 'over 12 hrs', max: Infinity, n: 0 }];
  for (const x of qualifiedE) {
    const o = outBy.get(x.id), hs = hByEnq.get(x.id);
    if (!o?.called_back_at || !hs?.length) continue;
    const m = mins(hs[0].sent_at, o.called_back_at);
    buckets.find((b) => m <= b.max)!.n++;
  }

  // ---- cost
  const cost = { vaani: 0, gemini: 0, fixed: 0, total: 0 };
  for (const r of ledger) { (cost as any)[r.source] += Number(r.amount_inr); cost.total += Number(r.amount_inr); }
  const consultations = consultOutcomes.length;
  const avgProjectValue = Number(avgVal) || 1_100_000;
  const pipeline = consultations * avgProjectValue;

  // ---- reaching the team
  const acceptTimes: number[] = [];
  const via: Record<string, number> = { email: 0, desk: 0, dashboard: 0 };
  let nudges = 0, reassignments = 0;
  for (const h of handoffs) {
    if (h.accepted_at) { acceptTimes.push(mins(h.sent_at, h.accepted_at)); if (h.accepted_via) via[h.accepted_via] = (via[h.accepted_via] ?? 0) + 1; }
    nudges += h.nudges_sent ?? 0;
    if (h.reassigned_from) reassignments++;
  }
  const viaTotal = Object.values(via).reduce((a, b) => a + b, 0);
  const viaPct: Record<string, number | null> = {};
  for (const k of Object.keys(via)) viaPct[k] = pct(via[k], viaTotal);

  // ---- per designer
  const perDesigner: DesignerStat[] = designers.filter((d: any) => d.active).map((d: any) => {
    const hs = handoffs.filter((h: any) => h.designer_id === d.id);
    const acc = hs.filter((h: any) => h.accepted_at).map((h: any) => mins(h.sent_at, h.accepted_at));
    const mine = enquiries.filter((x: any) => x.assigned_designer_id === d.id && x.callback_due_at);
    const doneOnTime = mine.filter((x: any) => { const o = outBy.get(x.id); return o?.called_back_at && new Date(o.called_back_at) <= new Date(x.callback_due_at); }).length;
    const doneAny = mine.filter((x: any) => outBy.get(x.id)?.called_back_at || new Date(x.callback_due_at) < new Date()).length;
    return {
      id: d.id, name: d.name, handoffs: hs.length, medianAcceptMin: median(acc), calledBackOnTimePct: pct(doneOnTime, doneAny),
      consults: mine.filter((x: any) => outBy.get(x.id)?.consult_booked_at).length,
      nudged: hs.filter((h: any) => (h.nudges_sent ?? 0) > 0).length, movedAway: hs.filter((h: any) => h.reassigned_at).length, hasEmail: !!d.email,
    };
  });

  return {
    range: { start: s, end: e },
    calls: calls.length, answered: answered.length, answeredPct: pct(answered.length, calls.length), medianRingSec: median(ring),
    afterHoursCalls: afterHours, afterHoursPct: pct(afterHours, calls.length), byHour, verdicts,
    qualified: qualifiedE.length, handedUnder5Pct: pct(under5, withEnd), acceptedUnder15Pct: pct(acceptedFast, handed.length), callbackKeptPct: pct(kept, dueQ.length),
    consultations, escalations, ruleBreaks: flags.filter((f: any) => !f.resolved_at).length,
    missedPromises: enquiries.filter((x: any) => x.missed_promise_at).length,
    callbackBuckets: buckets.map(({ label, n }) => ({ label, n })), daily, cost,
    costPerCall: calls.length ? cost.total / calls.length : null,
    costPerQualified: qualifiedE.length ? cost.total / qualifiedE.length : null,
    costPerConsult: consultations ? cost.total / consultations : null,
    avgProjectValue, pipeline, pipelineRatio: cost.total > 0 && pipeline > 0 ? pipeline / cost.total : null,
    reach: {
      medianAcceptMin: median(acceptTimes), via, viaPct, nudgesPerLead: handed.length ? nudges / handed.length : null, reassignments,
      noEmail: designers.filter((d: any) => d.active && !d.email).map((d: any) => d.name),
    },
    designers: perDesigner,
  };
}

/** Open House-Rule flags, regardless of month (drives the red banner). */
export async function openRuleBreaks(): Promise<number> {
  const { count } = await db().from('compliance_flags').select('id', { count: 'exact', head: true }).in('simulated', simScope()).is('resolved_at', null);
  return count ?? 0;
}

export const inr = (n: number | null | undefined, digits = 0): string => (n == null ? '—' : '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits }));
export const lakh = (n: number): string => (n >= 1e7 ? `₹${(n / 1e7).toFixed(1)} crore` : `₹${(n / 1e5).toFixed(n % 1e5 === 0 ? 0 : 1)} lakh`);
export const pctS = (n: number | null): string => (n == null ? '—' : `${n}%`);
export const secS = (n: number | null): string => (n == null ? '—' : n < 60 ? `${Math.round(n)} sec` : `${(n / 60).toFixed(1)} min`);
export const minS = (n: number | null): string => (n == null ? '—' : n < 1 ? '<1 min' : n < 90 ? `${Math.round(n)} min` : `${(n / 60).toFixed(1)} hr`);
