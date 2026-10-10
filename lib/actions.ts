// One action engine. Email links, My Desk and the dashboard all call applyAction(),
// so "Accept" behaves identically everywhere and every action is timestamped for the tracker.
import { db, must } from './db';
import { currentHandoff, getDesigner, loadLead, shortId, type Designer } from './leads';
import { markActed, send } from './notify';
import { buildIcs } from './notify/ics';
import { logAction, type Actor } from './audit';
import { syncEnquiry } from './crm/sync';
import { emailConsultation, headline } from './notify/templates';
import { frontDeskAlert, isoNow, reassign, createHandoff } from './route';
import { fmtDayDateTime, fmtTime } from './time';

export type ActionName =
  | 'accept' | 'called_back' | 'book' | 'not_proceeding' | 'snooze' | 'pass' | 'reassign'
  | 'ack' | 'assign' | 'fd_called';
export type Via = 'dashboard' | 'email';

export interface ActionInput {
  enquiry: string;                    // ref or id
  action: ActionName;
  via: Via;
  designerId?: string | null;         // the acting designer (personal actions)
  adminName?: string;                 // who, when an admin (Nikhil / front desk) acts from the dashboard
  payload?: { reason?: string; scheduledAt?: string; location?: 'site' | 'studio'; assignTo?: string };
}
export interface ActionResult { ok: boolean; message: string; status?: string }

async function setOutcome(enquiryId: string, patch: Record<string, unknown>): Promise<void> {
  const { data } = await db().from('outcomes').select('*').eq('enquiry_id', enquiryId).maybeSingle();
  if (!data) must(await db().from('outcomes').insert({ enquiry_id: enquiryId, ...patch }), 'insert outcome');
  else {
    // never overwrite an earlier timestamp
    const merged: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (data[k] == null || !k.endsWith('_at')) merged[k] = v;
    if (Object.keys(merged).length) must(await db().from('outcomes').update(merged).eq('enquiry_id', enquiryId), 'update outcome');
  }
}

const LABEL: Record<string, string> = {
  accept: 'Accepted the lead', called_back: 'Called the client back', book: 'Booked a consultation', not_proceeding: 'Marked not proceeding', snooze: 'Snoozed 30 minutes',
  pass: 'Passed the lead', reassign: 'Reassigned the lead', ack: 'Took ownership of the escalation', assign: 'Assigned the lead', fd_called: 'Front desk called the client',
};

/** Runs the action, then stamps who did it. Every path through here is audited. */
export async function applyAction(a: ActionInput): Promise<ActionResult> {
  const r = await runAction(a);
  if (r.ok) {
    try {
      const lead = await loadLead(a.enquiry);
      if (lead) {
        const designer = a.designerId ? await getDesigner(a.designerId) : null;
        const actor: Actor = a.adminName || !designer || ['assign', 'fd_called', 'ack'].includes(a.action)
          ? { type: 'admin', name: a.adminName ?? 'Studio' } // an admin acting for a designer is recorded as the admin, never as the designer
          : { type: 'designer', id: designer.id, name: designer.name };
        await logAction(lead.id, actor, a.action, { detail: [LABEL[a.action], a.payload?.reason, a.payload?.scheduledAt ? fmtDayDateTime(a.payload.scheduledAt) : null].filter(Boolean).join(' · '), via: a.via });
        await syncEnquiry(lead.id, { event: a.action, detail: a.payload?.reason ?? (a.payload?.scheduledAt ? fmtDayDateTime(a.payload.scheduledAt) : undefined) });
      }
    } catch { /* the action itself succeeded; never fail it over the log */ }
  }
  return r;
}

async function runAction(a: ActionInput): Promise<ActionResult> {
  const lead = await loadLead(a.enquiry);
  if (!lead) return { ok: false, message: 'That enquiry was not found.' };
  const now = new Date();

  // ---- front desk / senior actions (no designer needed)
  if (a.action === 'ack') {
    await db().from('enquiries').update({ escalation_acked_at: isoNow(now), status: 'accepted' }).eq('id', lead.id);
    await markActed(lead.id, { action: 'ack', via: a.via });
    return { ok: true, message: 'Thanks — marked as handled.', status: 'accepted' };
  }
  if (a.action === 'fd_called') {
    await db().from('enquiries').update({ frontdesk_handled_at: isoNow(now), status: 'called_back' }).eq('id', lead.id);
    await setOutcome(lead.id, { called_back_at: isoNow(now), called_back_via: 'frontdesk' });
    return { ok: true, message: 'Marked as called.', status: 'called_back' };
  }
  if (a.action === 'assign') {
    const to = a.payload?.assignTo ? await resolveDesigner(a.payload.assignTo) : null;
    if (!to) return { ok: false, message: 'Pick a designer to assign.' };
    const open = await currentHandoff(lead.id);
    if (open) await db().from('handoffs').update({ reassigned_at: isoNow(now) }).eq('id', open.id);
    await createHandoff({ lead, designer: to, now, reassignedFrom: open?.designer_id ?? null });
    return { ok: true, message: `Assigned to ${to.name}.`, status: 'routed' };
  }

  // ---- designer actions
  if (!a.designerId) return { ok: false, message: 'This action needs a designer.' };
  const designer = await getDesigner(a.designerId);
  if (!designer) return { ok: false, message: 'Designer not found.' };
  const h = await currentHandoff(lead.id);
  if (!h || h.designer_id !== designer.id) {
    const owner = lead.assignedDesignerId ? await getDesigner(lead.assignedDesignerId) : null;
    return { ok: false, message: owner ? `This lead has moved to ${owner.name}, so no action is needed from you.` : 'This lead is no longer assigned to you.' };
  }

  switch (a.action) {
    case 'accept': {
      if (h.accepted_at) return { ok: true, message: 'Already accepted.', status: lead.status };
      await db().from('handoffs').update({ accepted_at: isoNow(now), accepted_via: a.via }).eq('id', h.id);
      await db().from('enquiries').update({ status: 'accepted' }).eq('id', lead.id);
      await markActed(lead.id, { designerId: designer.id, action: 'accept', via: a.via });
      return { ok: true, message: 'Accepted. Call back by ' + fmtTime(lead.callbackDue) + '.', status: 'accepted' };
    }
    case 'called_back': {
      if (!h.accepted_at) await db().from('handoffs').update({ accepted_at: isoNow(now), accepted_via: a.via }).eq('id', h.id);
      await setOutcome(lead.id, { called_back_at: isoNow(now), called_back_via: a.via });
      await db().from('enquiries').update({ status: lead.status === 'consult_booked' ? 'consult_booked' : 'called_back' }).eq('id', lead.id);
      await markActed(lead.id, { designerId: designer.id, action: 'called_back', via: a.via });
      return { ok: true, message: 'Logged as called back.', status: 'called_back' };
    }
    case 'book': {
      const when = a.payload?.scheduledAt ? new Date(a.payload.scheduledAt) : null;
      if (!when || isNaN(when.getTime())) return { ok: false, message: 'Pick a date and time for the consultation.' };
      const location = a.payload?.location ?? 'site';
      if (!h.accepted_at) await db().from('handoffs').update({ accepted_at: isoNow(now), accepted_via: a.via }).eq('id', h.id);
      const cons = must(await db().from('consultations').insert({ enquiry_id: lead.id, designer_id: designer.id, scheduled_at: when.toISOString(), location }).select('id').single(), 'insert consultation');
      await setOutcome(lead.id, { called_back_at: isoNow(now), called_back_via: a.via, consult_booked_at: isoNow(now) });
      await db().from('enquiries').update({ status: 'consult_booked' }).eq('id', lead.id);
      await markActed(lead.id, { designerId: designer.id, action: 'book', via: a.via });

      const f = lead.fields;
      const place = location === 'studio' ? 'Aangan Studio, Pune' : [f?.locality, 'Pune'].filter(Boolean).join(', ') + ' (client site)';
      const ics = buildIcs({
        uid: cons.id, start: when, summary: `Consultation · ${headline(lead)}`, description: `${lead.note}\n\nCaller: ${lead.callerNumber ?? ''}\nRef ${lead.ref}`,
        location: place, attendeeEmail: designer.email ?? undefined, attendeeName: designer.name,
      });
      const mail = emailConsultation({ headline: headline(lead), ref: lead.ref, when, location: place, number: lead.callerNumber, note: lead.note });
      const res = await send({
        kind: 'ics', to: { type: 'designer', designer }, enquiryId: lead.id, simulated: lead.simulated,
        email: { ...mail, attachments: [{ filename: 'consultation.ics', content: Buffer.from(ics).toString('base64'), contentType: 'text/calendar; method=REQUEST' }] },
      });
      if (res.ok) await db().from('consultations').update({ ics_sent_at: isoNow() }).eq('id', cons.id);
      return { ok: true, message: `Consultation booked for ${fmtDayDateTime(when)}. Calendar invite ${res.ok ? 'emailed' : 'could not be emailed (' + (res.error ?? 'no address') + ')'}.`, status: 'consult_booked' };
    }
    case 'not_proceeding': {
      await db().from('enquiries').update({ status: 'not_proceeding' }).eq('id', lead.id);
      await setOutcome(lead.id, { not_proceeding_reason: a.payload?.reason ?? 'no reason given', not_proceeding_at: isoNow(now) });
      await markActed(lead.id, { designerId: designer.id, action: 'not_proceeding', via: a.via });
      return { ok: true, message: 'Marked as not proceeding.', status: 'not_proceeding' };
    }
    case 'snooze': {
      const until = new Date(now.getTime() + 30 * 60_000);
      await db().from('handoffs').update({ snoozed_until: until.toISOString() }).eq('id', h.id);
      return { ok: true, message: `Snoozed until ${fmtTime(until)}.` };
    }
    case 'pass':
    case 'reassign': {
      const r = await reassign(lead.id, { reason: a.action === 'pass' ? 'passed' : 'reassigned', passReason: a.payload?.reason });
      await markActed(lead.id, { designerId: designer.id, action: a.action, via: a.via });
      return { ok: true, message: r.message };
    }
    default:
      return { ok: false, message: 'Unknown action.' };
  }
}

export async function resolveDesigner(idOrShort: string): Promise<Designer | null> {
  if (/^[0-9a-f]{8}-/.test(idOrShort)) return getDesigner(idOrShort);
  const { data } = await db().from('designers').select('*').eq('active', true);
  return ((data ?? []) as Designer[]).find((d) => shortId(d.id) === idOrShort) ?? null;
}

export { frontDeskAlert };
