// Vaani (api.vaanivoice.ai) adapter: webhook events + API → CallRecord. Everything downstream uses CallRecord only.
//
// What Vaani actually sends (from docs.vaanivoice.ai/guides/webhook-setup):
//   several events per call: call_started, call_ended, call_postprocessing, ...  (no signature is documented)
//   call_postprocessing = { event, call_id, timestamp, data: { room_name, call_id, call_duration (MILLISECONDS), end_reason,
//                           summary, entities, dispositions, recording_url, transcript: "[hh:mm:ss] AGENT: ...\n\n[hh:mm:ss] USER: ..." } }
// It carries neither the caller's number nor the start time, so we also remember the earlier call_started / call_ended events.
//
// SECURITY: the webhook is only a nudge ("look at call X"). We (1) require our secret in the URL (?secret=…), then (2) confirm
// the call exists by asking Vaani's own API with our key, so a forged webhook cannot inject a call that never happened.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env';
import { normalizePhone } from '../pipeline/clean';
import type { CallRecord, Speaker, Turn } from '../types';

const SIG_HEADERS = ['x-vaaniyantra-signature', 'x-vaani-signature', 'x-signature', 'x-hub-signature-256'];
const safeEq = (a: string, b: string): boolean => { const ba = Buffer.from(a), bb = Buffer.from(b); return ba.length === bb.length && timingSafeEqual(ba, bb); };

/** Secret in the URL (Vaani documents no signing), or an HMAC header if the platform ever adds one. */
export function verifyVaaniSignature(rawBody: string, headers: Headers, url: URL): boolean {
  const secret = env('VAANI_WEBHOOK_SECRET');
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  for (const h of SIG_HEADERS) { const v = headers.get(h); if (v && safeEq(v.replace(/^sha256=/i, '').trim().toLowerCase(), expected)) return true; }
  const shared = headers.get('x-webhook-secret') ?? url.searchParams.get('secret');
  return !!shared && safeEq(shared, secret);
}

export const apiBase = (): string => (env('VAANI_API_BASE') || 'https://api.vaanivoice.ai/api').replace(/\/$/, '');
const apiHeaders = () => ({ 'X-API-Key': env('VAANI_API_KEY'), accept: 'application/json' });

// ------------------------------------------------------------------ event helpers
export const eventOf = (b: any): string => String(b?.event ?? b?.type ?? '').toLowerCase(); // eslint-disable-line @typescript-eslint/no-explicit-any
export const callIdOf = (b: any): string | undefined => b?.call_id ?? b?.data?.call_id ?? b?.data?.room_name ?? b?.room_name; // eslint-disable-line @typescript-eslint/no-explicit-any

const roleOf = (r: unknown): Speaker | null => {
  const s = String(r ?? '').toLowerCase();
  if (/agent|assistant|bot|\bai\b|system|model/.test(s)) return 'agent';
  if (/user|caller|customer|human|client|patient|lead/.test(s)) return 'caller';
  return null;
};

/** "[13:33:14] AGENT: Hi…\n\n[13:33:19] USER: Yeah…"  or  "AGENT: …\n\n USER: …"  or an array of {role,text}. */
export function parseTranscript(t: unknown): Turn[] {
  if (!t) return [];
  if (Array.isArray(t)) {
    return t.flatMap((x: any): Turn[] => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (typeof x === 'string') return parseTranscript(x);
      const sp = roleOf(x?.role ?? x?.speaker ?? x?.from);
      const text = x?.text ?? x?.content ?? x?.message;
      return sp && typeof text === 'string' && text.trim() ? [{ speaker: sp, text: text.trim() }] : [];
    });
  }
  if (typeof t !== 'string') return [];
  const turns: Turn[] = [];
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:\[(\d{1,2}):(\d{2}):(\d{2})\]\s*)?(agent|assistant|bot|ai|caller|user|customer|human|client)\s*[:\-]\s*(.*)$/i);
    if (m) {
      const sec = m[1] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined;
      turns.push({ speaker: roleOf(m[4])!, text: m[5].trim(), t: sec });
    } else if (line.trim() && turns.length) turns[turns.length - 1].text += ' ' + line.trim();
  }
  return turns.filter((x) => x.text);
}

// ------------------------------------------------------------------ building the CallRecord
export interface VaaniEvents {
  started?: { phone_number?: string; at: string };
  ended?: { call_duration?: number; at: string };
  pickedUp?: { at: string };
}
export interface VaaniDetail { transcription?: string; summary?: string; entity?: unknown; call_eval_tag?: string | null }

/** Pure: assemble a CallRecord from the webhook body, Vaani's own detail record, and the earlier lifecycle events. */
export function recordFromParts(body: any, detail: VaaniDetail | null, ev: VaaniEvents, base = apiBase()): { record: CallRecord | null; reason?: string } { // eslint-disable-line @typescript-eslint/no-explicit-any
  const id = callIdOf(body);
  if (!id) return { record: null, reason: 'no call id in payload' };
  if (/^outbound/i.test(id)) return { record: null, reason: 'outbound call ignored (this app only handles inbound enquiries)' };
  const d = body?.data ?? body;

  const apiText = detail?.transcription && !/not available/i.test(detail.transcription) ? detail.transcription : null;
  const turns = parseTranscript(apiText ?? d?.transcript);

  const durMsRaw = typeof d?.call_duration === 'number' ? d.call_duration : null;
  const durationSec = durMsRaw != null ? durMsRaw / 1000 : typeof ev.ended?.call_duration === 'number' ? ev.ended.call_duration : null;
  const endedAt = ev.ended?.at ?? (body?.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString());
  const startedAt = durationSec != null ? new Date(new Date(endedAt).getTime() - durationSec * 1000).toISOString() : endedAt;

  // Time-to-first-word: Vaani transcript lines are stamped in UTC clock time, so compare against the start time.
  let ring: number | null = null;
  const firstAgent = turns.find((t) => t.speaker === 'agent' && t.t !== undefined);
  if (firstAgent?.t !== undefined) {
    const s = new Date(startedAt);
    const startSec = s.getUTCHours() * 3600 + s.getUTCMinutes() * 60 + s.getUTCSeconds();
    let diff = firstAgent.t - startSec;
    if (diff < -43_200) diff += 86_400;
    if (diff >= 0 && diff <= 60) ring = diff;
  }
  if (ring === null && ev.started && ev.pickedUp) {
    const diff = (new Date(ev.pickedUp.at).getTime() - new Date(ev.started.at).getTime()) / 1000;
    if (diff >= 0 && diff <= 60) ring = diff;
  }

  return {
    record: {
      provider: 'vaani', providerCallId: id, channel: 'phone',
      callerNumber: normalizePhone(ev.started?.phone_number), startedAt,
      answeredAt: ring !== null ? new Date(new Date(startedAt).getTime() + ring * 1000).toISOString() : null,
      endedAt, ringToAnswerSec: ring, durationSec, answered: turns.length > 0 || (durationSec ?? 0) > 0,
      answeredBy: 'agent', turns,
      recordingUrl: `${base}/stream/${encodeURIComponent(id)}`, // proxied by /api/rec with our key; never the webhook's own URL
      summary: detail?.summary ?? d?.summary ?? null, raw: body,
    },
  };
}

// ------------------------------------------------------------------ Vaani API (read-only)
/** GET /call_details/{call_id}. null = Vaani does not know this call (or the API is down). */
export async function fetchCallDetail(id: string): Promise<VaaniDetail | null> {
  if (!env('VAANI_API_KEY')) return null;
  try {
    const res = await fetch(`${apiBase()}/call_details/${encodeURIComponent(id)}`, { headers: apiHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as VaaniDetail;
  } catch { return null; }
}
