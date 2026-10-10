import { isAuthed, unauthorized } from '@/lib/auth';
import { setSetting } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await isAuthed(req))) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (b.key === 'avg_project_value_inr' && Number(b.value) > 0) { await setSetting('avg_project_value_inr', Number(b.value)); return Response.json({ ok: true }); }
  return Response.json({ error: 'unsupported setting' }, { status: 400 });
}
