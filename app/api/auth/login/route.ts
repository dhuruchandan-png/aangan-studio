import { NextResponse } from 'next/server';
import { passcodeOk } from '@/lib/auth';
import { limited } from '@/lib/ratelimit';
import { SESSION_COOKIE, signSession } from '@/lib/session';

/** Studio passcode: admin access (Nikhil / front desk). Designers sign in with their email link instead. */
export async function POST(req: Request) {
  if (limited(req, 'login', 8)) return NextResponse.json({ error: 'Too many tries. Wait a minute.' }, { status: 429 });
  const form = await req.formData();
  const next = String(form.get('next') ?? '/');
  if (!passcodeOk(String(form.get('passcode') ?? ''))) {
    return new NextResponse(null, { status: 303, headers: { location: `/login?error=1&next=${encodeURIComponent(next)}` } });
  }
  const dest = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/me') ? next : '/';
  const res = new NextResponse(null, { status: 303, headers: { location: dest } });
  res.cookies.set(SESSION_COOKIE, await signSession({ r: 'admin', n: 'Studio' }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
