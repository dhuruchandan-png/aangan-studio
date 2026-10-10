// Loading a lead (enquiry + latest extraction + calls) and choosing designers.
import { db, must } from './db';
import { normalizePhone } from './pipeline/clean';
import { inDesignerHours, istParts } from './time';
import type { Category, DecidedExtraction, EnquiryStatus, ExtractedFields, Hours, Verdict } from './types';

export interface Designer {
  id: string; name: string; email: string | null;
  active: boolean; on_leave: boolean; specialities: string[]; rota: Hours;
  digest_time: string; last_assigned_at: string | null;
}

export interface LeadCtx {
  id: string; ref: string; channel: string; simulated: boolean; callerNumber: string | null; callerName: string | null;
  callAt: Date; afterHours: boolean; verdict: Verdict | null; category: Category | null; status: EnquiryStatus;
  priority: boolean; priorityReason: string | null; referral: string | null;
  fields: ExtractedFields | null; note: string; stillUnknown: string[]; notes: string[]; priceAsked: boolean; mood: string | null;
  callbackDue: Date | null; assignedDesignerId: string | null; recordingCallId: string | null; hasRecording: boolean;
  criteria: DecidedExtraction['criteria']; existingClient: { designer_name: string | null; project: string | null } | null;
  raw: any;
}

export async function loadLead(idOrRef: string): Promise<LeadCtx | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(idOrRef);
  const { data: e } = await db().from('enquiries').select('*').eq(isUuid ? 'id' : 'ref', idOrRef).maybeSingle();
  if (!e) return null;
  const [{ data: ex }, { data: calls }] = await Promise.all([
    db().from('extractions').select('*').eq('enquiry_id', e.id).order('created_at', { ascending: false }).limit(1),
    db().from('calls').select('id, started_at, recording_url, recording_path').eq('enquiry_id', e.id).order('started_at', { ascending: false }),
  ]);
  const x = ex?.[0];
  const rec = (calls ?? []).find((c: any) => c.recording_url || c.recording_path);
  return {
    id: e.id, ref: e.ref, channel: e.channel, simulated: e.simulated, callerNumber: e.caller_number ?? normalizePhone(x?.fields?.callback_number) ?? null, callerName: e.caller_name,
    callAt: new Date(e.first_contact_at), afterHours: e.after_hours, verdict: e.verdict, category: e.category, status: e.status,
    priority: e.priority, priorityReason: e.priority_reason, referral: e.referral_name,
    fields: x?.fields ?? null, note: x?.handoff_note ?? e.handoff_note ?? '', stillUnknown: x?.still_unknown ?? [], notes: x?.notes ?? [],
    priceAsked: !!x?.price_asked, mood: x?.caller_mood ?? null, callbackDue: e.callback_due_at ? new Date(e.callback_due_at) : null,
    assignedDesignerId: e.assigned_designer_id, recordingCallId: rec?.id ?? null, hasRecording: !!rec,
    criteria: x?.criteria ?? [], existingClient: x?.existing_client ?? null, raw: e,
  };
}

export async function getDesigner(id: string): Promise<Designer | null> {
  const { data } = await db().from('designers').select('*').eq('id', id).maybeSingle();
  return (data as Designer) ?? null;
}
export async function listDesigners(): Promise<Designer[]> {
  return must(await db().from('designers').select('*').order('name'), 'listDesigners') as Designer[];
}

/** Active, not on leave, and the rota covers the day the callback is due. */
export async function eligibleDesigners(opts: { exclude?: string[]; when?: Date } = {}): Promise<Designer[]> {
  const all = (await listDesigners()).filter((d) => d.active && !d.on_leave && !(opts.exclude ?? []).includes(d.id));
  if (!opts.when) return all;
  const dow = istParts(opts.when).dow;
  const onRota = all.filter((d) => (d.rota?.days ?? [1, 2, 3, 4, 5, 6]).includes(dow));
  return onRota.length ? onRota : all;
}

/** Round robin: matching speciality first, then whoever was assigned longest ago. */
export function pickDesigner(cands: Designer[], propertyType: string | null | undefined): Designer | null {
  if (!cands.length) return null;
  const commercial = !!propertyType && /office|clinic|studio|commercial|coworking|pod|shop/i.test(propertyType);
  const want = commercial ? 'commercial' : 'residential';
  const matching = cands.filter((d) => d.specialities?.includes(want));
  const pool = matching.length ? matching : cands;
  return [...pool].sort((a, b) => (a.last_assigned_at ? Date.parse(a.last_assigned_at) : 0) - (b.last_assigned_at ? Date.parse(b.last_assigned_at) : 0))[0];
}

export async function currentHandoff(enquiryId: string): Promise<any | null> {
  const { data } = await db().from('handoffs').select('*').eq('enquiry_id', enquiryId).is('passed_at', null).is('reassigned_at', null).order('sent_at', { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

export const designerOnDutyNow = (d: Designer, now: Date): boolean => inDesignerHours(now, d.rota);

export const shortId = (id: string): string => id.replace(/-/g, '').slice(0, 6);

/** A designer may open a lead only if it is, or ever was, handed to them. (Admins use Brief Book instead.) */
export async function canViewLead(designerId: string, enquiryId: string): Promise<boolean> {
  const { data } = await db().from('handoffs').select('id').eq('enquiry_id', enquiryId).eq('designer_id', designerId).limit(1);
  return !!data?.length;
}
