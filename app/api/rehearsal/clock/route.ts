import { isAuthed, unauthorized } from '@/lib/auth';
import { advanceClock, getClockOffset } from '@/lib/rehearsal';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) { if (!(await isAuthed(req))) return unauthorized(); return Response.json({ offset: await getClockOffset() }); }
export async function POST(req: Request) {
  if (!(await isAuthed(req))) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const m = b.minutes === 'reset' ? 'reset' : Number(b.minutes);
  if (m !== 'reset' && !(m > 0 && m <= 240)) return Response.json({ error: 'minutes must be 1–240 or "reset"' }, { status: 400 });
  try { return Response.json(await advanceClock(m)); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}
