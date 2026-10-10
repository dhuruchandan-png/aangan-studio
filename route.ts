// STEP E · Route (code). Handoffs, reassignment, front-desk alerts, escalations. All by email.
import { db, must } from './db';
import { effectiveRules } from './rules/store';
import { currentHandoff, eligibleDesigners, getDesigner, loadLead, pickDesigner, type Designer, type LeadCtx } from './leads';
import { send } from './notify';
import { adminBriefUrl, leadUrl } from './notify/links';
import { logAction, SYSTEM } from './audit';
import { emailEscalation, emailHandoff, emailMoved, emailUnassigned, headline } from './notify/templates';
import { atTime, callbackPromise, inDesignerHours, nextWorkingDayStart } from './time';

export type RouteOutcome =
  | { kind: 'handoff'; designer: string; silent: boolean }
  | { kind: 'frontdesk_queue' } | { kind: 'logged' } | { kind: 'escalated' } | { kind: 'unassigned' };

export const isoNow = (d?: Date) => (d ?? new Date()).toISOString();

/** Email the designer their handoff: Accept / Pass / Open brief, each one tap. */
export async function emailHandoffTo(lead: LeadCtx, designer: Designer, o: { reminder?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  const mail = emailHandoff(lead, { openUrl: leadUrl(lead.ref), reminder: o.reminder, sim: lead.simulated });
  await logAction(lead.id, SYSTEM, o.reminder ? 'reminder_sent' : 'handoff_sent', { detail: `${o.reminder ? 'Reminder emailed' : 'Lead emailed'} to ${designer.name}` });
  return send({ kind: o.reminder ? 'nudge' : 'handoff', to: { type: 'designer', designer }, enquiryId: lead.id, simulated: lead.simulated, email: mail });
}

export async function createHandoff(o: { lead: LeadCtx; designer: Designer; now?: Date; reassignedFrom?: string | null }): Promise<{ handoffId: string; silent: boolean }> {
  const now = o.now ?? new Date();
  const rules = await effectiveRules();
  const { lead, designer } = o;
  // "silent" now just records that the handoff went out of hours (it waits in the inbox; the ladder starts at 09:30).
  const silent = !inDesignerHours(now, rules.config.hours);

  const ins = must(await db().from('handoffs').insert({
    enquiry_id: lead.id, designer_id: designer.id, sent_at: isoNow(now), silent, reassigned_from: o.reassignedFrom ?? null, simulated: lead.simulated,
  }).select('id').single(), 'insert handoff');

  await db().from('enquiries').update({ assigned_designer_id: designer.id, status: lead.status === 'new' || lead.status === 'routed' ? 'routed' : lead.status }).eq('id', lead.id);
  await db().from('designers').update({ last_assigned_at: isoNow(now) }).eq('id', designer.id);
  await emailHandoffTo(lead, designer);
  return { handoffId: ins.id, silent };
}

export async function frontDeskAlert(lead: LeadCtx, why: string, now = new Date()): Promise<void> {
  await send({ kind: 'nudge', to: { type: 'frontdesk' }, enquiryId: lead.id, simulated: lead.simulated, email: emailUnassigned(lead, why, adminBriefUrl(lead.ref)) });
  await logAction(lead.id, SYSTEM, 'needs_designer', { detail: why });
  await db().from('enquiries').update({ unassigned_alert_at: isoNow(now), assigned_designer_id: null }).eq('id', lead.id);
}

/** Existing client: Nikhil + the senior person, immediately, with a one-tap "I've got it". */
export async function sendEscalation(lead: LeadCtx, repeat: number): Promise<void> {
  const briefUrl = adminBriefUrl(lead.ref);
  for (const to of [{ type: 'escalation' as const }, { type: 'nikhil' as const }]) {
    await send({ kind: 'escalation', to, enquiryId: lead.id, simulated: lead.simulated, email: emailEscalation(lead, { briefUrl, repeat }) });
  }
  await logAction(lead.id, SYSTEM, repeat ? 'escalation_repeated' : 'escalated', { detail: 'Emailed Nikhil and the senior person' });
  await db().from('enquiries').update({ escalated_at: lead.raw.escalated_at ?? isoNow(), last_escalation_at: isoNow() }).eq('id', lead.id);
}

/** Decide what happens to an enquiry after its verdict is final. */
export async function routeEnquiry(enquiryId: string, opts: { now?: Date; designerId?: string } = {}): Promise<RouteOutcome> {
  const now = opts.now ?? new Date();
  const lead = (await loadLead(enquiryId))!;
  const rules = await effectiveRules();
  const hours = rules.config.hours;

  switch (lead.verdict) {
    case 'qualified': {
      const promise = callbackPromise(now, hours, rules.config.afterhours_callback_by, rules.config.callback_in_hours_min);
      await db().from('enquiries').update({ callback_due_at: promise.dueAt.toISOString(), status: 'routed', extraction_pending: false }).eq('id', enquiryId);
      const fresh = (await loadLead(enquiryId))!;
      const designer = opts.designerId ? await getDesigner(opts.designerId) : pickDesigner(await eligibleDesigners({ when: promise.dueAt }), fresh.fields?.property_type);
      if (!designer) { await frontDeskAlert(fresh, 'No designer is available on the rota.', now); return { kind: 'unassigned' }; }
      const r = await createHandoff({ lead: fresh, designer, now });
      return { kind: 'handoff', designer: designer.name, silent: r.silent };
    }
    case 'unsure': {
      const due = atTime(nextWorkingDayStart(now, hours), rules.config.afterhours_callback_by);
      await db().from('enquiries').update({ callback_due_at: due.toISOString(), status: 'routed', extraction_pending: false }).eq('id', enquiryId);
      // A PRIORITY caller (repeat / frustrated) must not wait for the 10am digest.
      if (lead.priority) await frontDeskAlert((await loadLead(enquiryId))!, `PRIORITY caller (${lead.priorityReason ?? 'handle with care'}). One detail is still missing, so call them now rather than wait for the digest.`, now);
      return { kind: 'frontdesk_queue' };
    }
    case 'escalate': {
      await db().from('enquiries').update({ callback_due_at: new Date(now.getTime() + 15 * 60_000).toISOString(), status: 'routed', extraction_pending: false }).eq('id', enquiryId);
      const fresh = (await loadLead(enquiryId))!;
      if (!fresh.raw.escalated_at) await sendEscalation(fresh, 0);
      return { kind: 'escalated' };
    }
    default:
      await db().from('enquiries').update({ status: 'closed', extraction_pending: false }).eq('id', enquiryId);
      return { kind: 'logged' };
  }
}

/** Move a lead to the next designer (timeout, a Pass, or the designer chose Reassign). */
export async function reassign(enquiryId: string, o: { reason: 'timeout' | 'passed' | 'reassigned'; passReason?: string; now?: Date }): Promise<{ moved: boolean; to?: string; message: string }> {
  const now = o.now ?? new Date();
  const lead = await loadLead(enquiryId);
  if (!lead) return { moved: false, message: 'Lead not found.' };
  const h = await currentHandoff(enquiryId);
  const { data: all } = await db().from('handoffs').select('designer_id, reassigned_from').eq('enquiry_id', enquiryId);
  const tried = (all ?? []).map((x: any) => x.designer_id as string);
  const reassignments = (all ?? []).filter((x: any) => x.reassigned_from).length;
  const from = h ? await getDesigner(h.designer_id) : null;

  if (h) {
    await db().from('handoffs').update(o.reason === 'passed' ? { passed_at: isoNow(now), pass_reason: o.passReason ?? null } : { reassigned_at: isoNow(now) }).eq('id', h.id);
  }

  const wasTimeout = o.reason === 'timeout';
  let next: Designer | null = null;
  // After 2 reassignments with no Accept, stop auto-reassigning and tell the front desk.
  if (!(wasTimeout && reassignments >= 2)) {
    next = pickDesigner(await eligibleDesigners({ exclude: tried, when: lead.callbackDue ?? now }), lead.fields?.property_type);
  }

  if (!next) {
    const fresh = (await loadLead(enquiryId))!;
    await frontDeskAlert(fresh, wasTimeout ? `Nobody accepted after ${reassignments} reassignments.` : 'No other designer is available on the rota.', now);
    return { moved: false, message: 'Sent to the front desk.' };
  }

  const fresh = (await loadLead(enquiryId))!;
  await createHandoff({ lead: fresh, designer: next, now, reassignedFrom: from?.id ?? null });
  // The first designer ignored it, so tell them it's no longer theirs ("Moved to Rhea, no action needed").
  await logAction(enquiryId, SYSTEM, 'reassigned', { detail: `${from ? from.name : 'Nobody'} → ${next.name} (${wasTimeout ? 'no Accept in 15 minutes' : o.reason === 'passed' ? 'passed' : 'reassigned'})` });
  if (from && wasTimeout) await send({ kind: 'reassign', to: { type: 'designer', designer: from }, enquiryId, simulated: lead.simulated, email: emailMoved(lead, next.name) });
  return { moved: true, to: next.name, message: `Moved to ${next.name}.` };
}

export { headline };
