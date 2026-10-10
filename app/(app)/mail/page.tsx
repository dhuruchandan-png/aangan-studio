import Link from 'next/link';
import { errMsg } from '@/components/format';
import { AutoRefresh } from '@/components/AutoRefresh';
import { Badge, Empty, IconTile, Label, Page, PageHeader, Sheet, Stat, cx } from '@/components/ui';
import { db, must } from '@/lib/db';
import { simScope } from '@/lib/demo';
import { fmtDateTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;
interface Notif { id: string; recipient_type: string; recipient_id: string | null; enquiry_id: string | null; kind: string; payload: any; sent_at: string; delivered: boolean; error: string | null; acted_at: string | null; action: string | null; acted_via: string | null }
interface Act { id: string; enquiry_id: string; actor_name: string; actor_type: string; action: string; detail: string | null; via: string | null; at: string }

const KIND: Record<string, { label: string; icon: string; tone: 'terracotta' | 'indigo' | 'sage' | 'brass' | 'alert'; blurb: string }> = {
  handoff: { label: 'New lead', icon: 'mail', tone: 'terracotta', blurb: 'A qualified brief sent to a designer to accept.' },
  nudge: { label: 'Reminder', icon: 'clock', tone: 'brass', blurb: 'A nudge because the lead had not been accepted yet.' },
  reassign: { label: 'Moved', icon: 'users', tone: 'indigo', blurb: 'The lead moved to a different designer.' },
  callback_reminder: { label: 'Callback due', icon: 'phone', tone: 'brass', blurb: 'A reminder of a promised callback.' },
  overdue: { label: 'Overdue', icon: 'alert', tone: 'alert', blurb: 'A callback that passed its promised time.' },
  escalation: { label: 'Escalation', icon: 'alert', tone: 'alert', blurb: 'An existing client needing a senior voice.' },
  digest: { label: 'Daily digest', icon: 'cal', tone: 'sage', blurb: 'The day ahead, one email.' },
  weekly: { label: 'Weekly report', icon: 'star', tone: 'sage', blurb: 'The week in numbers.' },
  monthly: { label: 'Monthly report', icon: 'star', tone: 'sage', blurb: 'The month in numbers.' },
  ics: { label: 'Calendar invite', icon: 'cal', tone: 'indigo', blurb: 'A consultation booked in the diary.' },
  compliance: { label: 'House Rule alert', icon: 'alert', tone: 'alert', blurb: 'The assistant said something it should not have.' },
  summary: { label: 'Summary', icon: 'star', tone: 'sage', blurb: 'An end-of-day summary.' },
  other: { label: 'Message', icon: 'mail', tone: 'indigo', blurb: '' },
};
const ACTION: Record<string, string> = {
  accept: 'Accepted the lead', accepted: 'Accepted the lead', called_back: 'Called the client back', book: 'Booked a consultation', not_proceeding: 'Marked not proceeding',
  pass: 'Passed the lead on', reassign: 'Handed it to another designer', ack: 'Acknowledged', fd_called: 'Front desk called the client', assign: 'Assigned to a designer', snooze: 'Snoozed the callback',
};
const VIA: Record<string, string> = { email: 'from the email', desk: 'from My Desk', dashboard: 'from the dashboard' };
const human = (s: string) => ACTION[s] ?? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const mins = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
const span = (m: number) => (m < 1 ? 'under a minute' : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${Math.floor(m / 1440)} d`);

export default async function MailTrail({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const who = sp.to && /^[0-9a-f-]{36}$/i.test(sp.to) ? sp.to : '';
  const kind = sp.kind && sp.kind in KIND ? sp.kind : '';
  const state = ['acted', 'waiting', 'failed'].includes(sp.state ?? '') ? sp.state! : '';

  let rows: Notif[] = [], acts: Act[] = [], designers = new Map<string, { name: string; email: string | null }>(), enq = new Map<string, { ref: string; head: string }>(), error: string | null = null;
  try {
    const ds = must(await db().from('designers').select('id, name, email'), 'designers') as { id: string; name: string; email: string | null }[];
    designers = new Map(ds.map((d) => [d.id, { name: d.name, email: d.email }]));
    let q = db().from('notifications').select('id, recipient_type, recipient_id, enquiry_id, kind, payload, sent_at, delivered, error, acted_at, action, acted_via').eq('channel', 'email').in('simulated', simScope()).order('sent_at', { ascending: false }).limit(200);
    if (who) q = q.eq('recipient_id', who);
    if (kind) q = q.eq('kind', kind);
    rows = must(await q, 'notifications') as Notif[];
    const ids = [...new Set(rows.map((r) => r.enquiry_id).filter((x): x is string => !!x))];
    if (ids.length) {
      const es = must(await db().from('enquiries').select('id, ref, caller_name, locality, property_type').in('id', ids), 'enquiries') as any[];
      enq = new Map(es.map((e) => [e.id, { ref: e.ref, head: [e.caller_name ?? 'Caller', e.locality].filter(Boolean).join(' · ') }]));
      acts = must(await db().from('actions_log').select('id, enquiry_id, actor_name, actor_type, action, detail, via, at').in('enquiry_id', ids).order('at'), 'actions') as Act[];
    }
  } catch (e) { error = errMsg(e); }

  const needsAction = (r: Notif) => ['handoff', 'nudge', 'callback_reminder', 'overdue', 'escalation'].includes(r.kind);
  let list = rows;
  if (state === 'acted') list = rows.filter((r) => r.acted_at);
  if (state === 'waiting') list = rows.filter((r) => needsAction(r) && !r.acted_at && r.delivered);
  if (state === 'failed') list = rows.filter((r) => !r.delivered);

  const total = rows.length, delivered = rows.filter((r) => r.delivered).length;
  const actionable = rows.filter(needsAction), acted = actionable.filter((r) => r.acted_at);
  const waits = acted.map((r) => mins(r.sent_at, r.acted_at!)).sort((a, b) => a - b);
  const median = waits.length ? waits[Math.floor(waits.length / 2)] : null;
  const viaEmail = acted.filter((r) => r.acted_via === 'email').length;
  const designerOpts = [...designers.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  const qs = (o: Record<string, string>) => { const u = new URLSearchParams({ ...(who && { to: who }), ...(kind && { kind }), ...(state && { state }), ...o }); for (const [k, v] of [...u]) if (!v) u.delete(k); const s = u.toString(); return s ? `/mail?${s}` : '/mail'; };

  return (
    <>
      <PageHeader eyebrow="Accountability" title="Email trail" plain="Every email the studio assistant sends, who it went to, and exactly what they did next." right={<AutoRefresh />} />
      <Page>
        {error && <Sheet tone="terracotta"><Label>Could not load the trail</Label><p className="mt-2 break-words text-sm">{error}</p></Sheet>}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat icon="mail" tone="terracotta" label="Emails sent" value={total} note={`${delivered} delivered${total - delivered ? `, ${total - delivered} failed` : ''}.`} />
          <Stat icon="check" tone="sage" label="Acted on" value={actionable.length ? `${Math.round((acted.length / actionable.length) * 100)}%` : '—'} note={`${acted.length} of ${actionable.length} action emails got a response.`} />
          <Stat icon="clock" tone="indigo" label="Typical response" value={median == null ? '—' : span(median)} note="From the email being sent to the designer acting." />
          <Stat icon="phone" tone="brass" label="Acted from the email" value={acted.length ? `${Math.round((viaEmail / acted.length) * 100)}%` : '—'} note="One tap on the buttons inside the email." />
        </div>

        <Sheet className="!p-4">
          <form method="get" action="/mail" className="grid grid-cols-2 gap-3 md:grid-cols-5 md:items-end">
            <div className="col-span-2 md:col-span-1">
              <label htmlFor="m-to" className="annot">Sent to</label>
              <select id="m-to" name="to" defaultValue={who} className="field mt-1"><option value="">Everyone</option>{designerOpts.map(([id, d]) => <option key={id} value={id}>{d.name}</option>)}</select>
            </div>
            <div className="col-span-1">
              <label htmlFor="m-kind" className="annot">Type</label>
              <select id="m-kind" name="kind" defaultValue={kind} className="field mt-1"><option value="">All types</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            </div>
            <div className="col-span-1">
              <label htmlFor="m-state" className="annot">Outcome</label>
              <select id="m-state" name="state" defaultValue={state} className="field mt-1"><option value="">Any</option><option value="acted">Acted on</option><option value="waiting">Waiting for action</option><option value="failed">Not delivered</option></select>
            </div>
            <div className="col-span-2 flex gap-2 md:col-span-2"><button className="btn btn-primary">Apply</button>{(who || kind || state) && <Link href="/mail" className="btn btn-quiet">Clear</Link>}</div>
          </form>
        </Sheet>

        {!error && list.length === 0 && <Empty line={rows.length ? 'No emails match those filters.' : 'No emails yet. The first lead handed to a designer will appear here, with what they did about it.'} />}

        <ul className="space-y-3">
          {list.map((r) => {
            const k = KIND[r.kind] ?? KIND.other;
            const d = r.recipient_id ? designers.get(r.recipient_id) : null;
            const toName = d?.name ?? (r.recipient_type === 'frontdesk' ? 'Front desk' : r.recipient_type === 'nikhil' ? 'Nikhil Deshpande' : 'Studio');
            const toAddr = d?.email ?? r.payload?.to ?? null;
            const e = r.enquiry_id ? enq.get(r.enquiry_id) : null;
            const after = acts.filter((a) => a.enquiry_id === r.enquiry_id && new Date(a.at) >= new Date(r.sent_at)).slice(0, 8);
            const wait = r.acted_at ? mins(r.sent_at, r.acted_at) : Math.round((Date.now() - new Date(r.sent_at).getTime()) / 60000);
            const html: string | undefined = r.payload?.html;
            return (
              <li key={r.id} className="sheet lift p-4 md:px-5">
                <div className="flex flex-wrap items-start gap-3">
                  <IconTile icon={k.icon} tone={k.tone} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold">{r.payload?.subject ?? k.label}</span>
                      <Badge tone={k.tone === 'sage' ? 'indigo' : k.tone}>{k.label}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                      <span>To <b className="font-semibold text-ink">{toName}</b>{toAddr && <span className="num"> · {toAddr}</span>}</span>
                      <span className="num">{fmtDateTime(r.sent_at)}</span>
                      {e && r.enquiry_id && <Link href={`/brief/${e.ref}`} className="text-indigo underline-offset-2 hover:underline">{e.head} · <span className="num">{e.ref}</span></Link>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 text-xs">
                    {r.delivered
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E6EEE5] px-2.5 py-1 font-semibold text-sage-deep"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8.5l3.2 3L13 4.5" /></svg>Delivered</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-[#F6DDD8] px-2.5 py-1 font-semibold text-alert">Not delivered</span>}
                    {needsAction(r) && (r.acted_at
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E2E8F0] px-2.5 py-1 font-semibold text-indigo">{human(r.action ?? 'acted')} · {span(wait)}</span>
                      : r.delivered && <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold', wait > 30 ? 'bg-[#F6DDD8] text-alert' : 'bg-[#F5EBD2] text-brass-deep')}>Waiting {span(wait)}</span>)}
                  </div>
                </div>

                {r.error && <p className="num mt-2 break-words rounded-lg bg-[#F6DDD8] px-3 py-2 text-xs text-alert">{r.error}</p>}

                {((needsAction(r) && after.length > 0) || html) && (
                  <details className="group mt-3 rounded-xl border border-clay/70 bg-plaster/40">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-sm font-medium text-indigo">
                      <span>{needsAction(r) ? 'What happened after this email' : 'Read the email'}{needsAction(r) && after.length ? <span className="num text-muted"> · {after.length} step{after.length > 1 ? 's' : ''}</span> : null}</span>
                      <span className="text-xs text-muted group-open:hidden">Show</span><span className="hidden text-xs text-muted group-open:inline">Hide</span>
                    </summary>
                    <div className="space-y-4 border-t border-clay/70 px-3.5 py-3">
                      {!needsAction(r) ? null : after.length > 0 ? (
                        <ol className="relative space-y-3 border-l border-clay pl-4">
                          {after.map((a) => (
                            <li key={a.id} className="relative">
                              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-paper bg-terracotta" />
                              <div className="text-sm"><b>{a.actor_name}</b> · {human(a.action)}{a.via ? <span className="text-muted"> {VIA[a.via] ?? `via ${a.via}`}</span> : null}</div>
                              {a.detail && a.detail !== human(a.action) && <div className="text-xs text-muted">{a.detail}</div>}
                              <div className="num text-[11px] text-muted">{fmtDateTime(a.at)} · {span(mins(r.sent_at, a.at))} after the email</div>
                            </li>
                          ))}
                        </ol>
                      ) : <p className="text-sm text-muted">Nothing has been done on this lead since the email went out.</p>}
                      {html && (
                        <div>
                          <Label>The email as sent</Label>
                          <iframe title={`Email: ${r.payload?.subject ?? ''}`} srcDoc={html} sandbox="" loading="lazy" className="mt-2 h-96 w-full rounded-lg border border-clay bg-white" />
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        {list.length >= 200 && <p className="text-xs text-muted">Showing the latest 200 emails.</p>}
      </Page>
    </>
  );
}
