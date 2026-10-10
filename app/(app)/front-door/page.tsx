import { demoOpen, simScope } from '@/lib/demo';
import Link from 'next/link';
import { AutoRefresh } from '@/components/AutoRefresh';
import { errMsg } from '@/components/format';
import { Badge, Empty, Label, Page, PageHeader, PlanIcon, Sheet, StatusChip, TimeOfDay, VerdictChip } from '@/components/ui';
import { db, must } from '@/lib/db';
import { listDesigners } from '@/lib/leads';
import { addDays, fmtDate, fmtDuration, fmtTime, istDate, istDayKey, istParts } from '@/lib/time';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;
interface EnqRow {
  id: string; ref: string; caller_number: string | null; caller_name: string | null; first_contact_at: string; verdict: string | null; status: string;
  priority: boolean; referral_name: string | null; assigned_designer_id: string | null; locality: string | null; property_type: string | null;
  after_hours: boolean; simulated: boolean;
}
interface CallRow { enquiry_id: string; started_at: string; duration_sec: number | null; after_hours: boolean; answered: boolean; ring_to_answer_sec: number | null }

const VERDICTS = [['all', 'Any verdict'], ['qualified', 'Qualified'], ['unsure', 'Unsure'], ['not_a_fit', 'Not a fit'], ['escalate', 'Escalate'], ['other', 'Other']] as const;

export default async function FrontDoor({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const verdict = sp.verdict && sp.verdict !== 'all' && VERDICTS.some(([v]) => v === sp.verdict) ? sp.verdict : 'all';
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : '';
  const designerId = sp.designer && /^[0-9a-f-]{36}$/i.test(sp.designer) ? sp.designer : '';
  const afterOnly = sp.ah === '1';
  const ruleOnly = sp.rule === '1';
  const sim = demoOpen() || sp.sim === '1'; // demo mode shows the sample data by default

  let rows: EnqRow[] = [];
  let callBy = new Map<string, CallRow>();
  let designerName = new Map<string, string>();
  let designerOpts: { id: string; name: string }[] = [];
  let flagged = new Set<string>();
  let error: string | null = null;

  try {
    const designers = await listDesigners();
    designerOpts = designers.map((d) => ({ id: d.id, name: d.name }));
    designerName = new Map(designers.map((d) => [d.id, d.name]));

    const flagRows = must(await db().from('compliance_flags').select('enquiry_id').is('resolved_at', null).limit(1000), 'flags') as { enquiry_id: string | null }[];
    const unresolved = new Set(flagRows.map((f) => f.enquiry_id).filter((x): x is string => !!x));

    let q = db().from('enquiries')
      .select('id, ref, caller_number, caller_name, first_contact_at, verdict, status, priority, referral_name, assigned_designer_id, locality, property_type, after_hours, simulated')
      .order('first_contact_at', { ascending: false }).limit(100);
    if (!sim) q = q.in('simulated', simScope());
    if (verdict !== 'all') q = q.eq('verdict', verdict);
    if (designerId) q = q.eq('assigned_designer_id', designerId);
    if (afterOnly) q = q.eq('after_hours', true);
    if (date) {
      const [y, m, d] = date.split('-').map(Number);
      const start = istDate(y, m, d);
      q = q.gte('first_contact_at', start.toISOString()).lt('first_contact_at', addDays(start, 1).toISOString());
    }
    if (ruleOnly) q = q.in('id', unresolved.size ? [...unresolved] : ['00000000-0000-0000-0000-000000000000']);
    rows = must(await q, 'enquiries') as EnqRow[];
    flagged = unresolved;

    if (rows.length) {
      const calls = must(await db().from('calls').select('enquiry_id, started_at, duration_sec, after_hours, answered, ring_to_answer_sec').in('enquiry_id', rows.map((r) => r.id)).order('started_at', { ascending: false }), 'calls') as CallRow[];
      for (const c of calls) if (!callBy.has(c.enquiry_id)) callBy.set(c.enquiry_id, c);
    }
  } catch (e) {
    error = errMsg(e);
  }

  const now = new Date();
  const todayKey = istDayKey(now);
  const filtered = verdict !== 'all' || !!date || !!designerId || afterOnly || ruleOnly || sim;

  return (
    <>
      <PageHeader title="Front Door" plain="Every call, newest first." right={<AutoRefresh />} />
      <Page>
        <form method="get" action="/front-door" className="sheet grid grid-cols-2 gap-3 p-4 md:grid-cols-6 md:items-end" aria-label="Filter calls">
          <div className="col-span-1">
            <label htmlFor="f-verdict" className="annot">Verdict</label>
            <select id="f-verdict" name="verdict" defaultValue={verdict} className="field mt-1">
              {VERDICTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="col-span-1">
            <label htmlFor="f-date" className="annot">Day</label>
            <input id="f-date" type="date" name="date" defaultValue={date} className="field num mt-1" />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label htmlFor="f-designer" className="annot">Designer</label>
            <select id="f-designer" name="designer" defaultValue={designerId} className="field mt-1">
              <option value="">Anyone</option>
              {designerOpts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm md:col-span-2">
            <label className="flex items-center gap-1.5"><input type="checkbox" name="ah" value="1" defaultChecked={afterOnly} /> After hours only</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" name="rule" value="1" defaultChecked={ruleOnly} /> House Rule breaks</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" name="sim" value="1" defaultChecked={sim} /> Include simulated</label>
          </div>
          <div className="col-span-2 flex items-center gap-2 md:col-span-1">
            <button type="submit" className="btn btn-primary">Apply</button>
            {filtered && <Link href="/front-door" className="btn btn-quiet">Clear</Link>}
          </div>
        </form>

        {error && (
          <Sheet tone="terracotta">
            <Label>Could not load the calls</Label>
            <p className="mt-2 text-sm">The feed could not be read just now. Nothing is lost; try refreshing in a moment.</p>
            <p className="num mt-2 break-words text-xs text-muted">{error}</p>
          </Sheet>
        )}

        {!error && rows.length === 0 && (
          <Empty line={filtered ? 'No calls match those filters. Try widening them, or clear them to see everything.' : 'All quiet at the front door. Calls will appear here the moment they’re answered.'} />
        )}

        {rows.length > 0 && (
          <>
            <p className="text-xs text-muted"><span className="num">{rows.length}</span> {rows.length === 1 ? 'call' : 'calls'}{rows.length === 100 ? ' (the latest 100)' : ''}</p>
            <ul className="space-y-3">
              {rows.map((r) => {
                const c = callBy.get(r.id);
                const at = new Date(c?.started_at ?? r.first_contact_at);
                const p = istParts(at);
                const after = c ? c.after_hours : r.after_hours;
                const fresh = now.getTime() - new Date(r.first_contact_at).getTime() < 90_000;
                const showDate = istDayKey(at) !== todayKey;
                const dName = r.assigned_designer_id ? designerName.get(r.assigned_designer_id) : null;
                return (
                  <li key={r.id} className={`sheet lift p-4 md:px-5 ${fresh ? 'animate-slidein' : ''}`}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
                      <div className="flex items-center gap-4 md:w-36 md:shrink-0 md:flex-col md:items-start md:gap-1.5">
                        <div className="num leading-tight">
                          <span className="text-lg font-medium">{fmtTime(at)}</span>
                          {showDate && <span className="ml-2 text-xs text-muted md:ml-0 md:block">{fmtDate(at)}</span>}
                        </div>
                        <TimeOfDay hour={p.h} minute={p.min} afterHours={after} />
                      </div>

                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <PlanIcon type={r.property_type} className="shrink-0" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="display text-lg font-semibold">{r.caller_name ?? 'Unknown caller'}</span>
                            {r.caller_number && <span className="num text-xs text-muted">{r.caller_number}</span>}
                          </div>
                          <div className="text-sm text-muted">
                            {[r.locality, r.property_type].filter(Boolean).join(' · ') || 'Details still being read'}
                            {c && <> · <span className="num">{c.answered ? fmtDuration(c.duration_sec) : 'not answered'}</span></>}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {r.priority && <Badge tone="terracotta">Priority</Badge>}
                            {r.referral_name && <Badge tone="brass">Referral · {r.referral_name}</Badge>}
                            {r.simulated && <Badge tone="indigo">Simulated</Badge>}
                            {flagged.has(r.id) && <Badge tone="alert">House rule</Badge>}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 md:w-60 md:shrink-0 md:justify-end">
                        <VerdictChip verdict={r.verdict} />
                        <StatusChip status={r.status} />
                        {dName && <span className="text-xs text-muted">with {dName}</span>}
                        <Link href={`/brief/${encodeURIComponent(r.ref)}`} className="btn btn-ghost !min-h-[36px] !px-3 !py-2" aria-label={`Open brief ${r.ref}`}>
                          Open <span className="num text-xs">{r.ref}</span>
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Page>
    </>
  );
}
