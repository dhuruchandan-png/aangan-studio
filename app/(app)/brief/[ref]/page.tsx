import { notFound } from 'next/navigation';
import { BriefActions } from '@/components/BriefActions';
import { elapsedWords, errMsg, minutesBetween } from '@/components/format';
import { ResolveFlag } from '@/components/ResolveFlag';
import { Badge, Dimension, Label, Page, PageHeader, PlanIcon, Sheet, Stamp, StatusChip, Swatches, TimeOfDay, VerdictChip, cx } from '@/components/ui';
import { HubspotPanel } from '@/components/HubspotPanel';
import { getActivity } from '@/lib/audit';
import { db, must } from '@/lib/db';
import { listDesigners, loadLead, type LeadCtx } from '@/lib/leads';
import { recordingLink } from '@/lib/notify/links';
import { whenWords } from '@/lib/notify/templates';
import { RULE_LABEL } from '@/lib/pipeline/compliance';
import { inr } from '@/lib/stats';
import { fmtDateTime, fmtDayDateTime, fmtDuration, fmtTime, istParts } from '@/lib/time';
import { CRITERION_KEYS, CRITERION_LABEL, type Criterion, type Turn } from '@/lib/types';

export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const DM_WORD: Record<string, string> = { yes: 'Yes, on the call', authorised: 'Authorised by the decision-maker', unclear: 'Not confirmed', no: 'No, someone else decides' };
const VERDICT_WORD: Record<string, string> = { qualified: 'qualified', unsure: 'unsure', not_a_fit: 'not a fit', escalate: 'escalate', other: 'other' };
const KIND_LABEL: Record<string, string> = {
  handoff: 'Brief sent', nudge: 'Reminder nudge', reassign: 'Moved to another designer', callback_reminder: 'Callback reminder', overdue: 'Overdue alert',
  escalation: 'Escalation', digest: 'Daily digest', weekly: 'Weekly report', monthly: 'Monthly report', ics: 'Calendar invite', compliance: 'House Rule alert', summary: 'Summary', other: 'Message',
};
const ACTION_WORD: Record<string, string> = { accept: 'accepted', called_back: 'called back', book: 'booked a consultation', not_proceeding: 'marked not proceeding', pass: 'passed it on', reassign: 'reassigned', ack: 'acknowledged', snooze: 'snoozed' };

/** 72 s -> "1:12" (transcript offsets are seconds from the start of the call). */
const clock = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
/** "6 min" or "40 s" for short gaps. */
const gap = (m: number): string => (m < 1 ? `${Math.max(1, Math.round(m * 60))} s` : elapsedWords(m));

function audioSrc(callId: string): string | null {
  try { return recordingLink(callId); } catch { return null; }
}

function Shell({ ref_, children }: { ref_: string; children: React.ReactNode }) {
  return (
    <>
      <PageHeader title={ref_} plain="One enquiry, laid out like a design brief." />
      <Page>{children}</Page>
    </>
  );
}

function CriterionIcon({ status }: { status: string }) {
  const d = status === 'pass' ? 'M3 8.5l3.2 3L13 4.5' : status === 'fail' ? 'M4 4l8 8M12 4l-8 8' : 'M6 6a2 2 0 1 1 2.8 1.8C8.3 8.1 8 8.5 8 9.2M8 12h.01';
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
  );
}

export default async function BriefBook({ params }: { params: Promise<{ ref: string }> }) {
  const { ref: rawRef } = await params;
  let refCode = rawRef;
  try { refCode = decodeURIComponent(rawRef); } catch { /* keep raw */ }

  let leadOrNull: LeadCtx | null = null;
  let leadError: string | null = null;
  try { leadOrNull = await loadLead(refCode); } catch (e) { leadError = errMsg(e); }

  if (leadError) {
    return (
      <Shell ref_="Brief Book">
        <Sheet tone="terracotta">
          <Label>Could not open this brief</Label>
          <p className="mt-2 text-sm">The enquiry could not be read just now. Nothing is lost; try again in a moment.</p>
          <p className="num mt-2 break-words text-xs text-muted">{leadError}</p>
        </Sheet>
      </Shell>
    );
  }
  if (!leadOrNull) notFound();
  const lead: LeadCtx = leadOrNull;

  // ---- everything else about this enquiry
  let calls: Row[] = [], handoffs: Row[] = [], consultations: Row[] = [], notifications: Row[] = [], flags: Row[] = [];
  let ex: Row | null = null, outcome: Row | null = null;
  let designers: { id: string; name: string; active: boolean; on_leave: boolean }[] = [];
  let activity: Awaited<ReturnType<typeof getActivity>> = [];
  let partialError: string | null = null;
  try {
    const id = lead.id;
    const [c, e, h, o, co, n, f, d, act] = await Promise.all([
      db().from('calls').select('*').eq('enquiry_id', id).order('started_at', { ascending: true }).then((r) => must(r, 'calls') as Row[]),
      db().from('extractions').select('*').eq('enquiry_id', id).order('created_at', { ascending: false }).limit(1).then((r) => must(r, 'extraction') as Row[]),
      db().from('handoffs').select('*').eq('enquiry_id', id).order('sent_at', { ascending: true }).then((r) => must(r, 'handoffs') as Row[]),
      db().from('outcomes').select('*').eq('enquiry_id', id).maybeSingle().then((r) => must(r, 'outcomes') as Row | null),
      db().from('consultations').select('*').eq('enquiry_id', id).order('scheduled_at', { ascending: true }).then((r) => must(r, 'consultations') as Row[]),
      db().from('notifications').select('*').eq('enquiry_id', id).order('sent_at', { ascending: false }).then((r) => must(r, 'notifications') as Row[]),
      db().from('compliance_flags').select('*').eq('enquiry_id', id).order('created_at', { ascending: true }).then((r) => must(r, 'compliance_flags') as Row[]),
      listDesigners(),
      getActivity(id),
    ]);
    activity = act; calls = c; ex = e[0] ?? null; handoffs = h; outcome = o; consultations = co; notifications = n; flags = f;
    designers = d.map((x) => ({ id: x.id, name: x.name, active: x.active, on_leave: x.on_leave }));
  } catch (e) {
    partialError = errMsg(e);
  }

  const dName = new Map(designers.map((d) => [d.id, d.name]));
  const raw: Row = lead.raw ?? {};
  const f = lead.fields;
  const propertyType = f?.property_type ?? raw.property_type ?? null;
  const locality = f?.locality ?? raw.locality ?? null;
  const callerName = lead.callerName ?? f?.name ?? null;
  const at = istParts(lead.callAt);
  const openFlags = flags.filter((x) => !x.resolved_at);

  // ---- timeline
  const lastCall = calls[calls.length - 1];
  const callEnd: string | null = lastCall ? (lastCall.ended_at ?? lastCall.started_at) : lead.callAt.toISOString();
  const briefAt: string | null = ex?.created_at ?? null;
  const firstHandoff = handoffs[0];
  const sentAt: string | null = firstHandoff?.sent_at ?? null;
  const acceptedH = handoffs.find((h) => h.accepted_at);
  const acceptedAt: string | null = acceptedH?.accepted_at ?? null;
  const calledAt: string | null = outcome?.called_back_at ?? null;
  const consult = consultations[0];
  const consultAt: string | null = outcome?.consult_booked_at ?? consult?.created_at ?? consult?.scheduled_at ?? null;

  const steps: { label: string; at: string | null; sub?: string }[] = [
    { label: 'Call', at: callEnd },
    { label: 'Brief', at: briefAt },
    { label: 'Sent', at: sentAt },
    { label: 'Accepted', at: acceptedAt },
    { label: 'Called back', at: calledAt },
    { label: 'Consultation', at: consultAt, sub: consult?.scheduled_at ? `for ${fmtDayDateTime(consult.scheduled_at)}` : undefined },
  ];

  const handedName = firstHandoff ? dName.get(firstHandoff.designer_id) ?? 'a designer' : null;
  const acceptMin = minutesBetween(acceptedH?.sent_at, acceptedAt);
  const storyParts: string[] = [];
  if (sentAt && handedName) storyParts.push(`Handed to ${handedName} at ${fmtTime(sentAt)}`);
  if (acceptedAt) storyParts.push(`${storyParts.length ? 'accepted' : 'Accepted'}${acceptMin != null ? ` in ${gap(acceptMin)}` : ''}`);
  const cbMin = minutesBetween(sentAt, calledAt);
  if (calledAt) storyParts.push(`called back ${cbMin != null ? gap(cbMin) + ' after the brief went out' : 'afterwards'}`);
  if (consultAt && consult?.scheduled_at) storyParts.push(`consultation set for ${fmtDayDateTime(consult.scheduled_at)}`);
  const story = storyParts.length
    ? storyParts[0] + (storyParts.length > 1 ? ' — ' + storyParts.slice(1).join(', ') : '') + '.'
    : lead.status === 'new' ? 'The brief is still being written up.' : '';

  // ---- recordings and transcripts
  const multi = calls.length > 1;

  const criteria = [...(lead.criteria ?? [])].sort((a: Criterion, b: Criterion) => CRITERION_KEYS.indexOf(a.key) - CRITERION_KEYS.indexOf(b.key));

  const tokensIn = Number(ex?.input_tokens ?? 0), tokensOut = Number(ex?.output_tokens ?? 0);

  return (
    <>
      <PageHeader title={lead.ref} plain="One enquiry, laid out like a design brief." />
      <Page>
        {partialError && (
          <Sheet tone="terracotta">
            <Label>Part of this brief could not be loaded</Label>
            <p className="mt-2 text-sm">Some details (calls, messages or outcomes) are missing from this page for now. Refresh to try again.</p>
            <p className="num mt-2 break-words text-xs text-muted">{partialError}</p>
          </Sheet>
        )}

        {/* ---------------------------------------------------------- header strip */}
        <Sheet>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <PlanIcon type={propertyType} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="num text-sm font-medium text-muted">{lead.ref}</span>
                <span className="display text-2xl font-semibold">{callerName ?? 'Unknown caller'}</span>
                {lead.callerNumber && <span className="num text-sm text-muted">{lead.callerNumber}</span>}
              </div>
              <div className="mt-0.5 text-sm text-muted">{locality ?? 'Locality not given'}{propertyType ? ` · ${propertyType}` : ''}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <VerdictChip verdict={lead.verdict} />
              <StatusChip status={lead.status} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-clay pt-3">
            <div className="flex items-center gap-2">
              <span className="num text-sm">{fmtDayDateTime(lead.callAt)}</span>
              <TimeOfDay hour={at.h} minute={at.min} afterHours={lead.afterHours} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {lead.simulated && <Badge tone="indigo">Simulated</Badge>}
              {lead.referral && <Badge tone="brass">Referral · {lead.referral}</Badge>}
              {lead.priority && <Badge tone="terracotta">Priority{lead.priorityReason ? ` · ${lead.priorityReason}` : ''}</Badge>}
            </div>
            <div className="sm:ml-auto"><Swatches seed={lead.id} propertyType={propertyType} scope={f?.scope} /></div>
          </div>
        </Sheet>

        {/* ---------------------------------------------------------- timeline */}
        <Sheet>
          <Label>From call to consultation</Label>
          <ol className="mt-3 flex items-start overflow-x-auto pb-1" aria-label="Enquiry timeline">
            {steps.map((s, i) => {
              const prev = steps[i - 1];
              const m = i > 0 && s.at && prev?.at ? minutesBetween(prev.at, s.at) : null;
              const reached = !!s.at;
              return (
                <li key={s.label} className="min-w-[8.25rem] flex-1 px-1">
                  <div className="h-5">{m != null && m >= 0 ? <Dimension>{gap(m)}</Dimension> : null}</div>
                  <div className={cx('mt-1 rounded border p-2', reached ? 'border-teak/60 bg-plaster/60' : 'border-dashed border-clay')}>
                    <Label>{s.label}</Label>
                    <div className={cx('num mt-0.5 text-sm', reached ? 'text-ink' : 'text-muted')}>{s.at ? fmtDateTime(s.at) : 'not yet'}</div>
                    {s.sub && s.at && <div className="num text-[11px] text-muted">{s.sub}</div>}
                  </div>
                </li>
              );
            })}
          </ol>
          {story && <p className="display mt-4 text-lg text-ink">{story}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {sentAt && <Stamp tone="indigo">Handed over {fmtTime(sentAt)}</Stamp>}
            {acceptedAt && <Stamp tone="sage">Accepted</Stamp>}
            {consultAt && <Stamp tone="sage">Consultation booked</Stamp>}
            {openFlags.length > 0 && <Stamp tone="alert">House Rule</Stamp>}
          </div>
        </Sheet>

        {/* ---------------------------------------------------------- Nikhil's actions */}
        <Sheet>
          <Label>What you can do from here</Label>
          <div className="mt-3">
            <BriefActions
              refCode={lead.ref}
              status={lead.status}
              verdict={lead.verdict}
              needsAck={lead.verdict === 'escalate' && !lead.raw.escalation_acked_at}
              hasDesigner={!!lead.assignedDesignerId}
              assignedId={lead.assignedDesignerId}
              designers={designers.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name }))}
            />
          </div>
          {lead.assignedDesignerId && <p className="mt-2 text-xs text-muted">Currently with <b>{dName.get(lead.assignedDesignerId) ?? 'a designer'}</b>. Callback due <span className="num">{whenWords(lead.callbackDue)}</span>.</p>}
        </Sheet>

        {/* ---------------------------------------------------------- the project sheet */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* LEFT */}
          <div className="space-y-5">
            <Sheet>
              <Label>Handoff note</Label>
              {(lead.priority || lead.priceAsked) && (
                <div className="mt-3 space-y-2">
                  {lead.priority && (
                    <div className="rounded border-2 border-terracotta bg-[#F7E3DA] px-3 py-2 text-sm text-terracotta-deep">
                      <b className="tracking-wider">PRIORITY</b>{lead.priorityReason ? ` · ${lead.priorityReason}` : ''}
                    </div>
                  )}
                  {lead.priceAsked && (
                    <div className="rounded border border-brass/50 bg-[#F5EBD2] px-3 py-2 text-sm text-brass-deep">
                      <b>Asked about price.</b> The assistant did not quote one; the designer should be ready to speak to it.
                    </div>
                  )}
                </div>
              )}
              {lead.existingClient && (
                <p className="mt-3 text-sm">Existing client{lead.existingClient.designer_name ? ` of ${lead.existingClient.designer_name}` : ''}{lead.existingClient.project ? ` · ${lead.existingClient.project}` : ''}.</p>
              )}
              {lead.note
                ? <div className="mt-3 whitespace-pre-wrap rounded border border-clay bg-plaster/50 p-3 text-sm leading-relaxed">{lead.note}</div>
                : <p className="mt-3 text-sm text-muted">The note is still being written. It appears here as soon as the call has been read.</p>}
              {lead.stillUnknown.length > 0 && (
                <div className="mt-3">
                  <Label>Still unknown</Label>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{lead.stillUnknown.map((u, i) => <li key={i}>{u}</li>)}</ul>
                </div>
              )}
              {lead.notes.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-clay pt-2">
                  {lead.notes.map((n, i) => <li key={i} className="text-xs text-muted"><span className="annot !text-[10px]">checked by code</span> {n}</li>)}
                </ul>
              )}
              {lead.mood && <p className="mt-2 text-xs text-muted">Caller sounded <b>{lead.mood}</b>.</p>}
            </Sheet>

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
                    ['Referral', f.referral_name ?? lead.referral],
                    ['Language', f.language],
                    ['Callback preference', f.callback_preference],
                    ['Callback due', lead.callbackDue ? whenWords(lead.callbackDue) : null],
                  ] as [string, string | null | undefined][]).map(([k, v]) => (
                    <div key={k}>
                      <dt className="annot">{k}</dt>
                      <dd className={cx('mt-0.5 text-sm', v ? 'text-ink' : 'text-muted')}>{v ? <span className={/\d/.test(v) && v.length < 14 ? 'num' : ''}>{v}</span> : 'not discussed'}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-3 text-sm text-muted">The details are still being read from the call.</p>
              )}
            </Sheet>

            <Sheet>
              <Label>The five tests</Label>
              {criteria.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Not assessed yet.</p>
              ) : (
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

            <Sheet tone={openFlags.length ? 'alert' : undefined}>
              <Label>House Rules on this call</Label>
              {flags.length === 0 ? (
                <p className="mt-3 text-sm text-sage-deep">No House Rules broken on this call.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {flags.map((fl) => (
                    <li key={fl.id} className={cx('rounded border p-3', fl.resolved_at ? 'border-clay' : 'border-alert bg-[#F6DDD8]/50')}>
                      <div className={cx('text-sm font-semibold', fl.resolved_at ? 'text-muted' : 'text-alert')}>{RULE_LABEL[fl.rule] ?? fl.rule}</div>
                      <blockquote className="mt-1.5 border-l-2 border-alert/50 pl-3 text-sm italic">“{fl.excerpt}”</blockquote>
                      {fl.resolved_at
                        ? <p className="mt-2 text-xs text-sage-deep">Reviewed{fl.resolved_by ? ` by ${fl.resolved_by}` : ''} · <span className="num">{fmtDateTime(fl.resolved_at)}</span></p>
                        : <ResolveFlag refCode={lead.ref} flagId={fl.id} />}
                    </li>
                  ))}
                </ul>
              )}
            </Sheet>
          </div>

          {/* RIGHT */}
          <div className="space-y-5">
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
                      <h3 className="annot">
                        Call {i + 1} · <span className="num">{fmtTime(c.started_at)}</span> · <span className="num">{fmtDuration(c.duration_sec)}</span>{c.answered === false ? ' (not answered)' : ''}
                      </h3>
                      {hasRec && (
                        <div className="mt-2">
                          {src
                            ? <audio controls preload="none" src={src} className="w-full" aria-label={`Recording of call ${i + 1}`} />
                            : <p className="text-xs text-muted">Recording link unavailable.</p>}
                        </div>
                      )}
                      {turns.length === 0 ? (
                        <p className="mt-2 text-sm text-muted">No transcript was captured for this call.</p>
                      ) : (
                        <ol className="mt-3 space-y-2">
                          {turns.map((t, j) => {
                            const caller = t.speaker === 'caller';
                            return (
                              <li key={j} className={cx('max-w-[92%] rounded px-3 py-2 text-sm', caller ? 'ml-auto border border-indigo/25 bg-[#E2E8F0]/60' : 'border border-clay bg-plaster/60')}>
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
          </div>
        </div>

        {/* ---------------------------------------------------------- messages sent */}
        <HubspotPanel enquiryId={lead.id} refCode={lead.ref} simulated={lead.simulated} />

        <Sheet>
          <Label>Messages sent</Label>
          {notifications.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing has been sent about this enquiry yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-clay">
              {notifications.map((n) => {
                const who = n.recipient_type === 'designer' ? (n.recipient_id ? dName.get(n.recipient_id) ?? 'Designer' : 'Designer') : n.recipient_type === 'frontdesk' ? 'Front desk' : 'Nikhil';
                const actMin = minutesBetween(n.sent_at, n.acted_at);
                return (
                  <li key={n.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 text-sm">
                    <span className="num w-28 shrink-0 text-xs text-muted">{fmtDateTime(n.sent_at)}</span>
                    <span className="min-w-[10rem] flex-1"><b className="font-medium">{KIND_LABEL[n.kind] ?? n.kind}</b> <span className="text-muted">to {who} by {n.channel === 'desk' ? 'My Desk' : n.channel}</span></span>
                    <span className={cx('inline-flex items-center gap-1 text-xs font-semibold', n.delivered ? 'text-sage-deep' : 'text-terracotta-deep')}>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={n.delivered ? 'M3 8.5l3.2 3L13 4.5' : 'M4 4l8 8M12 4l-8 8'} /></svg>
                      {n.delivered ? 'delivered' : 'not delivered'}
                    </span>
                    {n.silent && <span className="text-xs text-indigo">🌙 silent</span>}
                    {n.error && <span className="num w-full text-xs text-terracotta-deep">{String(n.error)}</span>}
                    {n.acted_at && (
                      <span className="w-full text-xs text-muted">
                        {ACTION_WORD[n.action ?? ''] ?? n.action ?? 'acted'}{n.acted_via ? ` via ${n.acted_via === 'desk' ? 'My Desk' : n.acted_via}` : ''}{actMin != null ? ` after ${gap(actMin)}` : ''}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Sheet>

        {/* ---------------------------------------------------------- activity trail */}
        <Sheet>
          <Label>Activity</Label>
          <p className="mt-1 text-xs text-muted">Who did what on this enquiry, and when.</p>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing has been recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-clay">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 text-sm">
                  <span className="num w-28 shrink-0 text-xs text-muted">{fmtDateTime(a.at)}</span>
                  <span className="min-w-[10rem] flex-1">
                    <b className="font-medium">{a.actor_name}</b>{' '}
                    <Badge tone={a.actor_type === 'designer' ? 'terracotta' : a.actor_type === 'admin' ? 'indigo' : 'brass'}>{a.actor_type === 'designer' ? 'Designer' : a.actor_type === 'admin' ? 'Studio' : 'Assistant'}</Badge>{' '}
                    <span className="text-ink">{a.detail ?? a.action}</span>
                  </span>
                  {a.via && <span className="text-xs text-muted">via {a.via}</span>}
                </li>
              ))}
            </ul>
          )}
        </Sheet>

        {/* ---------------------------------------------------------- footnote */}
        {ex && (
          <p className="px-1 text-xs leading-relaxed text-muted">
            Verdict set by {raw.verdict_source === 'code' ? 'the House Rules (code)' : raw.verdict_source === 'gemini' ? 'Gemini' : 'the assistant'}
            {ex.model ? <> · model <span className="num">{ex.model}</span></> : null}.{' '}
            {ex.verdict_mismatch && ex.suggested_verdict && ex.final_verdict
              ? <>Gemini suggested <b>{VERDICT_WORD[ex.suggested_verdict] ?? ex.suggested_verdict}</b>; the rules said <b>{VERDICT_WORD[ex.final_verdict] ?? ex.final_verdict}</b>, and the rules win. </>
              : null}
            Reading this call used <span className="num">{(tokensIn + tokensOut).toLocaleString('en-IN')}</span> tokens, costing <span className="num">{inr(ex.cost_inr != null ? Number(ex.cost_inr) : null, 2)}</span>.{' '}
            Quotes checked against the transcript: <b>{ex.quotes_verified ? 'yes' : 'no'}</b>.
          </p>
        )}
      </Page>
    </>
  );
}
