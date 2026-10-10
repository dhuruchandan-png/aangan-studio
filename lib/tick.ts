// The single scheduled entry point. /api/cron/tick calls this every 5 minutes (an external cron job, see README step 6) and twice a day
// from Vercel as a safety net. Every job is idempotent via job_runs, so a late or duplicate tick never double-sends.
import { db } from './db';
import { env } from './env';
import { logCost } from './cost';
import { sendFrontDeskDigest, sendMonthly, sendNikhilSummary, sendWeekly, sendYourDay } from './digests';
import { listDesigners } from './leads';
import { runLadder, type LadderEvent } from './ladder';
import { finalizePendingEnquiries } from './pipeline/run';
import { retryPendingCrm } from './crm/sync';
import { istDayKey, istParts, hm, istDate } from './time';

/** Run `fn` at most once per (job, key). */
async function once(job: string, key: string, fn: () => Promise<unknown>): Promise<boolean> {
  const { error } = await db().from('job_runs').insert({ job, run_key: key });
  if (error) return false; // 23505 = already ran
  try {
    const result = await fn();
    await db().from('job_runs').update({ result: (result ?? null) as object }).eq('job', job).eq('run_key', key);
  } catch (e) {
    await db().from('job_runs').update({ result: { error: (e as Error).message } }).eq('job', job).eq('run_key', key);
  }
  return true;
}

export interface TickResult { at: string; ladder: LadderEvent[]; finalized: number; crm: number; jobs: string[] }

export async function runTick(now = new Date()): Promise<TickResult> {
  const jobs: string[] = [];
  const p = istParts(now);
  const mins = p.h * 60 + p.min;
  const day = istDayKey(now);
  const at = (hhmm: string) => hm(hhmm).h * 60 + hm(hhmm).m;

  // 1. Dropped calls that never rang back, and extractions that failed earlier.
  const finalized = await finalizePendingEnquiries(now);

  // 1b. HubSpot: anything that never arrived, or failed last time.
  const crm = await retryPendingCrm();

  // 2. The escalation ladder.
  const ladder = await runLadder({ now });

  // 3. Fixed monthly cost, once per month.
  const monthKey = day.slice(0, 7);
  if (Number(env('COST_FIXED_MONTHLY_INR')) > 0) {
    if (await once('fixed_cost', monthKey, () => logCost({ source: 'fixed', units: 1, amount_inr: Number(env('COST_FIXED_MONTHLY_INR')), at: istDate(p.y, p.m, 1, 12), meta: { month: monthKey } }))) jobs.push('fixed_cost');
  }

  // 4. Scheduled digests (IST).
  const working = p.dow !== 0;
  if (working && mins >= at('09:30') && mins < at('14:00')) {
    for (const d of (await listDesigners()).filter((x) => x.active && !x.on_leave && x.rota?.days?.includes(p.dow))) {
      if (mins < at(d.digest_time || '09:30')) continue;
      if (await once('your_day', `${day}:${d.id}`, () => sendYourDay(d, now))) jobs.push(`your_day:${d.name}`);
    }
  }
  if (working && mins >= at('10:00') && mins < at('15:00') && (await once('frontdesk_digest', day, () => sendFrontDeskDigest(now)))) jobs.push('frontdesk_digest');
  if (mins >= at('20:00') && (await once('nikhil_summary', day, () => sendNikhilSummary(now)))) jobs.push('nikhil_summary');
  if (p.dow === 1 && mins >= at('09:00') && mins < at('18:00') && (await once('weekly', day, () => sendWeekly(now)))) jobs.push('weekly');
  if (p.d === 1 && mins >= at('09:00') && mins < at('18:00') && (await once('monthly', monthKey, () => sendMonthly(now)))) jobs.push('monthly');

  return { at: now.toISOString(), ladder, finalized, crm, jobs };
}

/** The scheduler without an outside clock: any open dashboard, and every finished call, nudges this. Runs at most once a minute. */
export async function runTickThrottled(now = new Date()): Promise<TickResult | { skipped: true }> {
  const key = String(Math.floor(now.getTime() / 60_000));
  const { error } = await db().from('job_runs').insert({ job: 'tick', run_key: key });
  if (error) return { skipped: true };
  return runTick(now);
}
