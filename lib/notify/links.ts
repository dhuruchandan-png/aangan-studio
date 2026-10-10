// Signed, expiring, tamper-proof tokens. Used for sign-in links and short-lived recording links.
// token = base64url(json) . base64url(hmac-sha256).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '../db';
import { appBase, requireEnv } from '../env';

export type LinkAction = 'login' | 'rec';
export interface TokenPayload { d: string; n?: string; a: LinkAction; x: number }

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (body: string) => createHmac('sha256', requireEnv('LINK_SIGNING_SECRET')).update(body).digest();
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export function signToken(p: Omit<TokenPayload, 'x'>, ttlDays = 7): string {
  const body = b64(JSON.stringify({ ...p, x: Date.now() + ttlDays * 86_400_000 } satisfies TokenPayload));
  return `${body}.${b64(sign(body))}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  let got: Buffer;
  try { got = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    return p.x > Date.now() ? p : null;
  } catch { return null; }
}

/** One-time sign-in link, valid 20 minutes. `who` is a designer id, or an admin email. */
export async function createLoginLink(who: { kind: 'designer'; designerId: string; name: string } | { kind: 'admin'; email: string }, next?: string): Promise<string> {
  const token = signToken(who.kind === 'designer' ? { d: who.designerId, n: who.name, a: 'login' } : { d: 'admin', n: who.email, a: 'login' }, 20 / 1440);
  const p = verifyToken(token)!;
  await db().from('login_links').insert({ token_hash: hashToken(token), subject: who.kind === 'designer' ? `designer:${who.designerId}` : `admin:${who.email}`, expires_at: new Date(p.x).toISOString() });
  return `${appBase()}/auth/verify?t=${token}${next && next.startsWith('/') && !next.startsWith('//') ? `&next=${encodeURIComponent(next)}` : ''}`;
}

/** Single use: returns the payload once, then the link is dead. */
export async function consumeLoginLink(token: string): Promise<TokenPayload | null> {
  const p = verifyToken(token);
  if (!p || p.a !== 'login') return null;
  const { data } = await db().from('login_links').update({ used_at: new Date().toISOString() }).eq('token_hash', hashToken(token)).is('used_at', null).select('token_hash');
  return data?.length ? p : null;
}

/** Short-lived signed link to a recording (served by /api/rec/[token]). Generated only on signed-in pages. */
export const recordingLink = (callId: string, ttlHours = 1): string => `${appBase()}/api/rec/${signToken({ d: callId, a: 'rec' }, ttlHours / 24)}`;

/** Where emails point. Designers land in their own dashboard (they sign in if they have no session yet). */
export const leadUrl = (ref: string): string => `${appBase()}/me/lead/${ref}?via=email`;
export const myDashboardUrl = (): string => `${appBase()}/me?via=email`;
export const adminBriefUrl = (ref: string): string => `${appBase()}/brief/${ref}`;
