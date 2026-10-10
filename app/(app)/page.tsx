import { simScope } from '@/lib/demo';
import Link from 'next/link';
import { AvgValueEditor } from '@/components/AvgValueEditor';
import { Bars, HourChart, LineCompare, SplitBar } from '@/components/charts';
import { errMsg } from '@/components/format';
import { RoomScene } from '@/components/art';
import { BigFigure, Empty, IconTile, Label, Page, PageHeader, Ring, Sheet, Spark, Stat, cx } from '@/components/ui';
import { db, getSetting } from '@/lib/db';
import { env, envBool } from '@/lib/env';
import { computeStats, inr, lakh, minS, pctS, secS, type Stats } from '@/lib/stats';
import { fmtDateTime, istMonthRange, istParts } from '@/lib/time';

export const dynamic = 'force-dynamic';

const has = (k: string) => env(k).length > 0;

/** Cumulative answered % by day of month (null before the first call). */
function cumulativeAnswered(daily: Stats['daily'], upTo: number): (number | null)[] {
  let calls = 0, answered = 0;
  return daily.slice(0, upTo).map((d) => {
    calls += d.calls; answered += d.answered;
    return calls ? Math.round((answered / calls) * 100) : null;
  });
}

function Room({ children, tone }: { children: React.ReactNode; tone?: 'alert' }) {
  return <Sheet tone={tone} className="!p-4">{children}</Sheet>;
}

function Check({ ok, okText, badText, hint }: { ok: boolean; okText: string; badText: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <svg width="16" height="16" viewBox="0 0 16 16" className={cx('mt-0.5 shrink-0', ok ? 'text-sage-deep' : 'text-terracotta-deep')} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={ok ? 'M3 8.5l3.2 3L13 4.5' : 'M4 4l8 8M12 4l-8 8'} />
      </svg>
      <span>
        <span className={ok ? 'text-ink' : 'text-terracotta-deep'}>{ok ? okText : badText}</span>
        {hint && !ok && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </li>
  );
}

export default async function Courtyard() {
  const now = new Date();
  let stats: Stats | null = null;
  let prev: Stats | null = null;
  let baselineUnanswered = 48;
  let loadError: string | null = null;
  let lastCall: string | null = null;

  try {
    const [a, b, base] = await Promise.all([
      computeStats(istMonthRange(now, 0).start, istMonthRange(now, 0).end),
      computeStats(istMonthRange(now, -1).start, istMonthRange(now, -1).end),
      getSetting<number>('baseline_unanswered_pct', 48),
    ]);
    stats = a; prev = b;
    const n = Number(base);
    if (isFinite(n) && n >= 0 && n <= 100) baselineUnanswered = n;
  } catch (e) {
    loadError = errMsg(e);
  }
  try {
    const { data } = await db().from('calls').select('started_at').in('simulated', simScope()).order('started_at', { ascending: false }).limit(1);
    lastCall = data?.[0]?.started_at ?? null;
  } catch { /* shown as "no calls yet" */ }

  const baseline = 100 - baselineUnanswered;
  const today = istParts(now).d;

  const setup = {
    database: has('DATABASE_URL'),
    hubspot: has('HUBSPOT_ACCESS_TOKEN'),
    gemini: has('GEMINI_API_KEY'),
    inboxes: has('NIKHIL_EMAIL') && has('FRONTDESK_EMAIL'),
    vaani: has('VAANI_WEBHOOK_SECRET'),
    resend: has('RESEND_API_KEY'),
    cron: has('CRON_SECRET'),
    link: has('LINK_SIGNING_SECRET'),
    rates: has('COST_VAANI_PER_MIN_INR') && has('COST_GEMINI_INPUT_PER_1M_INR') && has('COST_GEMINI_OUTPUT_PER_1M_INR') && has('COST_FIXED_MONTHLY_INR'),
  };
  const emailTest = envBool('EMAIL_TEST_MODE', false);

  const s = stats;
  const verdictParts = s
    ? [
        { label: 'Qualified', n: s.verdicts.qualified ?? 0, color: '#6F8A6E' },
        { label: 'Unsure', n: s.verdicts.unsure ?? 0, color: '#B8913F' },
        { label: 'Not a fit', n: s.verdicts.not_a_fit ?? 0, color: '#CDBBA3' },
        { label: 'Escalate', n: s.verdicts.escalate ?? 0, color: '#B8573A' },
        { label: 'Other', n: s.verdicts.other ?? 0, color: '#9C8F80' },
        { label: 'Reading', n: s.verdicts.pending ?? 0, color: '#E7D8C6' },
      ]
    : [];

  return (
    <>
      <PageHeader title="The Courtyard" plain="What the phone assistant is generating, and what it costs." right={<RoomScene className="hidden w-60 rounded-2xl shadow-lift lg:block" />} />
      <Page>
        {loadError && (
          <Sheet tone="terracotta">
            <Label>Could not read the numbers</Label>
            <p className="mt-2 text-sm">The overview could not be loaded just now, so the figures are hidden rather than guessed. Nothing has been lost; the calls are safe in the database.</p>
            <p className="num mt-2 break-words text-xs text-muted">{loadError}</p>
          </Sheet>
        )}

        {s && prev && (
          <>
            <p className="text-base text-muted" aria-live="polite">
              <span className="num">{s.calls}</span> {s.calls === 1 ? 'call' : 'calls'} answered this month ·{' '}
              <span className="num">{s.afterHoursCalls}</span> of them outside front-desk hours
            </p>

            {s.calls === 0 ? (
              <Empty line="All quiet in the courtyard. The first call the assistant answers will light up this page." />
            ) : (
              <div className="space-y-5">
                {/* hero + promises */}
                <div className="grid gap-5 lg:grid-cols-5">
                  <div className="hero relative rounded-[22px] p-6 shadow-lift lg:col-span-2">
                    <div className="jaali absolute inset-0" aria-hidden /><div className="glow" aria-hidden />
                    <div className="relative">
                      <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-gold">Calls answered · this month</div>
                      <div className="figure mt-2 text-[5.5rem] font-semibold leading-none text-[#FFF6E6]">{s.calls}</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[#E8D9C2]"><span className="num">{s.afterHoursCalls}</span> after hours</span>
                        {s.calls - prev.calls !== 0
                          ? <span className={cx('rounded-full px-2.5 py-1 font-medium', s.calls >= prev.calls ? 'bg-sage/25 text-[#BFDDBE]' : 'bg-terracotta/25 text-[#F2C2B0]')}>{s.calls >= prev.calls ? '▲' : '▼'} <span className="num">{Math.abs(s.calls - prev.calls)}</span> vs last month</span>
                          : <span className="rounded-full bg-white/10 px-2.5 py-1 text-[#E8D9C2]">same as last month</span>}
                      </div>
                      <div className="mt-5 -mb-1"><Spark values={s.daily.slice(0, today).map((d) => d.calls)} /></div>
                      <p className="mt-2 text-xs text-[#E8D9C2]/70">{s.afterHoursCalls > 0 ? 'After-hours calls would have gone unanswered or waited for morning.' : 'Every call so far came in during front-desk hours.'}</p>
                    </div>
                  </div>

                  <div className="lg:col-span-3">
                    <Sheet className="h-full !p-5">
                      <div className="flex items-baseline justify-between"><Label>How well the promises are kept</Label><span className="text-xs text-muted">this month</span></div>
                      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
                        {[
                          { l: 'Answered', v: s.answeredPct, c: '#6F8A6E', n: `${s.answered} of ${s.calls} calls` },
                          { l: 'Handed off under 5 min', v: s.handedUnder5Pct, c: '#B8573A', n: 'brief reached a designer' },
                          { l: 'Accepted under 15 min', v: s.acceptedUnder15Pct, c: '#2F4A6D', n: 'from the brief being sent' },
                          { l: 'Callbacks kept', v: s.callbackKeptPct, c: '#B8913F', n: 'within the promised time' },
                        ].map((r) => (
                          <div key={r.l} className="flex flex-col items-center text-center">
                            <Ring pct={r.v} color={r.c}><span className="figure text-xl font-semibold">{pctS(r.v)}</span></Ring>
                            <div className="mt-2 text-[13px] font-semibold leading-tight">{r.l}</div>
                            <div className="mt-0.5 text-[11px] leading-tight text-muted">{r.n}</div>
                          </div>
                        ))}
                      </div>
                    </Sheet>
                  </div>
                </div>

                {/* everything else, one quiet grid */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <Stat icon="star" tone="sage" label="Qualified" value={s.qualified} note="Met all five tests." />
                  <Stat icon="cal" tone="indigo" label="Consultations booked" value={s.consultations} note="Site visits or studio meetings in a diary." />
                  <Stat icon="clock" tone="terracotta" label="Median ring to answer" value={secS(s.medianRingSec)} note="First ring to the assistant speaking." />
                  <Stat icon="moon" tone="indigo" label="After-hours share" value={pctS(s.afterHoursPct)} note="Outside 10am to 7pm, Monday to Saturday." />
                  <Stat icon="users" tone="brass" label="Escalations" value={s.escalations} note="Existing clients who needed a senior voice." />
                  <Stat icon="alert" tone="brass" label="Missed promises" value={s.missedPromises} flag={s.missedPromises > 0 ? 'warn' : undefined} note="Callbacks past their promised time." />
                  <div className={cx('sheet lift p-4', s.ruleBreaks > 0 && '!border-alert/60')}>
                    <div className="flex items-center gap-2.5"><IconTile icon="alert" tone={s.ruleBreaks > 0 ? 'alert' : 'sage'} size={30} /><span className="text-[13px] font-medium text-muted">House Rules broken</span></div>
                    <div className={cx('figure mt-3 text-4xl font-semibold leading-none', s.ruleBreaks > 0 && 'text-alert')}>{s.ruleBreaks}</div>
                    <p className="mt-2 text-xs leading-snug text-muted">{s.ruleBreaks > 0 ? 'The assistant said something the never-say list forbids.' : 'Should always be zero. It is.'}</p>
                    {s.ruleBreaks > 0 && <Link href="/front-door?rule=1" className="mt-2 inline-block text-sm font-medium text-alert underline">See those calls →</Link>}
                  </div>
                  <Stat icon="check" tone="sage" label="Last month, answered" value={pctS(prev.answeredPct)} note={`${prev.calls} calls, ${prev.qualified} qualified.`} />
                </div>
              </div>
            )}

            {s.calls > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Sheet>
                  <Label>Calls by hour</Label>
                  <div className="mt-3"><HourChart byHour={s.byHour} /></div>
                  <p className="mt-2 text-xs text-muted">Terracotta bars are calls that came in when the front desk was closed.</p>
                </Sheet>
                <Sheet>
                  <Label>What the calls turned into</Label>
                  <div className="mt-3"><SplitBar parts={verdictParts} /></div>
                  <p className="mt-2 text-xs text-muted">Every enquiry this month, by the verdict the five tests gave it.</p>
                </Sheet>
                <Sheet>
                  <Label>Time to callback</Label>
                  <div className="mt-3"><Bars rows={s.callbackBuckets} /></div>
                  <p className="mt-2 text-xs text-muted">How long qualified callers waited between the brief being sent and a designer calling.</p>
                </Sheet>
                <Sheet>
                  <Label>Answered, this month against last</Label>
                  <div className="mt-3">
                    <LineCompare
                      thisMonth={cumulativeAnswered(s.daily, today)}
                      lastMonth={cumulativeAnswered(prev.daily, prev.daily.length)}
                      baseline={baseline}
                      baselineLabel={`${baseline}% got a reply in 48 h before`}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted">Running share of calls answered, day by day. The dashed line is how things were before the assistant.</p>
                </Sheet>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Sheet>
                <Label>What it costs · this month</Label>
                <div className="mt-2 grid grid-cols-2 gap-4">
                  <BigFigure label="Total" value={inr(s.cost.total)} note="Everything the assistant cost to run." />
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between gap-2"><span className="text-muted">Voice minutes (Vaani)</span><span className="num">{inr(s.cost.vaani)}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted">Reading (Gemini)</span><span className="num">{inr(s.cost.gemini)}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted">Fixed</span><span className="num">{inr(s.cost.fixed)}</span></div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-clay pt-3">
                  <BigFigure label="Per call" value={inr(s.costPerCall, 1)} />
                  <BigFigure label="Per qualified" value={inr(s.costPerQualified)} />
                  <BigFigure label="Per consultation" value={inr(s.costPerConsult)} />
                </div>
                <p className="mt-3 text-xs text-muted">Vaani is the phone-calling service; Gemini is the model that reads each call.</p>
              </Sheet>

              <Sheet>
                <Label>Pipeline generated</Label>
                <div className="mt-2">
                  <BigFigure label="Indicative, internal only" value={lakh(s.pipeline)} note={`${s.consultations} consultations × average project value of ${inr(s.avgProjectValue)}.`} />
                  <AvgValueEditor initial={s.avgProjectValue} />
                </div>
                <div className="mt-3 border-t border-clay pt-3 text-sm">
                  {s.pipelineRatio != null
                    ? <>Every ₹1 spent on the assistant sits beside <span className="num font-semibold">₹{Math.round(s.pipelineRatio).toLocaleString('en-IN')}</span> of indicative pipeline.</>
                    : <>Cost against pipeline: <span className="num">—</span> <span className="text-muted">(needs a cost and at least one consultation)</span></>}
                </div>
              </Sheet>
            </div>

            <Sheet>
              <Label>Reaching the team</Label>
              <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
                <BigFigure label="Median handoff to Accept" value={minS(s.reach.medianAcceptMin)} note="From the brief being sent to a designer tapping Accept." />
                <BigFigure label="Nudges per lead" value={s.reach.nudgesPerLead == null ? '—' : s.reach.nudgesPerLead.toFixed(1)} note="Reminders needed before someone accepted." />
                <BigFigure label="Reassignments" value={s.reach.reassignments} note="Leads that moved to a different designer." />
                <div>
                  <Label>Where they act from</Label>
                  <ul className="num mt-1 space-y-0.5 text-sm">
                    <li>Email {pctS(s.reach.viaPct.email ?? null)}</li>
                    <li>My Desk {pctS(s.reach.viaPct.desk ?? null)}</li>
                    <li>Dashboard {pctS(s.reach.viaPct.dashboard ?? null)}</li>
                  </ul>
                </div>
              </div>
              {s.reach.noEmail.length > 0 ? (
                <p className="mt-4 border-t border-clay pt-3 text-sm">
                  No email address on file for <b>{s.reach.noEmail.join(', ')}</b>, so leads for them cannot be delivered.{' '}
                  <Link href="/roster" className="text-indigo underline">Open the roster →</Link>
                </p>
              ) : (
                <p className="mt-4 border-t border-clay pt-3 text-sm text-sage-deep">Every active designer has an email address on file.</p>
              )}
            </Sheet>
          </>
        )}

      </Page>
    </>
  );
}
