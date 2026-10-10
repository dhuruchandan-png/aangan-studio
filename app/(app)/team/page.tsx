import Link from 'next/link';
import { Badge, Empty, Label, Page, PageHeader, PlanIcon, Sheet, StatusChip, VerdictChip } from '@/components/ui';
import { db, must } from '@/lib/db';
import { demoOpen, simScope } from '@/lib/demo';
import { fmtDateTime } from '@/lib/time';
import { whenWords } from '@/lib/notify/templates';

export const dynamic = 'force-dynamic';

const SEG = [
  { key: 'routed', label: 'Waiting to accept', short: 'waiting', color: '#B8913F' },
  { key: 'accepted', label: 'Accepted', short: 'accepted', color: '#2F4A6D' },
  { key: 'called_back', label: 'Called back', short: 'called', color: '#6F8A6E' },
  { key: 'consult_booked', label: 'Consultation booked', short: 'booked', color: '#4F6A4E' },
];
const TINTS = ['#B8573A', '#2F4A6D', '#6F8A6E', '#B8913F', '#7A4E2D', '#8C5A7A'];
function Avatar({ name }: { name: string }) {
  const ini = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: TINTS[h % TINTS.length] }}>{ini}</span>;
}

const OPEN = ['routed', 'accepted', 'called_back', 'consult_booked'];

interface Row { id: string; ref: string; caller_name: string | null; locality: string | null; property_type: string | null; verdict: string | null; status: string; priority: boolean; callback_due_at: string | null; assigned_designer_id: string | null; simulated: boolean }

export default async function TeamPage() {
  let designers: any[] = [], rows: Row[] = [], handoffs: any[] = [], err: string | null = null;
  try {
    designers = must(await db().from('designers').select('id, name, active, on_leave, specialities').eq('active', true).order('name'), 'designers');
    rows = must(await db().from('enquiries').select('id, ref, caller_name, locality, property_type, verdict, status, priority, callback_due_at, assigned_designer_id, simulated').in('simulated', simScope()).in('verdict', ['qualified', 'unsure', 'escalate']).order('first_contact_at', { ascending: false }).limit(300), 'enquiries');
    handoffs = must(await db().from('handoffs').select('enquiry_id, designer_id, sent_at, accepted_at').in('simulated', simScope()), 'handoffs');
  } catch (e) { err = (e as Error).message; }

  const now = new Date();
  const mine = (id: string) => rows.filter((r) => r.assigned_designer_id === id);
  const unassigned = rows.filter((r) => !r.assigned_designer_id && ['routed', 'new'].includes(r.status));
  const acceptMin = (r: Row): number | null => {
    const h = handoffs.filter((x) => x.enquiry_id === r.id && x.designer_id === r.assigned_designer_id && x.accepted_at).sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];
    return h ? Math.round((new Date(h.accepted_at).getTime() - new Date(h.sent_at).getTime()) / 60000) : null;
  };
  const label = (r: Row) => [r.caller_name ?? 'Caller', r.locality].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader title="Team" plain="Who has been assigned what, and where each lead stands." />
      <Page>
        {err ? <Sheet tone="terracotta"><Label>Could not load the team</Label><p className="mt-2 text-sm">{err}</p></Sheet> : (
          <>
            <Sheet>
              <Label>The whole studio at a glance</Label>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                {SEG.map((g) => <span key={g.key} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />{g.label}</span>)}
              </div>
              <ul className="mt-3 divide-y divide-clay/60">
                {designers.map((d) => {
                  const l = mine(d.id);
                  const n = (st: string) => l.filter((r) => r.status === st).length;
                  const overdue = l.filter((r) => ['routed', 'accepted'].includes(r.status) && r.callback_due_at && new Date(r.callback_due_at) < now).length;
                  const total = SEG.reduce((a, g) => a + n(g.key), 0);
                  return (
                    <li key={d.id} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 py-3 md:grid-cols-[auto_11rem_1fr_auto]">
                      <Avatar name={d.name} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{d.name}{d.on_leave && <span className="ml-2"><Badge tone="indigo">Away</Badge></span>}</div>
                        <div className="truncate text-xs text-muted">{(d.specialities ?? []).join(' · ') || 'no speciality set'}</div>
                      </div>
                      <div className="col-span-2 md:col-span-1">
                        {total === 0
                          ? <div className="h-2.5 rounded-full bg-[#F1E8DA]" title="Nothing assigned" />
                          : <div className="flex h-2.5 overflow-hidden rounded-full bg-[#F1E8DA]">{SEG.map((g) => n(g.key) > 0 && <span key={g.key} style={{ width: `${(n(g.key) / total) * 100}%`, background: g.color }} title={`${g.label}: ${n(g.key)}`} />)}</div>}
                        <div className="num mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">{SEG.map((g) => <span key={g.key}>{g.short} {n(g.key)}</span>)}</div>
                      </div>
                      <div className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto">
                        {overdue > 0 ? <Badge tone="alert">{overdue} overdue</Badge> : total > 0 ? <span className="text-xs font-medium text-sage-deep">on track</span> : <span className="text-xs text-muted">free</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex items-center justify-between rounded-xl bg-[#F7E9D8] px-3.5 py-2.5 text-sm"><span className="text-teak">Front-desk queue (not yet with a designer)</span><span className="figure text-lg font-semibold">{unassigned.length}</span></div>
            </Sheet>

            {designers.length === 0 && <Sheet><Empty line="No employees yet. Add them on the Studio Roster." /></Sheet>}

            <div className="grid gap-5 lg:grid-cols-2">
              {designers.map((d) => {
                const l = mine(d.id);
                return (
                  <Sheet key={d.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Avatar name={d.name} />
                        <div>
                          <h2 className="display text-xl font-semibold">{d.name}</h2>
                          <div className="annot mt-0.5">{(d.specialities ?? []).join(' · ') || 'no speciality set'}</div>
                        </div>
                      </div>
                      <form method="post" action="/api/demo/as">
                        <input type="hidden" name="designer" value={d.id} />
                        <button className="btn btn-ghost text-sm" disabled={!demoOpen()}>View {d.name.split(' ')[0]}&apos;s dashboard →</button>
                      </form>
                    </div>
                    {l.length === 0 ? <p className="mt-4 text-sm text-muted">Nothing assigned right now.</p> : (
                      <ul className="mt-3 divide-y divide-clay/70">
                        {l.map((r) => {
                          const am = acceptMin(r);
                          const late = ['routed', 'accepted'].includes(r.status) && r.callback_due_at && new Date(r.callback_due_at) < now;
                          return (
                            <li key={r.id} className="py-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <PlanIcon type={r.property_type} size={20} />
                                <Link href={`/brief/${r.ref}`} className="font-medium text-indigo underline-offset-2 hover:underline">{label(r)}</Link>
                                <span className="num text-xs text-muted">#{r.ref}</span>
                                {r.priority && <Badge tone="terracotta">Priority</Badge>}
                                {r.simulated && <Badge tone="indigo">Sample</Badge>}
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                                <VerdictChip verdict={r.verdict} /><StatusChip status={r.status} />
                                {r.callback_due_at && OPEN.includes(r.status) && r.status !== 'consult_booked' && <span className={`num ${late ? 'font-semibold text-alert' : 'text-muted'}`}>call back by {whenWords(new Date(r.callback_due_at), now)}{late ? ' · overdue' : ''}</span>}
                                {am !== null && <span className="text-muted">accepted in <span className="num">{am}</span> min</span>}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Sheet>
                );
              })}
            </div>

            {unassigned.length > 0 && (
              <Sheet tone="terracotta">
                <Label>With the front desk (no designer yet)</Label>
                <ul className="mt-3 divide-y divide-clay/70">
                  {unassigned.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5">
                      <Link href={`/brief/${r.ref}`} className="font-medium text-indigo hover:underline">{label(r)}</Link><span className="num text-xs text-muted">#{r.ref}</span>
                      <VerdictChip verdict={r.verdict} />{r.priority && <Badge tone="terracotta">Priority</Badge>}
                      <span className="text-xs text-muted">since {fmtDateTime(r.callback_due_at)}</span>
                    </li>
                  ))}
                </ul>
              </Sheet>
            )}
          </>
        )}
      </Page>
    </>
  );
}
