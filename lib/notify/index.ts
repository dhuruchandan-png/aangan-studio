// One notification service. Every message goes through here, by email, and is logged to `notifications`.
// (A NotifyChannel seam is kept so SMS / WhatsApp can be added later; see README "Adding a channel".)
import { db } from '../db';
import { env } from '../env';
import type { Designer } from '../leads';
import { sendEmail, type Attachment } from './email';

export type NotifKind = 'handoff' | 'nudge' | 'reassign' | 'callback_reminder' | 'overdue' | 'escalation' | 'digest' | 'weekly' | 'monthly' | 'ics' | 'compliance' | 'summary' | 'other';
export type Recipient =
  | { type: 'designer'; designer: Designer }
  | { type: 'frontdesk' }
  | { type: 'nikhil' }
  | { type: 'escalation' };

export interface EmailBody { subject: string; html: string; text: string; attachments?: Attachment[] }

export interface SendSpec {
  kind: NotifKind;
  to: Recipient;
  enquiryId?: string | null;
  email: EmailBody;
  /** Rehearsal: the email always goes to the test address, never to a real recipient. */
  simulated?: boolean;
}
export interface SendResult { ok: boolean; error?: string; notificationId?: string }

/** The pluggable seam: implement this to add SMS / WhatsApp without touching callers. */
export interface NotifyChannel {
  name: 'email' | 'sms' | 'whatsapp';
  send(to: string, body: EmailBody, opts: { simulated?: boolean }): Promise<{ ok: boolean; id?: string; error?: string; to: string; redirected: boolean }>;
}
const emailChannel: NotifyChannel = { name: 'email', send: (to, b, o) => sendEmail({ to, ...b, simulated: o.simulated }) };

const addressFor = (to: Recipient): string | null => {
  switch (to.type) {
    case 'designer': return to.designer.email;
    case 'frontdesk': return env('FRONTDESK_EMAIL') || null;
    case 'nikhil': return env('NIKHIL_EMAIL') || null;
    case 'escalation': return env('ESCALATION_EMAIL') || env('NIKHIL_EMAIL') || null;
  }
};
const recipientType = (to: Recipient): 'designer' | 'frontdesk' | 'nikhil' => (to.type === 'escalation' ? 'nikhil' : to.type);

export async function send(spec: SendSpec): Promise<SendResult> {
  const r = await emailChannel.send(addressFor(spec.to) ?? '', spec.email, { simulated: spec.simulated });
  const { data } = await db().from('notifications').insert({
    recipient_type: recipientType(spec.to), recipient_id: spec.to.type === 'designer' ? spec.to.designer.id : null, enquiry_id: spec.enquiryId ?? null,
    channel: 'email', kind: spec.kind, payload: { subject: spec.email.subject, to: r.to, redirected: r.redirected, html: spec.email.html.slice(0, 60_000), text: spec.email.text.slice(0, 8_000), for: spec.to.type === 'designer' ? spec.to.designer.name : spec.to.type },
    delivered: r.ok, provider_id: r.id ?? null, error: r.error ?? null, simulated: !!spec.simulated,
  }).select('id').single();
  return { ok: r.ok, error: r.error, notificationId: data?.id };
}

/** The designer took an action: close out the open notifications for that lead so the tracker can measure it. */
export async function markActed(enquiryId: string, o: { designerId?: string | null; action: string; via: 'email' | 'desk' | 'dashboard' }): Promise<void> {
  let q = db().from('notifications').update({ acted_at: new Date().toISOString(), action: o.action, acted_via: o.via })
    .eq('enquiry_id', enquiryId).is('acted_at', null).in('kind', ['handoff', 'nudge', 'callback_reminder', 'overdue', 'escalation']);
  if (o.designerId) q = q.eq('recipient_id', o.designerId);
  await q;
}
