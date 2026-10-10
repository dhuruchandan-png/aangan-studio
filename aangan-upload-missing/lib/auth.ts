// Access control. Admin = Nikhil / front desk / senior (passcode or an emailed sign-in link). Designer = own email link only.
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from './env';
import { demoOpen } from './demo';
import { sessionFromRequest, type Session } from './session';

export function passcodeOk(input: string): boolean {
  const want = env('DASHBOARD_PASSCODE');
  if (!want) return false;
  const a = Buffer.from(createHash('sha256').update(input).digest('hex')), b = Buffer.from(createHash('sha256').update(want).digest('hex'));
  return timingSafeEqual(a, b);
}

export async function adminSession(req: Request): Promise<Session | null> {
  if (demoOpen()) return { r: 'admin', n: 'Guest reviewer', x: Date.now() + 3_600_000 }; // open dashboard: always the studio view
  const s = await sessionFromRequest(req);
  return s?.r === 'admin' ? s : null;
}
export async function designerSession(req: Request): Promise<Session | null> {
  const s = await sessionFromRequest(req);
  return s?.r === 'designer' ? s : null;
}
/** True for an admin session. (Name kept: every admin-only API route calls this.) */
export async function isAuthed(req: Request): Promise<boolean> { return !!(await adminSession(req)); }
export const unauthorized = () => Response.json({ error: 'Please sign in' }, { status: 401 });

/** Secret shared with Vaani (header or ?secret=), for tool/config endpoints. */
export function secretOk(req: Request): boolean {
  const want = env('VAANI_WEBHOOK_SECRET');
  if (!want) return false;
  const got = req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('secret') ?? '';
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "2026-10-24T15:00" typed on a phone is IST wall-clock time. */
export const parseIstLocal = (v: string): Date | null => {
  if (!v) return null;
  const s = /[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}${v.length === 16 ? ':00' : ''}+05:30`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};
