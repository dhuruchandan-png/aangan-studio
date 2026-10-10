// HubSpot client + the sync of one lead. Network only; no database here (lib/crm/sync.ts does the persistence).
// All calls return { ok, status, data, error } and never throw, so a HubSpot hiccup can never break a phone call's pipeline.
import { env } from '../env';
import {
  contactProperties, CUSTOM_PROPERTIES, dealProperties, DEFAULT_STAGE_LABELS, eventNoteHtml, last10, stageKeyFor, summaryNoteHtml,
  type CrmLead, type StageKey,
} from './map';

const BASE = 'https://api.hubapi.com';
export const hubspotEnabled = (): boolean => !!env('HUBSPOT_ACCESS_TOKEN');

export interface HsRes<T = any> { ok: boolean; status: number; data: T; error?: string } // eslint-disable-line @typescript-eslint/no-explicit-any

export async function hs<T = any>(method: string, path: string, body?: unknown, token = env('HUBSPOT_ACCESS_TOKEN')): Promise<HsRes<T>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!token) return { ok: false, status: 0, data: null as T, error: 'HUBSPOT_ACCESS_TOKEN is not set' };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15_000);
      const res = await fetch(BASE + path, {
        method, signal: ctl.signal, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }).finally(() => clearTimeout(timer));
      const text = await res.text();
      let data: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if ((res.status === 429 || res.status >= 500) && attempt < 2) { await new Promise((r) => setTimeout(r, 700 * (attempt + 1) * (res.status === 429 ? 3 : 1))); continue; }
      return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : `${res.status} ${data?.message ?? text.slice(0, 200)}` };
    } catch (e) {
      if (attempt === 2) return { ok: false, status: 0, data: null as T, error: (e as Error).message };
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  return { ok: false, status: 0, data: null as T, error: 'unreachable' };
}

// ------------------------------------------------------------------ one-time setup
export interface HubspotConfig { pipelineId: string; stages: Record<StageKey, string>; stageLabels: Record<StageKey, string>; portalId?: string | null; region: string }

export const hubspotRegion = (): string => /^pat-([a-z0-9]+)-/i.exec(env('HUBSPOT_ACCESS_TOKEN'))?.[1] ?? 'na1';
export const dealUrl = (cfg: Pick<HubspotConfig, 'portalId' | 'region'>, dealId: string): string | null =>
  cfg.portalId ? `https://app-${cfg.region}.hubspot.com/contacts/${cfg.portalId}/record/0-3/${dealId}` : null;

/** Creates the custom properties we need (skips ones that exist). */
export async function ensureProperties(): Promise<{ created: string[]; existed: number; failed: { name: string; error: string }[] }> {
  const out = { created: [] as string[], existed: 0, failed: [] as { name: string; error: string }[] };
  for (const p of CUSTOM_PROPERTIES) {
    const have = await hs('GET', `/crm/v3/properties/${p.object}/${p.name}`);
    if (have.ok) { out.existed++; continue; }
    const r = await hs('POST', `/crm/v3/properties/${p.object}`, {
      name: p.name, label: p.label, type: p.type, fieldType: p.fieldType, groupName: p.object === 'deals' ? 'dealinformation' : 'contactinformation',
    });
    if (r.ok) out.created.push(`${p.object}.${p.name}`); else out.failed.push({ name: `${p.object}.${p.name}`, error: r.error ?? 'failed' });
  }
  return out;
}

/** Finds the deal pipeline and maps each of our stage keys to a real stage id (by label, with sensible fallbacks). */
export async function resolveConfig(): Promise<{ cfg: HubspotConfig | null; error?: string }> {
  const r = await hs('GET', '/crm/v3/pipelines/deals');
  if (!r.ok) return { cfg: null, error: r.error };
  const pipelines: any[] = r.data?.results ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const want = env('HUBSPOT_PIPELINE_ID');
  const pipe = pipelines.find((p) => p.id === want || p.label === want) ?? pipelines.find((p) => p.id === 'default') ?? pipelines[0];
  if (!pipe) return { cfg: null, error: 'No deal pipeline found in this HubSpot account' };
  const stages: any[] = [...pipe.stages].sort((a, b) => a.displayOrder - b.displayOrder); // eslint-disable-line @typescript-eslint/no-explicit-any
  const byLabel = (label: string) => stages.find((s) => s.label.toLowerCase() === label.toLowerCase());
  const lostStage = stages.find((s) => s.metadata?.isClosed === 'true' && Number(s.metadata?.probability) === 0);
  const pick = (key: StageKey, idx: number) => byLabel(DEFAULT_STAGE_LABELS[key]) ?? (key === 'lost' ? lostStage : undefined) ?? stages[Math.min(idx, stages.length - 1)];
  const chosen: Record<StageKey, any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
    unsure: pick('unsure', 0), routed: pick('routed', 1), accepted: pick('accepted', 2), called_back: pick('called_back', 2),
    consult_booked: pick('consult_booked', 3), lost: pick('lost', stages.length - 1),
  };
  const acct = await hs('GET', '/account-info/v3/details');
  return {
    cfg: {
      pipelineId: pipe.id, region: hubspotRegion(), portalId: acct.ok ? String(acct.data?.portalId ?? '') || null : null,
      stages: Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, v.id])) as Record<StageKey, string>,
      stageLabels: Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, v.label])) as Record<StageKey, string>,
    },
  };
}

// ------------------------------------------------------------------ owners (designer email -> HubSpot user)
let ownerCache: { at: number; map: Map<string, string> } | null = null;
export async function ownerIdFor(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  if (!ownerCache || Date.now() - ownerCache.at > 10 * 60_000) {
    const r = await hs('GET', '/crm/v3/owners?limit=500');
    ownerCache = { at: Date.now(), map: new Map(((r.ok ? r.data?.results : []) as any[]).map((o) => [String(o.email ?? '').toLowerCase(), String(o.id)])) }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  return ownerCache.map.get(email.toLowerCase()) ?? null;
}

// ------------------------------------------------------------------ syncing one lead
export interface CrmExisting { contactId?: string | null; dealId?: string | null }
export interface CrmResult { ok: boolean; contactId: string | null; dealId: string | null; stageId: string | null; createdContact: boolean; createdDeal: boolean; noteIds: string[]; error?: string; warnings: string[] }

async function findContactByPhone(phone: string): Promise<{ id: string; firstname?: string; lastname?: string } | null> {
  const l10 = last10(phone);
  if (!l10) return null;
  const r = await hs('POST', '/crm/v3/objects/contacts/search', {
    filterGroups: [{ filters: [{ propertyName: 'hs_searchable_calculated_phone_number', operator: 'EQ', value: l10 }] }],
    properties: ['firstname', 'lastname', 'phone'], limit: 1,
  });
  const hit = r.ok ? r.data?.results?.[0] : null;
  return hit ? { id: String(hit.id), firstname: hit.properties?.firstname ?? '', lastname: hit.properties?.lastname ?? '' } : null;
}

async function addNote(html: string, assoc: { dealId?: string | null; contactId?: string | null }): Promise<string | null> {
  const n = await hs('POST', '/crm/v3/objects/notes', { properties: { hs_timestamp: new Date().toISOString(), hs_note_body: html } });
  if (!n.ok) return null;
  const id = String(n.data.id);
  if (assoc.dealId) await hs('PUT', `/crm/v4/objects/notes/${id}/associations/default/deals/${assoc.dealId}`);
  if (assoc.contactId) await hs('PUT', `/crm/v4/objects/notes/${id}/associations/default/contacts/${assoc.contactId}`);
  return id;
}

/**
 * Creates or updates the Contact and Deal for one lead, and appends a note: the full brief the first time,
 * a one-line timeline note for each later event. Idempotent: pass the ids you got last time as `existing`.
 */
export async function syncLead(lead: CrmLead, existing: CrmExisting, cfg: HubspotConfig, event?: { name: string; detail?: string }): Promise<CrmResult> {
  const res: CrmResult = { ok: false, contactId: existing.contactId ?? null, dealId: existing.dealId ?? null, stageId: null, createdContact: false, createdDeal: false, noteIds: [], warnings: [] };
  const fail = (msg: string): CrmResult => ({ ...res, ok: false, error: msg });

  // ---- contact: reuse by id, else by phone (so a repeat caller never becomes a duplicate), else create
  let found: { id: string; firstname?: string; lastname?: string } | null = null;
  if (!res.contactId && lead.phone) found = await findContactByPhone(lead.phone);
  if (found) res.contactId = found.id;
  if (res.contactId) {
    const r = await hs('PATCH', `/crm/v3/objects/contacts/${res.contactId}`, { properties: contactProperties(lead, { creating: false, existing: found ?? undefined }) });
    if (!r.ok) res.warnings.push(`contact update: ${r.error}`);
  } else if (lead.phone || lead.name) {
    const r = await hs('POST', '/crm/v3/objects/contacts', { properties: contactProperties(lead, { creating: true }) });
    if (!r.ok) return fail(`contact create: ${r.error}`);
    res.contactId = String(r.data.id); res.createdContact = true;
  }

  // ---- an existing client's complaint is a note on their record, not a new deal
  if (lead.kind === 'existing_client') {
    if (res.contactId && !existing.dealId && !event) {
      const id = await addNote(summaryNoteHtml(lead), { contactId: res.contactId });
      if (id) res.noteIds.push(id); else res.warnings.push('could not add the escalation note');
    }
    return { ...res, ok: true };
  }

  // ---- deal
  const stageKey = stageKeyFor({ verdict: lead.verdict, status: lead.status });
  const stageId = cfg.stages[stageKey];
  res.stageId = stageId;
  const owner = await ownerIdFor(lead.designerEmail);
  if (lead.designerEmail && !owner) res.warnings.push(`no HubSpot user with the email ${lead.designerEmail}, so the deal has no owner`);
  const props: Record<string, string | number> = { ...dealProperties(lead), pipeline: cfg.pipelineId, dealstage: stageId };
  if (owner) props.hubspot_owner_id = owner;

  if (res.dealId) {
    const r = await hs('PATCH', `/crm/v3/objects/deals/${res.dealId}`, { properties: props });
    if (!r.ok) return fail(`deal update: ${r.error}`);
  } else {
    const r = await hs('POST', '/crm/v3/objects/deals', { properties: props });
    if (!r.ok) return fail(`deal create: ${r.error}`);
    res.dealId = String(r.data.id); res.createdDeal = true;
  }
  if (res.contactId && (res.createdDeal || res.createdContact)) {
    const a = await hs('PUT', `/crm/v4/objects/deals/${res.dealId}/associations/default/contacts/${res.contactId}`);
    if (!a.ok) res.warnings.push(`could not link the deal to the contact: ${a.error}`);
  }

  // ---- notes
  if (res.createdDeal) {
    const id = await addNote(summaryNoteHtml(lead), { dealId: res.dealId, contactId: res.contactId });
    if (id) res.noteIds.push(id); else res.warnings.push('could not add the brief note');
  } else if (event) {
    const html = eventNoteHtml(event.name, lead.designerName, event.detail);
    if (html) { const id = await addNote(html, { dealId: res.dealId }); if (id) res.noteIds.push(id); else res.warnings.push('could not add the timeline note'); }
  }
  return { ...res, ok: true };
}

/** Removes records we created (used only by the self-test). */
export async function archive(type: 'contacts' | 'deals' | 'notes', id: string): Promise<boolean> {
  return (await hs('DELETE', `/crm/v3/objects/${type}/${id}`)).ok;
}
