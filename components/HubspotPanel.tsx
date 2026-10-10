import { HubspotSyncButton } from '@/components/HubspotSyncButton';
import { Label, Sheet } from '@/components/ui';
import { hubspotEnabled, dealUrl } from '@/lib/crm/hubspot';
import { getConfig } from '@/lib/crm/sync';
import { rawQuery } from '@/lib/db';
import { fmtDateTime } from '@/lib/time';

/** Where this enquiry stands in HubSpot. Sample and rehearsal enquiries are never sent automatically. */
export async function HubspotPanel({ enquiryId, refCode, simulated }: { enquiryId: string; refCode: string; simulated: boolean }) {
  if (!hubspotEnabled()) {
    return (
      <Sheet><Label>HubSpot</Label><p className="mt-2 text-sm text-muted">Not connected. Add <span className="num">HUBSPOT_ACCESS_TOKEN</span> to switch the HubSpot sync on.</p></Sheet>
    );
  }
  let link: { contact_id: string | null; deal_id: string | null; synced_at: string | null; error: string | null; attempts: number } | undefined;
  let url: string | null = null;
  try {
    link = (await rawQuery('select contact_id, deal_id, synced_at, error, attempts from crm_links where enquiry_id = $1', [enquiryId])).rows[0];
    const { cfg } = await getConfig();
    if (cfg && link?.deal_id) url = dealUrl(cfg, link.deal_id);
  } catch { /* the panel is informational */ }
  const sent = !!link?.deal_id || (!!link?.contact_id && !link?.error);
  return (
    <Sheet tone={link?.error ? 'terracotta' : undefined}>
      <Label>HubSpot</Label>
      {sent && <p className="mt-2 text-sm text-sage-deep">Sent to HubSpot{link?.synced_at ? <> · <span className="num">{fmtDateTime(link.synced_at)}</span></> : null}.{' '}
        {url ? <a href={url} target="_blank" rel="noreferrer" className="font-medium text-indigo underline">Open the deal →</a> : null}</p>}
      {link?.error && <p className="mt-2 text-sm text-terracotta-deep">Last attempt failed ({link.attempts}×): {link.error}. It is retried every few minutes.</p>}
      {!sent && !link?.error && (
        <p className="mt-2 text-sm text-muted">{simulated ? 'Sample / rehearsal enquiry: not sent to HubSpot automatically.' : 'Not sent yet. New enquiries are sent as soon as the call is read.'}</p>
      )}
      <div className="mt-3"><HubspotSyncButton refCode={refCode} force={simulated} label={sent ? 'Send an update now' : 'Send to HubSpot now'} /></div>
    </Sheet>
  );
}
