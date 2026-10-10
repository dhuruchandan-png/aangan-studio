import { env } from '@/lib/env';
import { runTick } from '@/lib/tick';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function handle(req: Request) {
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'forbidden' }, { status: 403 });
  return Response.json(await runTick());
}
export const GET = handle;
export const POST = handle;
