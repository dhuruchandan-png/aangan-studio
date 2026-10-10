import { applyAction, type ActionName } from '@/lib/actions';
import { designerSession, parseIstLocal, unauthorized } from '@/lib/auth';
import { limited } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const ALLOWED: ActionName[] = ['accept', 'called_back', 'book', 'not_proceeding', 'pass', 'reassign', 'snooze'];

/**
 * A designer's own actions from their dashboard. The designer is ALWAYS the signed-in session, never a field in the
 * request, so nobody can act as someone else. Every call is stamped in actions_log by applyAction().
 * Body: { enquiry: "AG-0001", action, payload?: { reason?, scheduledAt?: ISO or "YYYY-MM-DDTHH:mm" (IST), location?: 'site'|'studio' } }
 */
export async function POST(req: Request) {
  const s = await designerSession(req);
  if (!s?.d) return unauthorized();
  if (limited(req, 'me-action', 90)) return Response.json({ ok: false, message: 'Too many taps, wait a minute.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const action = String(b.action) as ActionName;
  if (!ALLOWED.includes(action) || typeof b.enquiry !== 'string') return Response.json({ ok: false, message: 'Unknown action.' }, { status: 400 });
  const when = b.payload?.scheduledAt ? parseIstLocal(String(b.payload.scheduledAt)) : null;
  const r = await applyAction({
    enquiry: b.enquiry, action, via: b.via === 'email' ? 'email' : 'dashboard', designerId: s.d,
    payload: { reason: b.payload?.reason ? String(b.payload.reason).slice(0, 200) : undefined, scheduledAt: when?.toISOString(), location: b.payload?.location === 'studio' ? 'studio' : 'site' },
  });
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
