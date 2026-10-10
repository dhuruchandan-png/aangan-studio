import { AddDesigner } from '@/components/roster/AddDesigner';
import { RosterCard, type CardStats } from '@/components/roster/RosterCard';
import { Empty, Label, Page, PageHeader, Sheet } from '@/components/ui';
import { listDesigners, type Designer } from '@/lib/leads';
import { computeStats, minS, pctS, type DesignerStat } from '@/lib/stats';
import { istMonthRange } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function RosterPage() {
  let designers: Designer[] = [];
  let statMap = new Map<string, DesignerStat>();
  let loadError: string | null = null;
  try {
    designers = await listDesigners();
  } catch (e) {
    loadError = (e as Error).message;
  }
  if (!loadError) {
    try {
      const r = istMonthRange(new Date(), 0);
      const s = await computeStats(r.start, r.end);
      statMap = new Map(s.designers.map((d) => [d.id, d]));
    } catch {
      /* stats are a nicety; the roster still works without them */
    }
  }

  const activeOnes = designers.filter((d) => d.active);
  const withEmail = activeOnes.filter((d) => !!d.email).length;
  const noEmail = activeOnes.length - withEmail;

  return (
    <>
      <PageHeader title="Studio Roster" plain="Designers, their email addresses and who is on the rota." />
      <Page>
        {loadError ? (
          <Sheet tone="terracotta">
            <Label>Could not load the roster</Label>
            <p className="mt-2 text-sm">The designer list is not available just now ({loadError}). Check the database connection and refresh.</p>
          </Sheet>
        ) : (
          <>
            <Sheet>
              <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
                <div><Label>Reachable by email</Label><div className="display num mt-1 text-4xl font-semibold text-sage-deep">{withEmail}</div></div>
                <div><Label>No email yet</Label><div className={`display num mt-1 text-4xl font-semibold ${noEmail ? 'text-brass-deep' : 'text-ink'}`}>{noEmail}</div></div>
                <p className="max-w-md flex-1 text-sm text-muted">
                  Every handoff, reminder and digest goes to the designer's email, with one-tap buttons to accept, call back and book. A designer with no address cannot receive leads, so fill this in first.
                </p>
              </div>
            </Sheet>

            {designers.length === 0 ? (
              <Sheet><Empty line="No designers yet. Add the first one below, with their email address." /></Sheet>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {designers.map((d) => {
                  const st = statMap.get(d.id);
                  const stats: CardStats | null = st
                    ? { handoffs: st.handoffs, accept: minS(st.medianAcceptMin), kept: pctS(st.calledBackOnTimePct), consults: st.consults, nudged: st.nudged, movedAway: st.movedAway }
                    : null;
                  return <RosterCard key={d.id} designer={d} stats={stats} />;
                })}
              </div>
            )}

            <AddDesigner />
          </>
        )}
      </Page>
    </>
  );
}
