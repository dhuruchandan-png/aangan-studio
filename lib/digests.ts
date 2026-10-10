// F5 · Daily and weekly rhythm. Replaces "go check the dashboard".
import { db, must } from './db';
import { appBase } from './env';
import { listDesigners, loadLead, type Designer } from './leads';
import { send } from './notify';
import { adminBriefUrl, leadUrl, myDashboardUrl } from './notify/links';
import {
  emailDay, emailFrontDesk, emailReport, headline, type DaySection, type Item, type StatRow,
} from './notify/templates';
import { computeStats, inr, lakh, minS, openRuleBreaks, pctS, secS, type Stats } from './stats';
import { addDays, istDate, istDayKey, istParts, startOfIstDay, istMonthRange } from './time';

const dash = () => `${appBase()}/`;

async function toItem(enquiryId: string, designer: Designer | null): Promise<Item | null> {
  const lead = await loadLead(enquiryId);
  if (!lead) return null;
  return {
    ref: lead.ref, headline: headline(lead), due: lead.callbackDue, number: lead.callerNumber, sub: lead.priority ? '⭐ PRIORITY' : undefined,
    briefUrl: designer ? leadUrl(lead.ref) : adminBriefUrl(lead.ref),
  };
}

/** 9:30 "Your day": only sent if the designer has something. */
export async function sendYourDay(designer: Designer, now = new Date()): Promise<boolean> {
  const dayStart = startOfIstDay(now), dayEnd = addDays(dayStart, 1);
  const { data: rows } = await db().from('enquiries').select('id, status, callback_due_at').eq('assigned_designer_id', designer.id).eq('simulated', false).in('status', ['routed', 'accepted']);
  const waiting: Item[] = [], dueToday: Item[] = [], overdue: Item[] = [];
  for (const r of rows ?? []) {
    const due = r.callback_due_at ? new Date(r.callback_due_at) : null;
    if (r.status === 'routed') { const it = await toItem(r.id, designer); if (it) waiting.push(it); continue; }
    const it = await toItem(r.id, designer);
    if (!it) continue;
    if (due && due < now) overdue.push(it);
    else if (due && due < dayEnd) dueToday.push(it);
  }
  const { data: cons } = await db().from('consultations').select('enquiry_id, scheduled_at').eq('designer_id', designer.id).gte('scheduled_at', dayStart.toISOString()).lt('scheduled_at', dayEnd.toISOString()).order('scheduled_at');
  const consults: Item[] = [];
  for (const c of cons ?? []) { const it = await toItem(c.enquiry_id, designer); if (it) consults.push({ ...it, due: new Date(c.scheduled_at) }); }

  const sections: DaySection[] = [
    { title: 'Waiting for you to accept', items: waiting }, { title: 'Overdue callbacks', items: overdue },
    { title: 'Callbacks due today', items: dueToday }, { title: 'Consultations today', items: consults },
  ];
  if (!sections.some((s) => s.items.length)) return false;
  await send({ kind: 'digest', to: { type: 'designer', designer }, email: emailDay(designer.name, sections, now, myDashboardUrl()) });
  return true;
}

/** 10:00 front-desk digest: unsure leads, unassigned items, yesterday's missed promises. */
export async function sendFrontDeskDigest(now = new Date()): Promise<boolean> {
  const yesterday = addDays(startOfIstDay(now), -1).toISOString();
  const [unsure, unassigned, missed] = await Promise.all([
    db().from('enquiries').select('id').eq('verdict', 'unsure').eq('status', 'routed').is('assigned_designer_id', null).is('frontdesk_handled_at', null).eq('simulated', false).then((r) => must(r, 'unsure')),
    db().from('enquiries').select('id').eq('verdict', 'qualified').eq('status', 'routed').is('assigned_designer_id', null).not('unassigned_alert_at', 'is', null).eq('simulated', false).then((r) => must(r, 'unassigned')),
    db().from('enquiries').select('id').gte('missed_promise_at', yesterday).eq('simulated', false).then((r) => must(r, 'missed')),
  ]);
  const build = async (ids: { id: string }[], sub?: string) => (await Promise.all(ids.map((x) => toItem(x.id, null)))).filter(Boolean).map((i) => ({ ...i!, sub: sub ?? i!.sub })) as Item[];
  const sections: DaySection[] = [
    { title: 'Unsure · please call back', items: await build(unsure, 'Needs one question answered before a designer') },
    { title: 'Unassigned', items: await build(unassigned, 'Nobody accepted: assign a designer') },
    { title: "Yesterday's missed promises", items: await build(missed, 'Callback promise was missed') },
  ];
  if (!sections.some((s) => s.items.length)) return false;
  await send({ kind: 'digest', to: { type: 'frontdesk' }, email: emailFrontDesk(sections, dash()) });
  return true;
}

// ------------------------------------------------------------------ Nikhil
const rowsFor = (s: Stats, prev?: Stats, extra = false): StatRow[] => {
  const p = (f: (x: Stats) => string) => (prev ? f(prev) : undefined);
  const rows: StatRow[] = [
    { label: 'Calls', value: String(s.calls), prev: p((x) => String(x.calls)) },
    { label: 'Answered', value: pctS(s.answeredPct), prev: p((x) => pctS(x.answeredPct)), note: `median ${secS(s.medianRingSec)} to answer` },
    { label: 'After-hours share', value: pctS(s.afterHoursPct), prev: p((x) => pctS(x.afterHoursPct)) },
    { label: 'Qualified', value: String(s.qualified), prev: p((x) => String(x.qualified)) },
    { label: 'Handed off in under 5 min', value: pctS(s.handedUnder5Pct), prev: p((x) => pctS(x.handedUnder5Pct)) },
    { label: 'Accepted in under 15 min', value: pctS(s.acceptedUnder15Pct), prev: p((x) => pctS(x.acceptedUnder15Pct)) },
    { label: 'Callbacks kept', value: pctS(s.callbackKeptPct), prev: p((x) => pctS(x.callbackKeptPct)), note: 'within 1 hr in hours, by 11am after hours' },
    { label: 'Consultations booked', value: String(s.consultations), prev: p((x) => String(x.consultations)) },
    { label: 'Missed promises', value: String(s.missedPromises), prev: p((x) => String(x.missedPromises)) },
    { label: 'Escalations', value: String(s.escalations), prev: p((x) => String(x.escalations)) },
    { label: 'House Rules broken', value: String(s.ruleBreaks), prev: p((x) => String(x.ruleBreaks)) },
    { label: 'Cost to run', value: inr(s.cost.total), prev: p((x) => inr(x.cost.total)) },
  ];
  if (extra) rows.push(
    { label: 'Cost per call', value: inr(s.costPerCall, 1), prev: p((x) => inr(x.costPerCall, 1)) },
    { label: 'Cost per qualified lead', value: inr(s.costPerQualified), prev: p((x) => inr(x.costPerQualified)) },
    { label: 'Cost per consultation', value: inr(s.costPerConsult), prev: p((x) => inr(x.costPerConsult)) },
    { label: 'Pipeline generated (indicative)', value: lakh(s.pipeline), prev: p((x) => lakh(x.pipeline)), note: `consultations × ${lakh(s.avgProjectValue)}, internal only` },
  );
  return rows;
};

/** 8:00pm Nikhil's daily summary (email). */
export async function sendNikhilSummary(now = new Date()): Promise<void> {
  const s = await computeStats(startOfIstDay(now), addDays(startOfIstDay(now), 1));
  const rows: StatRow[] = [
    { label: 'Calls', value: String(s.calls) }, { label: 'After-hours share', value: pctS(s.afterHoursPct) }, { label: 'Qualified', value: String(s.qualified) },
    { label: 'Handed off under 5 min', value: pctS(s.handedUnder5Pct) }, { label: 'Accepted under 15 min', value: pctS(s.acceptedUnder15Pct) },
    { label: 'Callbacks kept', value: pctS(s.callbackKeptPct) }, { label: 'Consultations booked', value: String(s.consultations) },
    { label: 'Missed promises', value: String(s.missedPromises), note: s.missedPromises ? 'see The Courtyard' : undefined }, { label: 'Escalations', value: String(s.escalations) },
    { label: 'House Rules flags', value: String(await openRuleBreaks()) }, { label: 'Cost today', value: inr(s.cost.total) },
  ];
  const mail = emailReport({ subject: `Today at Aangan · ${s.calls} calls, ${s.qualified} qualified, ${s.consultations} consultations`, heading: `Today at Aangan · ${istDayKey(now)}`, intro: `${s.afterHoursCalls} of ${s.calls} calls came outside front-desk hours.`, rows, ctaLabel: 'Open The Courtyard', ctaUrl: dash() });
  await send({ kind: 'summary', to: { type: 'nikhil' }, email: mail });
}

export const weekRange = (now: Date, weeksAgo: number): { start: Date; end: Date } => {
  const p = istParts(now);
  const mondayOffset = p.dow === 0 ? 6 : p.dow - 1;
  const thisMonday = addDays(startOfIstDay(now), -mondayOffset);
  const start = addDays(thisMonday, -7 * weeksAgo);
  return { start, end: addDays(start, 7) };
};

/** Monday 9am: Nikhil's branded report + a personal one per designer. */
export async function sendWeekly(now = new Date()): Promise<{ designers: number }> {
  const cur = weekRange(now, 1), prev = weekRange(now, 2);
  const [s, p] = await Promise.all([computeStats(cur.start, cur.end), computeStats(prev.start, prev.end)]);
  const label = `${istDayKey(cur.start)} to ${istDayKey(addDays(cur.end, -1))}`;
  const rep = emailReport({
    subject: `Last week at Aangan · ${s.calls} calls, ${s.qualified} qualified, ${s.consultations} consultations`,
    heading: 'Last week in the courtyard', intro: `${label}. ${s.afterHoursCalls} of ${s.calls} calls came outside front-desk hours and every one was answered.`,
    rows: rowsFor(s, p, true), compare: true, ctaLabel: 'Open The Courtyard', ctaUrl: dash(),
    extra: `<p style="font:13px/1.5 Helvetica,Arial,sans-serif;color:#6B6157">Before Aangan's phone assistant, about 48% of enquiries got no reply within 48 hours.</p>`,
  });
  await send({ kind: 'weekly', to: { type: 'nikhil' }, email: rep });

  const designers = (await listDesigners()).filter((d) => d.active);
  let n = 0;
  for (const d of designers) {
    const ds = s.designers.find((x) => x.id === d.id);
    if (!ds || !ds.handoffs) continue;
    const mail = emailReport({
      subject: `Your week · ${ds.handoffs} leads, ${ds.consults} consultations booked`, heading: `Your week, ${d.name.split(' ')[0]}`,
      intro: `${label}. Thank you for picking up the phone and keeping the promises we make to callers. They notice.`,
      rows: [
        { label: 'Leads handed to you', value: String(ds.handoffs) }, { label: 'Median time to accept', value: minS(ds.medianAcceptMin) },
        { label: 'Callbacks kept', value: pctS(ds.calledBackOnTimePct) }, { label: 'Consultations booked', value: String(ds.consults) },
      ], ctaLabel: 'Open my dashboard', ctaUrl: myDashboardUrl(),
    });
    await send({ kind: 'weekly', to: { type: 'designer', designer: d }, email: mail });
    n++;
  }
  return { designers: n };
}

/** 1st of the month: the numbers Nikhil used to pull by hand. */
export async function sendMonthly(now = new Date()): Promise<void> {
  const cur = istMonthRange(now, -1), prev = istMonthRange(now, -2);
  const [s, p] = await Promise.all([computeStats(cur.start, cur.end), computeStats(prev.start, prev.end)]);
  const monthName = istDate(istParts(cur.start).y, istParts(cur.start).m, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const mail = emailReport({
    subject: `${monthName} · ${s.calls} calls, ${pctS(s.answeredPct)} answered, ${inr(s.costPerQualified)} per qualified lead`,
    heading: `${monthName}, in numbers`, intro: `The monthly record: calls, response, conversion and what it cost to run. No manual pulling needed.`,
    rows: [
      ...rowsFor(s, p, true),
      { label: 'Median handoff → Accept', value: minS(s.reach.medianAcceptMin), prev: minS(p.reach.medianAcceptMin) },
      { label: 'Reassignments', value: String(s.reach.reassignments), prev: String(p.reach.reassignments) },
    ], compare: true, ctaLabel: 'Open The Courtyard', ctaUrl: dash(),
  });
  await send({ kind: 'monthly', to: { type: 'nikhil' }, email: mail });
}
