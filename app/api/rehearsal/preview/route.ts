import { isAuthed, unauthorized } from '@/lib/auth';
import { previewFor } from '@/lib/rehearsal';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await isAuthed(req))) return unauthorized();
  const u = new URL(req.url);
  try { return Response.json(await previewFor(u.searchParams.get('ref') ?? '', u.searchParams.get('designer') ?? undefined)); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
