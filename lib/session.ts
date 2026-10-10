// Signed session cookie. Edge-safe (Web Crypto only), so middleware and route handlers share it.
// Two roles: 'admin' (Nikhil, front desk, the senior person: sees everything) and 'designer' (sees only their own leads).
export const SESSION_COOKIE = 'aangan_session';
export interface Session { r: 'admin' | 'designer'; d?: string; n: string; x: number }

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
async function key(): Promise<CryptoKey> {
  const secret = process.env.LINK_SIGNING_SECRET ?? '';
  if (!secret) throw new Error('LINK_SIGNING_SECRET is not set');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(s: Omit<Session, 'x'>, ttlDays = 30): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...s, x: Date.now() + ttlDays * 86_400_000 })));
  const sig = await crypto.subtle.sign('HMAC', await key(), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    return s.x > Date.now() && (s.r === 'admin' || (s.r === 'designer' && !!s.d)) ? s : null;
  } catch { return null; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cookieVal = (cookie: string | null, name: string): string | null => {
  const m = (cookie ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
};

export async function sessionFromCookieHeader(cookie: string | null): Promise<Session | null> {
  const real = await verifySession(cookieVal(cookie, SESSION_COOKIE)).catch(() => null);
  if (real) return real;
  // DEMO_OPEN: no sign-in. "View as" an employee when one is picked, otherwise a guest reviewer with admin view.
  if (process.env.DEMO_OPEN === 'true') {
    const as = cookieVal(cookie, 'aangan_as');
    if (as && UUID.test(as)) return { r: 'designer', d: as, n: 'Viewing as employee', x: Date.now() + 3_600_000 };
    return { r: 'admin', n: 'Guest reviewer', x: Date.now() + 3_600_000 };
  }
  return null;
}
export const sessionFromRequest = (req: Request): Promise<Session | null> => sessionFromCookieHeader(req.headers.get('cookie'));
