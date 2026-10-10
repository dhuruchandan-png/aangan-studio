import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LeadCard, type LeadCardData } from '@/components/me/LeadCard';
import { errMsg } from '@/components/format';
import { BigFigure, Empty, Label, Sheet, Stat } from '@/components/ui';
import { db, must } from '@/lib/db';
import { getDesigner, type LeadCtx } from '@/lib/leads';
import { headline, whenWords } from '@/lib/notify/templates';
import { minS, computeStats, type DesignerStat } from '@/lib/stats';
import { sessionFromCookieHeader } from '@/lib/session';
import { activeElapsedMin, fmtDateTime, fmtDayDateTime, istDayKey, istMonthRange } from '@/lib/time';

export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const OPEN = ['routed', 'accepted'];
const DONE = ['called_back', 'consult_booked', 'not_proceeding'];
const FOURTEEN_DAYS = 14 * 86_400_000;

function Heading({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <header className="hero bleed">
      <div className="jaali absolute inset-0" aria-hidden /><div className="glow" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-4 pb-8 pt-7">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-gold">{sub ?? 'Your desk'}</div>
        <h1 className="display mt-2 text-4xl font-semibold leading-tight text-[#FFF6E6]">{children}</h1>
        <p className="mt-1.5 text-sm text-[#E8D9C2]/80">Your leads, what is due, and how you are doing.</p>
      </div>
    </header>
  );
}

function Section({ title, count, note, children }: { title: string; count: number; note?: string; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-xl font-semibold text-ink">{title}</h2>
        <span className="num text-sm text-muted">{count}</span>
      </div>
      {note && <p className="-mt-1 text-xs text-muted">{note}</p>}
      <ul className="space-y-4">{children}</ul>
    </section>
  );
}

function noteLines(note: string | null | undefined): string[] {
  return (note ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3);
}

export default async function MyDay() {
  const s = await sessionFromCookieHeader((await headers()).get('cookie'));
  if (s?.r !== 'designer' || !s.d) redirect(process.env.DEMO_OPEN === 'true' ? '/team' : '/login');
  const me = s.d;
  const now = new Date();
  const today = istDayKey(now);

  let loadError: string | null = null;
  let waiting: LeadCardData[] = [], overdue: LeadCardData[] = [], dueToday: LeadCardData[] = [], upcoming: LeadCardData[] = [];
  let consults: LeadCardData[] = [], recent: LeadCardData[] = [];
  let activity: { id: string; at: string; text: string; ref: string | null }[] = [];
  let stat: DesignerStat | null = null, statError: string | null = null;
  let firstName = (s.n ?? '').split(/\s+/)[0] || 'there';
  let counts = { waiting: 0, today: 0, overdue: 0, consultsToday: 0 };

  try {
    const d = await getDesigner(me);
    if (d) firstName = d.name.split(/\s+/)[0];

    const enquiries: Row[] = must(await db().from('enquiries').select('*').eq('assigned_designer_id', me).in('status', [...OPEN, ...DONE]).order('callback_due_at', { ascending: true, nullsFirst: false }).limit(300), 'enquiries');
    const consultRows: Row[] = must(await db().from('consultations').select('*').eq('designer_id', me).gte('scheduled_at', new Date(now.getTime() - 3_600_000).toISOString()).order('scheduled_at', { ascending: true }).limit(50), 'consultations');
    const actRows: Row[] = must(await db().from('actions_log').select('id, enquiry_id, action, detail, at').eq('actor_id', me).eq('actor_type', 'designer').order('at', { ascending: false }).limit(15), 'actions_log');

    // enquiries behind consultations or activity that are not already loaded
    const have = new Map<string, Row>(enquiries.map((e) => [e.id as string, e]));
    const extraIds = [...new Set([...consultRows.map((c) => c.enquiry_id as string), ...actRows.map((a) => a.enquiry_id as string)])].filter((id) => !have.has(id));
    if (extraIds.length) for (const e of must(await db().from('enquiries').select('*').in('id', extraIds), 'enquiries (extra)') as Row[]) have.set(e.id, e);

    const ids = [...have.keys()];
    const exByEnq = new Map<string, Row>();
    if (ids.length) {
      const ex: Row[] = must(await db().from('extractions').select('enquiry_id, fields, handoff_note, still_unknown, price_asked, created_at').in('enquiry_id', ids).order('created_at', { ascending: false }), 'extractions');
      for (const x of ex) if (!exByEnq.has(x.enquiry_id)) exByEnq.set(x.enquiry_id, x);
    }
    const routedIds = enquiries.filter((e) => e.status === 'routed').map((e) => e.id as string);
    const sentAt = new Map<string, string>();
    if (routedIds.length) {
      const hs: Row[] = must(await db().from('handoffs').select('enquiry_id, sent_at').eq('designer_id', me).in('enquiry_id', routedIds).is('passed_at', null).is('reassigned_at', null).order('sent_at', { ascending: false }), 'handoffs');
      for (const h of hs) if (!sentAt.has(h.enquiry_id)) sentAt.set(h.enquiry_id, h.sent_at);
    }

    const card = (e: Row, extra: Partial<LeadCardData> = {}): LeadCardData => {
      const x = exByEnq.get(e.id);
      const due = e.callback_due_at ? new Date(e.callback_due_at) : null;
      const fields = x?.fields ?? (e.locality || e.property_type ? { locality: e.locality, property_type: e.property_type } : null);
      const hl = headline({ callerName: e.caller_name, fields } as unknown as LeadCtx);
      return {
        ref: e.ref, headline: hl, status: e.status,
        dueLabel: due ? `Call back by ${whenWords(due, now)}` : null,
        overdue: !!due && due < now && OPEN.includes(e.status),
        priority: !!e.priority, referral: e.referral_name, simulated: !!e.simulated, phone: e.caller_number,
        noteLines: noteLines(x?.handoff_note ?? e.handoff_note), stillUnknown: Array.isArray(x?.still_unknown) ? x.still_unknown : [], priceAsked: !!x?.price_asked,
        ...extra,
      };
    };

    for (const e of enquiries.filter((e) => OPEN.includes(e.status))) {
      const due = e.callback_due_at ? new Date(e.callback_due_at) : null;
      const isOver = !!due && due < now;
      if (e.status === 'routed') {
        const sent = sentAt.get(e.id) ?? e.first_contact_at;
        waiting.push(card(e, { waitedMin: activeElapsedMin(new Date(sent), now, { ignoreHours: !!e.simulated }) }));
        if (isOver) counts.overdue++; else if (due && istDayKey(due) === today) counts.today++;
        continue;
      }
      if (isOver) { overdue.push(card(e)); counts.overdue++; }
      else if (!due || istDayKey(due) === today) { dueToday.push(card(e)); counts.today++; }
      else upcoming.push(card(e));
    }
    counts.waiting = waiting.length;

    const consultRefs = new Set<string>();
    for (const c of consultRows) {
      const e = have.get(c.enquiry_id);
      if (!e) continue;
      consultRefs.add(e.ref);
      const when = new Date(c.scheduled_at);
      if (istDayKey(when) === today) counts.consultsToday++;
      consults.push(card(e, { dueLabel: null, overdue: false, consult: `${fmtDayDateTime(when)} · ${c.location === 'studio' ? 'at the studio' : 'at the client’s site'}` }));
    }

    const cutoff = now.getTime() - FOURTEEN_DAYS;
    recent = enquiries
      .filter((e) => DONE.includes(e.status) && !consultRefs.has(e.ref) && new Date(e.updated_at ?? e.created_at).getTime() >= cutoff)
      .sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime())
      .map((e) => card(e, { dueLabel: null, overdue: false, readOnly: true, phone: null, noteLines: [], stillUnknown: [], priceAsked: false }));

    activity = actRows.map((a) => ({ id: a.id, at: a.at, text: a.detail ?? a.action, ref: have.get(a.enquiry_id)?.ref ?? null }));
  } catch (e) {
    loadError = errMsg(e);
  }

  if (!loadError) {
    try {
      const { start, end } = istMonthRange(now, 0);
      stat = (await computeStats(start, end)).designers.find((x) => x.id === me) ?? null;
    } catch (e) { statError = errMsg(e); }
  }

  if (loadError) {
    return (
      <>
        <Heading>My day</Heading>
        <div className="px-4 pb-10">
          <Sheet tone="terracotta">
            <Label>Could not load your dashboard</Label>
            <p className="mt-2 text-sm">Your leads could not be read just now. Nothing is lost. Pull to refresh or try again in a moment.</p>
            <Link href="/me" className="btn btn-ghost mt-3 min-h-[48px]">Try again</Link>
          </Sheet>
        </div>
      </>
    );
  }

  const nothing = !waiting.length && !overdue.length && !dueToday.length && !upcoming.length && !consults.length;

  return (
    <>
      <Heading sub={`Good to see you, ${firstName}`}>My day</Heading>
      <div className="mx-auto max-w-3xl space-y-8 px-4 pb-12 pt-6">

        <section aria-label="Today" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon="mail" tone="brass" label="To accept" value={counts.waiting} flag={counts.waiting ? 'warn' : undefined} />
          <Stat icon="phone" tone="indigo" label="Calls due today" value={counts.today} />
          <Stat icon="alert" tone="alert" label="Overdue" value={counts.overdue} flag={counts.overdue ? 'alert' : undefined} />
          <Stat icon="cal" tone="sage" label="Consultations today" value={counts.consultsToday} />
        </section>

        {nothing && <Empty line="Nothing is waiting on you. New leads arrive by email and appear here at the same moment." />}

        <Section title="Waiting for you to accept" count={waiting.length} note="Tap Accept so the studio knows you have it.">
          {waiting.map((l) => <LeadCard key={l.ref} lead={l} />)}
        </Section>
        <Section title="Overdue callbacks" count={overdue.length} note="These were promised to the client. A quick call sorts it, then tap Called back.">
          {overdue.map((l) => <LeadCard key={l.ref} lead={l} />)}
        </Section>
        <Section title="Callbacks due today" count={dueToday.length}>
          {dueToday.map((l) => <LeadCard key={l.ref} lead={l} />)}
        </Section>
        <Section title="Coming up" count={upcoming.length}>
          {upcoming.map((l) => <LeadCard key={l.ref} lead={l} />)}
        </Section>
        <Section title="Consultations" count={consults.length}>
          {consults.map((l) => <LeadCard key={l.ref} lead={l} />)}
        </Section>

        {recent.length > 0 && (
          <details className="group">
            <summary className="flex min-h-[48px] cursor-pointer items-center justify-between rounded border border-clay bg-paper px-4 py-2">
              <span className="display text-xl font-semibold text-ink">Recently done</span>
              <span className="num text-sm text-muted">{recent.length} · last 14 days</span>
            </summary>
            <ul className="mt-4 space-y-4">{recent.map((l) => <LeadCard key={l.ref} lead={l} />)}</ul>
          </details>
        )}

        <Sheet>
          <Label>How I&apos;m doing this month</Label>
          {statError ? (
            <p className="mt-3 text-sm text-muted">Your numbers could not be worked out just now. They will be back on the next refresh.</p>
          ) : !stat || stat.handoffs === 0 ? (
            <p className="mt-3 text-sm text-muted">No leads have come your way yet this month. Your numbers will appear here as they do.</p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <BigFigure label="Leads handed to you" value={stat.handoffs} />
                <BigFigure label="Time to accept" value={minS(stat.medianAcceptMin)} note="the typical lead" />
                <BigFigure label="Callbacks kept" value={stat.calledBackOnTimePct == null ? '—' : stat.calledBackOnTimePct} unit={stat.calledBackOnTimePct == null ? undefined : '%'} note="on time" />
                <BigFigure label="Consultations booked" value={stat.consults} />
                <BigFigure label="Needed a nudge" value={stat.nudged} />
                <BigFigure label="Moved on" value={stat.movedAway} />
              </div>
              <p className="mt-4 text-sm text-muted">
                {stat.calledBackOnTimePct != null && stat.calledBackOnTimePct >= 80
                  ? 'You are keeping the studio’s promises to clients. Thank you.'
                  : 'The first call back is what clients remember. A quick accept makes the rest easy.'}
              </p>
            </>
          )}
        </Sheet>

        <Sheet>
          <Label>My recent activity</Label>
          <p className="mt-1 text-xs text-muted">Everything you do here is stamped with the time. This is the same trail the studio sees.</p>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing yet. Your taps will show up here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-clay">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm">
                  <span className="num w-28 shrink-0 text-xs text-muted">{fmtDateTime(a.at)}</span>
                  <span className="min-w-0 flex-1">{a.text}</span>
                  {a.ref && <Link href={`/me/lead/${encodeURIComponent(a.ref)}`} className="num text-xs font-medium text-indigo underline underline-offset-2">{a.ref}</Link>}
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      </div>
    </>
  );
}
