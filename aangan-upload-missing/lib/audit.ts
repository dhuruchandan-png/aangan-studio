// Accountability: every action and system step is stamped with who did it, when, and from where.
import { db } from './db';

export interface Actor { type: 'designer' | 'admin' | 'system'; id?: string | null; name: string }
export const SYSTEM: Actor = { type: 'system', name: 'The assistant' };

export async function logAction(enquiryId: string, actor: Actor, action: string, o: { detail?: string; via?: string; at?: Date } = {}): Promise<void> {
  await db().from('actions_log').insert({
    enquiry_id: enquiryId, actor_type: actor.type, actor_id: actor.id ?? null, actor_name: actor.name, action,
    detail: o.detail ?? null, via: o.via ?? null, at: (o.at ?? new Date()).toISOString(),
  });
}

export async function getActivity(enquiryId: string): Promise<{ id: string; actor_type: string; actor_name: string; action: string; detail: string | null; via: string | null; at: string }[]> {
  const { data } = await db().from('actions_log').select('id, actor_type, actor_name, action, detail, via, at').eq('enquiry_id', enquiryId).order('at');
  return data ?? [];
}
