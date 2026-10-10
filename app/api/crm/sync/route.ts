import { isAuthed, unauthorized } from '@/lib/auth';
import { syncEnquiry } from '@/lib/crm/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Admin: push one enquiry to HubSpot now (Brief Book button). `force` also sends sample / rehearsal enquiries. */
export async function POST(req: Request) {
  if (!(await isAuthed(req))) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (typeof b.ref !== 'string') return Response.json({ ok: false, error: 'ref is required' }, { status: 400 });
  const r = await syncEnquiry(b.ref, { force: b.force === true, event: 'manual_sync' });
  return Response.json(r, { status: r.ok ? 200 : 502 });
}
