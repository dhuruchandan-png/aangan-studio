import { RehearsalTabs } from '@/components/rehearsal/RehearsalTabs';
import type { DesignerOption, EnquiryRow, FixtureOption, WaitingRow } from '@/components/rehearsal/types';
import { Label, Page, PageHeader, Sheet } from '@/components/ui';
import { db } from '@/lib/db';
import { PHONE_FIXTURES } from '@/lib/fixtures';
import { listDesigners } from '@/lib/leads';

export const dynamic = 'force-dynamic';

const COLS = 'ref, caller_number, caller_name, locality, verdict, status, first_contact_at, simulated';

export default async function RehearsalPage() {
  const fixtures: FixtureOption[] = PHONE_FIXTURES.map((f) => ({
    id: f.id, label: f.label, date: f.started_at.slice(0, 10), expected: f.expect.verdicts ?? [], missed: !!f.missed, priority: !!f.expect.priority,
  }));

  let designers: DesignerOption[] = [];
  let recentSim: EnquiryRow[] = [];
  let recentAll: EnquiryRow[] = [];
  let waiting: WaitingRow[] = [];
  let loadError: string | null = null;
  try {
    const ds = await listDesigners();
    designers = ds.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name }));
    const [sim, all, routed] = await Promise.all([
      db().from('enquiries').select(COLS).eq('simulated', true).order('first_contact_at', { ascending: false }).limit(15),
      db().from('enquiries').select(COLS).order('first_contact_at', { ascending: false }).limit(25),
      db().from('enquiries').select('id, ref').eq('simulated', true).eq('status', 'routed'),
    ]);
    recentSim = (sim.data ?? []) as EnquiryRow[];
    recentAll = (all.data ?? []) as EnquiryRow[];
    const routedRows = (routed.data ?? []) as { id: string; ref: string }[];
    if (routedRows.length) {
      const { data: hs } = await db()
        .from('handoffs')
        .select('enquiry_id, designer_id, sent_at')
        .in('enquiry_id', routedRows.map((r) => r.id))
        .is('accepted_at', null).is('passed_at', null).is('reassigned_at', null)
        .order('sent_at', { ascending: false });
      const nameOf = new Map(ds.map((d) => [d.id, d.name]));
      const refOf = new Map(routedRows.map((r) => [r.id, r.ref]));
      const seen = new Set<string>();
      for (const h of (hs ?? []) as { enquiry_id: string; designer_id: string; sent_at: string }[]) {
        if (seen.has(h.enquiry_id)) continue;
        seen.add(h.enquiry_id);
        waiting.push({ ref: refOf.get(h.enquiry_id) ?? '', designer: nameOf.get(h.designer_id) ?? null, sentAt: h.sent_at });
      }
      waiting = waiting.filter((w) => w.ref);
    }
  } catch (e) {
    loadError = (e as Error).message;
  }

  return (
    <>
      <PageHeader title="Rehearsal Room" plain="Test the whole flow without spending a real call." />
      <Page>
        <Sheet>
          <Label>Everything here is simulated</Label>
          <p className="mt-1 text-sm text-muted">
            Rehearsals are marked as simulated and never count in the Courtyard numbers. Every email a rehearsal sends goes to the <b className="text-ink">test address</b> (TEST_EMAIL), never to a real designer, front desk or Nikhil, and says who it was meant for.
          </p>
        </Sheet>
        {loadError && (
          <Sheet tone="terracotta">
            <p className="text-sm text-terracotta-deep">Some lists could not be loaded ({loadError}). The tools below still work where they can.</p>
          </Sheet>
        )}
        <RehearsalTabs fixtures={fixtures} designers={designers} recentSim={recentSim} recentAll={recentAll} waiting={waiting} />
      </Page>
    </>
  );
}
