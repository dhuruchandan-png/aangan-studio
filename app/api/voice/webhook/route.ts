import { after } from 'next/server';
import { db, rawQuery } from '@/lib/db';
import { limited } from '@/lib/ratelimit';
import { processCall } from '@/lib/pipeline/run';
import { callIdOf, eventOf, fetchCallDetail, recordFromParts, verifyVaaniSignature, type VaaniEvents } from '@/lib/voice/vaani';
import { env } from '@/lib/env';
import { runTickThrottled } from '@/lib/tick';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Earlier lifecycle events for the same call (Vaani's final event has no caller number or start time). */
async function eventsFor(callId: string): Promise<VaaniEvents> {
  const { rows } = await rawQuery(
    `select body, received_at from webhook_inbox where provider = 'vaani' and (body->>'room_name' = $1 or body->>'call_id' = $1 or body->'data'->>'room_name' = $1) order by received_at`,
    [callId],
  );
  const ev: VaaniEvents = {};
  for (const r of rows as { body: any; received_at: string }[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const e = eventOf(r.body), at = new Date(r.received_at).toISOString();
    if (e === 'call_started') ev.started = { phone_number: r.body.phone_number, at };
    else if (e === 'call_ended') ev.ended = { call_duration: r.body.call_duration, at };
    else if (e === 'user_picked_up_at') ev.pickedUp = { at };
  }
  return ev;
}

/**
 * STEP A · Receive. The secret in the URL is checked first; the body is stored; we answer 200 fast.
 * Only `call_postprocessing` creates an enquiry, and only after Vaani's own API confirms the call exists.
 */
export async function POST(req: Request) {
  if (limited(req, 'vaani-webhook', 240)) return Response.json({ error: 'rate limited' }, { status: 429 });
  const raw = await req.text();
  if (!verifyVaaniSignature(raw, req.headers, new URL(req.url))) return Response.json({ error: 'bad secret' }, { status: 401 });
  let body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { body = JSON.parse(raw); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const event = eventOf(body);
  const { data: inbox } = await db().from('webhook_inbox').insert({ provider: 'vaani', body, headers: { event } }).select('id').single();
  if (event !== 'call_postprocessing') return Response.json({ ok: true, event });

  after(async () => {
    const finish = (error: string | null) => db().from('webhook_inbox').update({ processed_at: new Date().toISOString(), error }).eq('id', inbox?.id);
    try {
      const id = callIdOf(body);
      if (!id) return void (await finish('no call id'));
      const detail = await fetchCallDetail(id);
      if (!detail && env('VAANI_API_KEY')) return void (await finish('ignored: Vaani does not know this call id'));
      const m = recordFromParts(body, detail, await eventsFor(id));
      if (!m.record) return void (await finish(m.reason ?? 'ignored'));
      const r = await processCall(m.record);
      await finish(r.deferred && !r.verdict ? 'deferred (dropped call or Gemini unavailable)' : null);
      await runTickThrottled().catch(() => undefined); // reminders and retries move on every finished call too
    } catch (e) { await finish((e as Error).message); }
  });
  return Response.json({ ok: true, event });
}
