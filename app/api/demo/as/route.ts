import { NextResponse } from 'next/server';
import { AS_COOKIE, demoOpen } from '@/lib/demo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Demo only: "view the dashboard as" an employee (or go back to the studio view). Never active once DEMO_OPEN is off. */
export async function POST(req: Request) {
  if (!demoOpen()) return NextResponse.json({ error: 'Not available' }, { status: 404 });
  const form = await req.formData();
  const who = String(form.get('designer') ?? '');
  const res = new NextResponse(null, { status: 303, headers: { location: UUID.test(who) ? '/me' : '/team' } });
  if (UUID.test(who)) res.cookies.set(AS_COOKIE, who, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 6 });
  else res.cookies.set(AS_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
