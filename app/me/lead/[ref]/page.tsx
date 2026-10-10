import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { elapsedWords, errMsg, minutesBetween } from '@/components/format';
import { LeadActions } from '@/components/me/LeadActions';
import { Badge, Dimension, Label, PlanIcon, Sheet, Stamp, StatusChip, TimeOfDay, VerdictChip, cx } from '@/components/ui';
import { db, must } from '@/lib/db';
import { getActivity } from '@/lib/audit';
import { canViewLead, getDesigner, loadLead, type LeadCtx } from '@/lib/leads';
import { recordingLink } from '@/lib/notify/links';
import { headline, whenWords } from '@/lib/notify/templates';
import { sessionFromCookieHeader } from '@/lib/session';
import { fmtDateTime, fmtDayDateTime, fmtDuration, fmtTime, istParts } from '@/lib/time';
import { CRITERION_KEYS, CRITERION_LABEL, type Criterion, type Turn } from '@/lib/types';

export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const DM_WORD: Record<string, string> = { yes: 'Yes, on the call', authorised: 'Authorised by the decision-maker', unclear: 'Not confirmed', no: 'No, someone else decides' };
const clock = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const gap = (m: number): string => (m < 1 ? `${Math.max(1, Math.round(m * 60))} s` : elapsedWords(m));
const audioSrc = (callId: string): string | null => { try { return recordingLink(callId); } catch { return null; } };
const ACTOR_BADGE: Record<string, { word: string; tone: 'indigo' | 'terracotta' | 'brass' }> = {
  designer: { word: 'Designer', tone: 'terracotta' }, admin: { word: 'Studio', tone: 'indigo' }, system: { word: 'Assistant', tone: 'brass' },
};

function CriterionIcon({ status }: { status: string }) {
  const d = status === 'pass' ? 'M3 8.5l3.2 3L13 4.5' : status === 'fail' ? 'M4 4l8 8M12 4l-8 8' : 'M6 6a2 2 0 1 1 2.8 1.8C8.3 8.1 8 8.5 8 9.2M8 12h.01';
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

function Back() {
  return <Link href="/me" className="inline-flex min-h-[48px] items-center text-sm font-semibold text-indigo underline underline-offset-2">← Back to my day</Link>;
}

export default async function MyLead({ params }: { params: Promise<{ ref: string }> }) {
  const s = await sessionFromCookieHeader((await headers()).get('cookie'));
  if (s?.r !== 'designer' || !s.d) redirect(process.env.DEMO_OPEN === 'true' ? '/team' : '/login');
  const me = s.d;

  const { ref: rawRef } = await params;
  let refCode = rawRef;
  try { refCode = decodeURIComponent(rawRef); } catch { /* keep raw */ }

  let lead: LeadCtx | null = null;
  let allowed = false;
  try {
    lead = await loadLead(refCode);
    if (lead) allowed = await canViewLead(me, lead.id);
  } catch (e) {
    return (
      <div className="space-y-4 px-4 py-6">
        <Back />
        <Sheet tone="terracotta">
          <Label>Could not open this lead</Label>
          <p className="mt-2 text-sm">It could not be read just now. Nothing is lost; try again in a moment.</p>
          <p className="num mt-2 break-words text-xs text-muted">{errMsg(e)}</p>
        </Sheet>
      </div>
    );
  }
  if (!lead) notFound();
  if (!allowed) {
    return (
      <div className="space-y-4 px-4 py-6">
        <Back />
        <Sheet>
          <h1 className="display text-2xl font-semibold">This lead isn&apos;t on your dashboard</h1>
          <p className="mt-2 text-sm text-muted">Leads appear here only once they have been handed to you. If you think this is a mistake, ask the front desk.</p>
          <Link href="/me" className="btn btn-primary mt-4 min-h-[48px] w-full justify-center">Go to my day</Link>
        </Sheet>
      </div>
    );
  }

  const l: LeadCtx = lead;
  const mine = l.assignedDesignerId === me;

  let calls: Row[] = [], handoffs: Row[] = [], consultations: Row[] = [];
  let ex: Row | null = null, outcome: Row | null = null;
  let activity: Awaited<ReturnType<typeof getActivity>> = [];
  let movedTo: string | null = null;
  let partialError: string | null = null;
  try {
    const [c, e, h, o, co, act] = await Promise.all([
      db().from('calls').select('id, started_at, ended_at, duration_sec, answered, transcript, recording_url, recording_path').eq('enquiry_id', l.id).order('started_at', { ascending: true }).then((r) => must(r, 'calls') as Row[]),
      db().from('extractions').select('created_at').eq('enquiry_id', l.id).order('created_at', { ascending: false }).limit(1).then((r) => must(r, 'extraction') as Row[]),
      db().from('handoffs').select('sent_at, accepted_at').eq('enquiry_id', l.id).order('sent_at', { ascending: true }).then((r) => must(r, 'handoffs') as Row[]),
      db().from('outcomes').select('called_back_at, consult_booked_at').eq('enquiry_id', l.id).maybeSingle().then((r) => must(r, 'outcomes') as Row | null),
      db().from('consultations').select('scheduled_at, created_at').eq('enquiry_id', l.id).order('scheduled_at', { ascending: true }).then((r) => must(r, 'consultations') as Row[]),
      getActivity(l.id),
    ]);
    calls = c; ex = e[0] ?? null; handoffs = h; outcome = o; consultations = co; activity = act;
  } catch (e) { partialError = errMsg(e); }
  if (!mine && l.assignedDesignerId) {
    try { movedTo = (await getDesigner(l.assignedDesignerId))?.name ?? 'another designer'; } catch { movedTo = 'another designer'; }
  }

  const f = l.fields;
  const propertyType = f?.property_type ?? l.raw?.property_type ?? null;
  const at = istParts(l.callAt);
  const lastCall = calls[calls.length - 1];
  const callEnd: string | null = lastCall ? (lastCall.ended_at ?? lastCall.started_at) : l.callAt.toISOString();
  const sentAt: string | null = handoffs[0]?.sent_at ?? null;
  const acceptedH = handoffs.find((h) => h.accepted_at);
  const acceptedAt: string | null = acceptedH?.accepted_at ?? null;
  const calledAt: string | null = outcome?.called_back_at ?? null;
  const consult = consultations[0];
  const consultAt: string | null = outcome?.consult_booked_at ?? consult?.created_at ?? null;
  const steps: { label: string; at: string | null; sub?: string }[] = [
    { label: 'Call', at: callEnd }, { label: 'Brief', at: ex?.created_at ?? null }, { label: 'Sent', at: sentAt },
    { label: 'Accepted', at: acceptedAt }, { label: 'Called back', at: calledAt },
    { label: 'Consultation', at: consultAt, sub: consult?.scheduled_at ? `for ${fmtDayDateTime(consult.scheduled_at)}` : undefined },
  ];
  const criteria = [...(l.criteria ?? [])].sort((a: Criterion, b: Criterion) => CRITERION_KEYS.indexOf(a.key) - CRITERION_KEYS.indexOf(b.key));
  const multi = calls.length > 1;
  const open = l.status === 'routed' || l.status === 'accepted';

  return (
    <div className="space-y-5 px-4 pb-12 pt-3">
      <Back />

      {!mine && (
        <div role="status" className="rounded border border-indigo/40 bg-[#E2E8F0] px-4 py-3 text-sm text-indigo">
          This lead moved to <b>{movedTo ?? 'another designer'}</b> (no action needed from you). You can still read it here.
        </div>
      )}
      {partialError && (
        <Sheet tone="terracotta">
          <Label>Part of this brief could not be loaded</Label>
          <p className="mt-2 text-sm">Some details (calls or timings) are missing for now. Refresh to try again.</p>
        </Sheet>
      )}

      {/* ---------------------------------------------------------- header */}
      <Sheet>
        <div className="flex items-start gap-3">
          <PlanIcon type={propertyType} size={40} />
          <div className="min-w-0 flex-1">
            <span className="num text-xs font-medium text-muted">{l.ref}</span>
            <h1 className="display text-2xl font-semibold leading-snug">{headline(l)}</h1>
            {mine && l.callerNumber && (
              <a href={`tel:${l.callerNumber.replace(/[^\d+]/g, '')}`} className="num mt-2 inline-flex min-h-[48px] items-center gap-2 rounded border border-clay bg-plaster/60 px-3 text-base font-medium text-indigo underline-offset-2 hover:underline">
                <span className="sr-only">Call </span>{l.callerNumber}
              </a>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <VerdictChip verdict={l.verdict} />
          <StatusChip status={l.status} />
          {l.simulated && <Badge tone="indigo">Simulated</Badge>}
          {l.referral && <Badge tone="brass">Referral · {l.referral}</Badge>}
          {l.priority && <Badge tone="terracotta">Priority{l.priorityReason ? ` · ${l.priorityReason}` : ''}</Badge>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-clay pt-3">
          <span className="num text-sm">{fmtDayDateTime(l.callAt)}</span>
          <TimeOfDay hour={at.h} minute={at.min} afterHours={l.afterHours} />
        </div>
        {mine && open && l.callbackDue && (
          <p className="num mt-3 text-2xl font-semibold">Call back by {whenWords(l.callbackDue)}</p>
        )}
      </Sheet>

      {/* ---------------------------------------------------------- actions */}
      {mine && (
        <Sheet>
          <Label>What you can do</Label>
          <div className="mt-3"><LeadActions refCode={l.ref} status={l.status} /></div>
        </Sheet>
      )}

      {/* ---------------------------------------------------------- note */}
      <Sheet>
        <Label>Handoff note</Label>
        {(l.priority || l.priceAsked) && (
          <div className="mt-3 space-y-2">
            {l.priority && <div className="rounded border-2 border-terracotta bg-[#F7E3DA] px-3 py-2 text-sm text-terracotta-deep"><b className="tracking-wider">PRIORITY</b>{l.priorityReason ? ` · ${l.priorityReason}` : ''}</div>}
            {l.priceAsked && <div className="rounded border border-brass/50 bg-[#F5EBD2] px-3 py-2 text-sm text-brass-deep"><b>Asked about price.</b> The assistant did not quote one; be ready to speak to it.</div>}
          </div>
        )}
        {l.existingClient && <p className="mt-3 text-sm">Existing client{l.existingClient.designer_name ? ` of ${l.existingClient.designer_name}` : ''}{l.existingClient.project ? ` · ${l.existingClient.project}` : ''}.</p>}
        {l.note
          ? <div className="mt-3 whitespace-pre-wrap rounded border border-clay bg-plaster/50 p-3 text-sm leading-relaxed">{l.note}</div>
          : <p className="mt-3 text-sm text-muted">The note is still being written. It appears here as soon as the call has been read.</p>}
        {l.stillUnknown.length > 0 && (
          <div className="mt-3">
            <Label>Still unknown</Label>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{l.stillUnknown.map((u, i) => <li key={i}>{u}</li>)}</ul>
          </div>
        )}
        {l.notes.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-clay pt-2">
            {l.notes.map((n, i) => <li key={i} className="text-xs text-muted"><span className="annot !text-[10px]">checked by code</span> {n}</li>)}
          </ul>
        )}
        {l.mood && <p className="mt-2 text-xs text-muted">Caller sounded <b>{l.mood}</b>.</p>}
      </Sheet>

      {/* ---------------------------------------------------------- spec */}
      <Sheet>
        <Label>Spec sheet</Label>
        {f ? (
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {([
              ['Site · locality', f.locality],
              ['Carpet · sq ft', f.carpet_sqft != null ? Number(f.carpet_sqft).toLocaleString('en-IN') : null],
              ['Type · BHK / property', [f.size_bhk, f.property_type].filter(Boolean).join(' · ') || null],
              ['Scope', f.scope],
              ['Rooms', f.rooms?.length ? f.rooms.join(', ') : null],
              ['State', f.current_state],
              ['Timeline', [f.timeline_text, f.timeline_date_estimate ? `(finish by ${f.timeline_date_estimate})` : null].filter(Boolean).join(' ') || null],
              ['Decision-maker', DM_WORD[f.decision_maker] ?? f.decision_maker],
              ['Budget · volunteered', f.budget_volunteered],
              ['Source', f.source],
              ['Referral', f.referral_name ?? l.referral],
              ['Language', f.language],
              ['Callback preference', f.callback_preference],
              ['Callback due', l.callbackDue ? whenWords(l.callbackDue) : null],
            ] as [string, string | null | undefined][]).map(([k, v]) => (
              <div key={k}>
                <dt className="annot">{k}</dt>
                <dd className={cx('mt-0.5 text-sm', v ? 'text-ink' : 'text-muted')}>{v ? <span className={/\d/.test(v) && v.length < 14 ? 'num' : ''}>{v}</span> : 'not discussed'}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="mt-3 text-sm text-muted">The details are still being read from the call.</p>}
      </Sheet>

      {/* ---------------------------------------------------------- criteria */}
      <Sheet>
        <Label>The five tests</Label>
        {criteria.length === 0 ? <p className="mt-3 text-sm text-muted">Not assessed yet.</p> : (
          <ul className="mt-3 space-y-3">
            {criteria.map((c) => {
              const tone = c.status === 'pass' ? 'text-sage-deep' : c.status === 'fail' ? 'text-terracotta-deep' : 'text-brass-deep';
              const word = c.status === 'pass' ? 'Passed' : c.status === 'fail' ? 'Not met' : 'Unclear';
              return (
                <li key={c.key} className="rounded border border-clay p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="display text-base font-semibold">{CRITERION_LABEL[c.key] ?? c.key}</h3>
                    <span className={cx('inline-flex items-center gap-1 text-sm font-semibold', tone)}><CriterionIcon status={c.status} />{word}</span>
                  </div>
                  {c.evidence_quote && (
                    <blockquote className="mt-2 border-l-2 border-teak/60 bg-plaster/50 py-1 pl-3 text-sm italic">
                      “{c.evidence_quote}”
                      <footer className="annot not-italic !text-[10px]">word for word from the caller</footer>
                    </blockquote>
                  )}
                  <p className="mt-2 text-sm text-muted">{c.reason}</p>
                  {c.adjusted && <p className="mt-1.5 text-xs text-brass-deep"><span className="annot !text-[10px] !text-brass-deep">checked by code</span> {c.adjusted}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>

      {/* ---------------------------------------------------------- transcript */}
      <Sheet>
        <Label>{multi ? `Transcript · ${calls.length} calls merged` : 'Transcript'}</Label>
        {calls.length === 0 && <p className="mt-3 text-sm text-muted">No call record is attached to this enquiry.</p>}
        <div className="mt-3 space-y-6">
          {calls.map((c, i) => {
            const turns: Turn[] = Array.isArray(c.transcript) ? (c.transcript as Turn[]) : [];
            const hasRec = !!(c.recording_url || c.recording_path);
            const src = hasRec ? audioSrc(c.id) : null;
            return (
              <section key={c.id} aria-label={`Call ${i + 1}`}>
                <h3 className="annot">Call {i + 1} · <span className="num">{fmtTime(c.started_at)}</span> · <span className="num">{fmtDuration(c.duration_sec)}</span>{c.answered === false ? ' (not answered)' : ''}</h3>
                {hasRec && (
                  <div className="mt-2">
                    {src ? <audio controls preload="none" src={src} className="w-full" aria-label={`Recording of call ${i + 1}`} /> : <p className="text-xs text-muted">Recording link unavailable.</p>}
                  </div>
                )}
                {turns.length === 0 ? <p className="mt-2 text-sm text-muted">No transcript was captured for this call.</p> : (
                  <ol className="mt-3 space-y-2">
                    {turns.map((t, j) => {
                      const caller = t.speaker === 'caller';
                      return (
                        <li key={j} className={cx('max-w-[94%] rounded px-3 py-2 text-sm', caller ? 'ml-auto border border-indigo/25 bg-[#E2E8F0]/60' : 'border border-clay bg-plaster/60')}>
                          <div className="flex items-center justify-between gap-3">
                            <span className={cx('annot !text-[10px]', caller ? '!text-indigo' : '')}>{caller ? 'Caller' : 'Assistant'}</span>
                            {typeof t.t === 'number' && <span className="num text-[10px] text-muted">{clock(t.t)}</span>}
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{t.text}</p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      </Sheet>

      {/* ---------------------------------------------------------- timeline */}
      <Sheet>
        <Label>From call to consultation</Label>
        <ol className="mt-3 space-y-1" aria-label="Enquiry timeline">
          {steps.map((st, i) => {
            const prev = steps[i - 1];
            const m = i > 0 && st.at && prev?.at ? minutesBetween(prev.at, st.at) : null;
            const reached = !!st.at;
            return (
              <li key={st.label}>
                {m != null && m >= 0 && <Dimension className="mb-1 ml-3 mr-3">{gap(m)}</Dimension>}
                <div className={cx('flex items-baseline justify-between gap-3 rounded border p-2.5', reached ? 'border-teak/60 bg-plaster/60' : 'border-dashed border-clay')}>
                  <div>
                    <Label>{st.label}</Label>
                    {st.sub && st.at && <div className="num text-[11px] text-muted">{st.sub}</div>}
                  </div>
                  <div className={cx('num text-sm', reached ? 'text-ink' : 'text-muted')}>{st.at ? fmtDateTime(st.at) : 'not yet'}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {sentAt && <Stamp tone="indigo">Handed over {fmtTime(sentAt)}</Stamp>}
          {acceptedAt && <Stamp tone="sage">Accepted</Stamp>}
          {consultAt && <Stamp tone="sage">Consultation booked</Stamp>}
        </div>
      </Sheet>

      {/* ---------------------------------------------------------- activity */}
      <Sheet>
        <Label>Activity on this lead</Label>
        <p className="mt-1 text-xs text-muted">Who did what, and when. The studio sees the same trail.</p>
        {activity.length === 0 ? <p className="mt-3 text-sm text-muted">Nothing recorded yet.</p> : (
          <ul className="mt-3 divide-y divide-clay">
            {activity.map((a) => {
              const b = ACTOR_BADGE[a.actor_type] ?? ACTOR_BADGE.system;
              return (
                <li key={a.id} className="py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="num text-xs text-muted">{fmtDateTime(a.at)}</span>
                    <b className="font-medium">{a.actor_name}</b>
                    <Badge tone={b.tone}>{b.word}</Badge>
                  </div>
                  <p className="mt-0.5 text-ink">{a.detail ?? a.action}{a.via ? <span className="text-muted"> · via {a.via}</span> : null}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
