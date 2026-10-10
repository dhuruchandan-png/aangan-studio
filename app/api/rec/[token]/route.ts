import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { verifyToken } from '@/lib/notify/links';

export const runtime = 'nodejs';

/** Recordings are private: only reachable through a signed, expiring link. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = verifyToken(token);
  if (!p || p.a !== 'rec') return new Response('This recording link has expired.', { status: 403 });
  const { data: call } = await db().from('calls').select('recording_url').eq('id', p.d).maybeSingle();
  if (!call) return new Response('Not found', { status: 404 });

  if (!call.recording_url) return new Response('No recording for this call', { status: 404 });

  // Proxy from the provider so its URL (and API key) are never exposed to the browser.
  const upstream = call.recording_url;
  const sameHost = (() => { try { return !!env('VAANI_API_BASE') && new URL(upstream).host === new URL(env('VAANI_API_BASE')).host; } catch { return false; } })();
  const res = await fetch(upstream, { headers: sameHost || upstream.includes('/api/') ? { 'x-api-key': env('VAANI_API_KEY'), authorization: `Bearer ${env('VAANI_API_KEY')}`, range: req.headers.get('range') ?? '' } : {} });
  if (!res.ok && res.status !== 206) return new Response('Recording unavailable', { status: 502 });
  const h = new Headers();
  for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (res.headers.get(k)) h.set(k, res.headers.get(k)!);
  h.set('cache-control', 'private, no-store');
  return new Response(res.body, { status: res.status, headers: h });
}
