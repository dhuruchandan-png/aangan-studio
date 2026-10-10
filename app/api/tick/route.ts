import { runTickThrottled } from '@/lib/tick';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Keeps reminders, reassignments and retries moving. Safe to call often: it runs once a minute at most. */
export async function POST() {
  try { return Response.json(await runTickThrottled()); }
  catch { return Response.json({ ok: false }, { status: 500 }); }
}
