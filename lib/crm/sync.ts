// Persists the HubSpot sync: which enquiry maps to which Contact/Deal, retries, and the hooks the pipeline calls.
// Never throws and never blocks a call: a failure is stored on the link and retried from the 5-minute tick.
import { db, getSetting, rawQuery, setSetting } from '../db';
import { getDesigner, loadLead } from '../leads';
import { adminBriefUrl } from '../notify/links';
import { hubspotEnabled, resolveConfig, syncLead, type HubspotConfig } from './hubspot';
import type { CrmLead } from './map';

const CONFIG_KEY = 'hubspot_config';

export async function getConfig(refresh = false): Promise<{ cfg: HubspotConfig | null; error?: string }> {
  if (!refresh) {
    const saved = await getSetting<HubspotConfig | null>(CONFIG_KEY, null);
    if (saved?.pipelineId) return { cfg: saved };
  }
  const r = await resolveConfig();
  if (r.cfg) await setSetting(CONFIG_KEY, r.cfg);
  return r;
}

async function toCrmLead(idOrRef: string): Promise<{ lead: CrmLead; id: string; simulated: boolean } | { skip: string }> {
  const l = await loadLead(idOrRef);
  if (!l) return { skip: 'enquiry not found' };
  if (!l.verdict || l.verdict === 'other') return { skip: 'not a lead (other / unread)' };
  const d = l.assignedDesignerId ? await getDesigner(l.assignedDesignerId) : null;
  const f = l.fields;
  return {
    id: l.id, simulated: l.simulated,
    lead: {
      kind: l.category === 'existing_client_escalation' ? 'existing_client' : 'lead', ref: l.ref, name: l.callerName ?? f?.name ?? null, phone: l.callerNumber,
      locality: f?.locality ?? null, propertyType: f?.property_type ?? null, bhk: f?.size_bhk ?? null, carpetSqft: f?.carpet_sqft ?? null, scope: f?.scope ?? null,
      timeline: f?.timeline_text ?? null, source: f?.source ?? null, referral: l.referral, verdict: l.verdict, status: l.status, priority: l.priority,
      priorityReason: l.priorityReason, note: l.note, stillUnknown: l.stillUnknown, designerName: d?.name ?? null, designerEmail: d?.email ?? null,
      dashboardUrl: adminBriefUrl(l.ref), callAtIso: l.callAt.toISOString(),
    },
  };
}

export interface SyncOutcome { ok: boolean; skipped?: string; error?: string; contactId?: string | null; dealId?: string | null; warnings?: string[] }

/**
 * Push one enquiry to HubSpot. Real enquiries only: rehearsals and sample rows are skipped unless `force`.
 * `event` (an action name) adds a one-line timeline note on the deal.
 */
export async function syncEnquiry(idOrRef: string, opts: { event?: string; detail?: string; force?: boolean } = {}): Promise<SyncOutcome> {
  if (!hubspotEnabled()) return { ok: true, skipped: 'HubSpot is not configured' };
  try {
    const built = await toCrmLead(idOrRef);
    if ('skip' in built) return { ok: true, skipped: built.skip };
    if (built.simulated && !opts.force) return { ok: true, skipped: 'sample / rehearsal enquiry (not sent to HubSpot)' };
    const { cfg, error } = await getConfig();
    if (!cfg) return { ok: false, error: error ?? 'HubSpot is not set up yet (run npm run hubspot:setup)' };

    const { rows } = await rawQuery('select contact_id, deal_id, attempts from crm_links where enquiry_id = $1', [built.id]);
    const link = rows[0] as { contact_id: string | null; deal_id: string | null; attempts: number } | undefined;
    const r = await syncLead(built.lead, { contactId: link?.contact_id, dealId: link?.deal_id }, cfg, opts.event ? { name: opts.event, detail: opts.detail } : undefined);

    await db().from('crm_links').upsert({
      enquiry_id: built.id, contact_id: r.contactId, deal_id: r.dealId, stage_id: r.stageId, last_event: opts.event ?? 'sync',
      synced_at: r.ok ? new Date().toISOString() : null, error: r.ok ? null : r.error ?? 'failed', attempts: r.ok ? 0 : (link?.attempts ?? 0) + 1, updated_at: new Date().toISOString(),
    }, { onConflict: 'enquiry_id' });
    return { ok: r.ok, error: r.error, contactId: r.contactId, dealId: r.dealId, warnings: r.warnings };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Called from the 5-minute tick: enquiries that never reached HubSpot, or whose last attempt failed. */
export async function retryPendingCrm(limit = 15): Promise<number> {
  if (!hubspotEnabled()) return 0;
  const { rows } = await rawQuery(
    `select e.id from enquiries e left join crm_links c on c.enquiry_id = e.id
      where e.simulated = false and e.verdict in ('qualified','unsure','not_a_fit','escalate')
        and ((c.enquiry_id is null and e.first_contact_at < now() - interval '2 minutes')
          or (c.error is not null and c.attempts < 8 and c.updated_at < now() - interval '5 minutes'))
      order by e.first_contact_at limit $1`, [limit]);
  let n = 0;
  for (const r of rows as { id: string }[]) { const o = await syncEnquiry(r.id); if (o.ok && !o.skipped) n++; }
  return n;
}
