import { isAuthed, unauthorized } from '@/lib/auth';
import { chatWithAgent } from '@/lib/rehearsal';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!(await isAuthed(req))) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const history = Array.isArray(b.history) ? b.history.filter((m: any) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string').slice(-30) : [];
  try { return Response.json(await chatWithAgent(history)); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
