import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

// Public: the sign-in screens, and machine endpoints that verify their own secret/signature (Vaani, cron, recordings).
// /me/* is the designer dashboard (any signed-in user). Everything else is admin-only (Nikhil / front desk / senior).
const PUBLIC = ['/login', '/enter', '/auth/', '/api/auth/', '/api/voice/', '/api/cron/', '/api/tick', '/api/rec/', '/_next', '/favicon'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (process.env.DEMO_OPEN === 'true') return NextResponse.next(); // open dashboard for reviewers (see lib/demo.ts)
  if (PUBLIC.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p))) return NextResponse.next();

  let session = null;
  try { session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value); } catch { /* missing secret: treated as signed out */ }

  const isApi = pathname.startsWith('/api/');
  if (!session) {
    if (isApi) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const mine = pathname === '/me' || pathname.startsWith('/me/') || pathname.startsWith('/api/me/');
  if (session.r === 'designer' && !mine) {
    if (isApi) return NextResponse.json({ error: 'That is not part of your dashboard' }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = '/me';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (session.r === 'admin' && mine && !isApi) {
    const url = req.nextUrl.clone();
    url.pathname = '/roster'; // admins review designers from the roster, not by impersonating them
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
