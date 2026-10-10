// F3 · Escalation ladder. Runs every 5 minutes (from /api/cron/tick). Each step happens once, only if the
// previous one got no response, and stops the moment anyone takes the action.
//
//   T+0      handoff email (done in routeEnquiry)
//   T+10     no tap → a "Still waiting" reminder email (same Accept / Pass buttons)
//   T+15     no Accept -> reassigned to the next designer (first designer is told)
//   after 2 reassignments with no Accept -> front-desk group, with assign buttons
//   due -15  reminder to the accepted designer      due  nudge      due +15  front desk told     due +60  "missed promise"
//   ESCALATE (existing client): Nikhil + senior by email every 10 min until "I've got it"
//
// "T+n" is measured in ACTIVE minutes: the ladder pauses overnight / Sundays and restarts at 09:30.
import { db } from './db';
import { currentHandoff, getDesigner, loadLead, type Designer, type LeadCtx } from './leads';
import { send } from './notify';
import { adminBriefUrl, leadUrl } from './notify/links';
import { emailBatch, emailUnassigned, headline, type Item } from './notify/templates';
import { effectiveRules } from './rules/store';
import { getSetting } from './db';
import { emailHandoffTo, reassign, sendEscalation, isoNow } from './route';
import { activeElapsedMin, ladderActive } from './time';

export interface LadderEvent { ref: string; step: string; detail: string }

export async function runLadder(opts: { now?: Date; simulated?: boolean } = {}): Promise<LadderEvent[]> {
  const now = opts.now ?? new Date();
  const sim = !!opts.simulated;
  const events: LadderEvent[] = [];
  const rules = await effectiveRules();
  const hours = rules.config.hours;
  const ladderStart = await getSetting<string>('ladder_start', '09:30');
  const active = sim || ladderActive(now, hours, ladderStart);

  const { data: open } = await db().from('enquiries').select('id, ref').in('status', ['routed', 'accepted']).eq('simulated', sim).limit(300);
  const reminders = new Map<string, { d: Designer; items: Item[] }>();
  const overdue = new Map<string, { d: Designer; items: Item[] }>();
  const addTo = (m: typeof reminders, d: Designer, item: Item) => { const e = m.get(d.id) ?? { d, items: [] }; e.items.push(item); m.set(d.id, e); };

  for (const row of open ?? []) {
    const lead = await loadLead(row.id);
    if (!lead) continue;
    const e = lead.raw;

    // ---- ESCALATE (existing client): repeat every 10 minutes until someone taps "I've got it"
    if (lead.verdict === 'escalate') {
      if (e.escalated_at && !e.escalation_acked_at) {
        const last = new Date(e.last_escalation_at ?? e.escalated_at).getTime();
        if (now.getTime() - last >= 10 * 60_000) {
          const n = Math.floor((now.getTime() - new Date(e.escalated_at).getTime()) / (10 * 60_000));
          await sendEscalation(lead, n);
          await db().from('enquiries').update({ last_escalation_at: isoNow(now) }).eq('id', lead.id);
          events.push({ ref: lead.ref, step: 'escalation_repeat', detail: `reminder ${n} to Nikhil + senior chat` });
        }
      }
      continue;
    }

    const h = await currentHandoff(lead.id);
    const snoozed = h?.snoozed_until && new Date(h.snoozed_until) > now;

    // ---- T+10 nudge, T+15 reassign (qualified leads nobody has accepted)
    if (lead.verdict === 'qualified' && lead.status === 'routed' && h && !h.accepted_at && !snoozed && active) {
      const elapsed = activeElapsedMin(new Date(h.sent_at), now, { hours, ladderStart, ignoreHours: sim });
      if (elapsed >= 15) {
        const r = await reassign(lead.id, { reason: 'timeout', now });
        events.push({ ref: lead.ref, step: r.moved ? 'reassigned' : 'to_front_desk', detail: r.moved ? `no Accept in 15 min → ${r.to}` : r.message });
        continue;
      }
      if (elapsed >= 10 && !h.nudge_email_sent_at && (!h.last_nudge_at || now.getTime() - new Date(h.last_nudge_at).getTime() >= 10 * 60_000)) {
        const designer = await getDesigner(h.designer_id);
        if (designer) {
          await emailHandoffTo(lead, designer, { reminder: true });
          await db().from('handoffs').update({ nudges_sent: (h.nudges_sent ?? 0) + 1, last_nudge_at: isoNow(now), nudge_email_sent_at: isoNow(now) }).eq('id', h.id);
          events.push({ ref: lead.ref, step: 'nudge', detail: `${designer.name}: "Still waiting" reminder email at ${Math.round(elapsed)} min` });
        }
      }
      continue; // the callback clock only matters once someone has the lead
    }

    // ---- callback clock
    if (!lead.callbackDue || snoozed) continue;
    const due = lead.callbackDue.getTime(), t = now.getTime();
    const designer = lead.assignedDesignerId ? await getDesigner(lead.assignedDesignerId) : null;
    const item = async (): Promise<Item> => ({ ref: lead.ref, headline: headline(lead), due: lead.callbackDue, briefUrl: designer ? leadUrl(lead.ref) : adminBriefUrl(lead.ref), number: lead.callerNumber });

    if (designer && h?.accepted_at && !e.reminder_sent_at && t >= due - 15 * 60_000 && t < due && active) {
      addTo(reminders, designer, await item());
      await db().from('enquiries').update({ reminder_sent_at: isoNow(now) }).eq('id', lead.id);
      events.push({ ref: lead.ref, step: 'callback_reminder', detail: `${designer.name} is expected to call by due time` });
    }
    if (designer && !e.overdue_nudge_at && t >= due && active) {
      addTo(overdue, designer, await item());
      await db().from('enquiries').update({ overdue_nudge_at: isoNow(now) }).eq('id', lead.id);
      events.push({ ref: lead.ref, step: 'overdue_nudge', detail: `callback overdue → ${designer.name}` });
    }
    if (!e.overdue_fd_at && t >= due + 15 * 60_000 && active) {
      const mail = emailUnassigned(lead, `Callback overdue by 15 min${designer ? ` (with ${designer.name})` : ''}. Call them, or reassign.`, adminBriefUrl(lead.ref));
      await send({ kind: 'overdue', to: { type: 'frontdesk' }, enquiryId: lead.id, simulated: lead.simulated, email: mail });
      await db().from('enquiries').update({ overdue_fd_at: isoNow(now) }).eq('id', lead.id);
      events.push({ ref: lead.ref, step: 'front_desk_told', detail: 'overdue +15 min → front-desk group' });
    }
    if (!e.missed_promise_at && t >= due + 60 * 60_000) {
      await db().from('enquiries').update({ missed_promise_at: isoNow(now) }).eq('id', lead.id);
      events.push({ ref: lead.ref, step: 'missed_promise', detail: 'overdue +60 min → goes into Nikhil\'s summary' });
    }
  }

  // ---- batching: ONE email per designer per tick, never five
  for (const [kind, map] of [['callback_reminder', reminders], ['overdue', overdue]] as const) {
    for (const { d, items } of map.values()) {
      await send({ kind, to: { type: 'designer', designer: d }, simulated: sim, email: emailBatch(kind === 'callback_reminder' ? 'Callbacks due soon' : 'Callbacks overdue', items, now) });
    }
  }
  return events;
}

export type { LeadCtx };
