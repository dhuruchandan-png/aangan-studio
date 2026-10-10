import { isAuthed, unauthorized } from '@/lib/auth';
import { db, must } from '@/lib/db';

export const runtime = 'nodejs';

const FIELDS = ['name', 'email', 'active', 'on_leave', 'specialities', 'rota', 'digest_time'];

export async function POST(req: Request) {
  if (!(await isAuthed(req))) return unauthorized();
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === 'create') {
      const d = must(await db().from('designers').insert({ name: String(b.name ?? '').trim() || 'New designer', email: b.email || null }).select('id').single(), 'create designer');
      return Response.json({ ok: true, id: d.id });
    }
    if (b.action === 'update') {
      const patch: Record<string, unknown> = {};
      for (const k of FIELDS) if (k in (b.patch ?? {})) patch[k] = b.patch[k];
      must(await db().from('designers').update(patch).eq('id', b.id), 'update designer');
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
