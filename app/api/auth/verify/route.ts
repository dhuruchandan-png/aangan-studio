import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { consumeLoginLink } from '@/lib/notify/links';
import { SESSION_COOKIE, signSession } from '@/lib/session';
import { limited } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/** The confirm tap (a POST, so email scanners that prefetch the link cannot burn it). Sets the session cookie. */
export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get('t') ?? '');
  const next = String(form.get('next') ?? '');
  const fail = () => new NextResponse(null, { status: 303, headers: { location: '/login?expired=1' } });
  if (limited(req, 'verify', 20)) return fail();
  const p = await consumeLoginLink(token);
  if (!p) return fail();

  let session: { r: 'admin'; n: string } | { r: 'designer'; d: string; n: string };
  if (p.d === 'admin') session = { r: 'admin', n: p.n ?? 'Studio' };
  else {
    const { data } = await db().from('designers').select('id, name, active').eq('id', p.d).maybeSingle();
    if (!data?.active) return fail();
    session = { r: 'designer', d: data.id as string, n: data.name as string };
  }
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '';
  const inMe = safeNext === '/me' || safeNext.startsWith('/me/');
  const dest = safeNext && (session.r === 'designer') === inMe ? safeNext : session.r === 'designer' ? '/me' : '/';
  const res = new NextResponse(null, { status: 303, headers: { location: dest } });
  res.cookies.set(SESSION_COOKIE, await signSession(session), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
