// npm run test:core · pure-logic checks: time rules, masking, quotes, locality, verdict table, links, adapter, templates.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
process.env.LINK_SIGNING_SECRET = 'test-secret-for-core-tests';
process.env.VAANI_WEBHOOK_SECRET = 'whsec_test';
process.env.APP_BASE_URL = 'https://aangan.example';

import { PHONE_FIXTURES } from '../lib/fixtures';
import { signToken, verifyToken } from '../lib/notify/links';
import { sessionFromCookieHeader, signSession, verifySession } from '../lib/session';
import { buildIcs } from '../lib/notify/ics';
import { emailEscalation, emailHandoff, emailUnassigned } from '../lib/notify/templates';
import { cleanTurns, maskSensitive, normalizePhone, isThinCall } from '../lib/pipeline/clean';
import { computeVerdict, decide, quoteInCaller } from '../lib/pipeline/decide';
import { classifyLocality } from '../lib/rules/service-area';
import { activeElapsedMin, callbackPromise, fmtTime, isAfterHours, istDate, istParts } from '../lib/time';
import { callIdOf, eventOf, parseTranscript, recordFromParts, verifyVaaniSignature } from '../lib/voice/vaani';
import type { Criterion, CriterionStatus, RawExtraction, Turn } from '../lib/types';
import type { LeadCtx } from '../lib/leads';

let n = 0;
const queue: Promise<void>[] = [];
const ok = (name: string, fn: () => void | Promise<void>) => { queue.push((async () => { try { await fn(); n++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', (e as Error).message); process.exitCode = 1; } })()); };
console.log('\nCore logic');

// 2026-10-07 is a Wednesday; 10 = Saturday, 11 = Sunday, 12 = Monday.
const at = (d: number, h: number, m = 0) => istDate(2026, 10, d, h, m);

ok('IST parts round-trip', () => { const p = istParts(at(7, 23, 47)); assert.deepEqual([p.d, p.h, p.min, p.dow], [7, 23, 47, 3]); assert.equal(fmtTime(at(7, 9, 5)), '09:05'); });

ok('after-hours: before 10, from 19:00, and all of Sunday', () => {
  assert.equal(isAfterHours(at(7, 9, 59)), true); assert.equal(isAfterHours(at(7, 10)), false);
  assert.equal(isAfterHours(at(10, 18, 59)), false); assert.equal(isAfterHours(at(7, 19)), true); assert.equal(isAfterHours(at(11, 12)), true);
});

ok('callback promise: 1 hour in hours, 11am next working morning after hours', () => {
  const a = callbackPromise(at(7, 15));
  assert.equal(a.kind, 'in_hours'); assert.equal(a.dueAt.getTime(), at(7, 16).getTime());
  assert.equal(callbackPromise(at(7, 23, 47)).dueAt.getTime(), at(8, 11).getTime());
  assert.equal(callbackPromise(at(10, 20)).dueAt.getTime(), at(12, 11).getTime(), 'Saturday night → Monday');
  assert.equal(callbackPromise(at(11, 12)).dueAt.getTime(), at(12, 11).getTime(), 'Sunday → Monday');
  assert.equal(callbackPromise(at(7, 8)).dueAt.getTime(), at(7, 11).getTime(), 'early morning → same day 11am');
  assert.equal(callbackPromise(at(7, 23)).spoken, 'by 11am');
});

ok('ladder clock pauses overnight and on Sundays', () => {
  assert.equal(activeElapsedMin(at(7, 18, 50), at(8, 9, 40)), 20);
  assert.equal(activeElapsedMin(at(10, 23), at(12, 9, 45)), 15);
  assert.equal(activeElapsedMin(at(7, 12), at(7, 12, 12)), 12);
  assert.equal(activeElapsedMin(at(7, 22), at(7, 23, 30), { ignoreHours: true }), 90, 'simulated enquiries ignore hours');
});

ok('service area: listed, adjoining, outside, unknown', () => {
  assert.equal(classifyLocality('Kothrud (Dahanukar Colony)').cls, 'in');
  assert.equal(classifyLocality('Pimple Saudagar').cls, 'in');
  assert.equal(classifyLocality('NIBM Road').cls, 'in');
  assert.equal(classifyLocality('Kharadi').cls, 'adjoining');
  assert.equal(classifyLocality('Nanded City').cls, 'adjoining');
  assert.equal(classifyLocality('Nashik').cls, 'out');
  assert.equal(classifyLocality('Talegaon Dabhade').cls, 'out');
  assert.equal(classifyLocality('Pune').cls, 'unknown');
  assert.equal(classifyLocality(null).cls, 'unknown');
});

const crit = (...s: CriterionStatus[]): Criterion[] =>
  (['real_project', 'service_area', 'timeline', 'budget', 'decision_maker'] as const).map((key, i) => ({ key, status: s[i], evidence_quote: null, reason: '' }));

ok('verdict table follows qualified.md exactly', () => {
  assert.equal(computeVerdict('new_enquiry', crit('pass', 'pass', 'pass', 'pass', 'pass')).verdict, 'qualified');
  assert.equal(computeVerdict('new_enquiry', crit('pass', 'pass', 'pass', 'unclear', 'unclear')).verdict, 'qualified');
  assert.ok(computeVerdict('new_enquiry', crit('pass', 'pass', 'pass', 'unclear', 'unclear')).notes.length === 1, 'unclear decision-maker is noted');
  assert.equal(computeVerdict('new_enquiry', crit('pass', 'pass', 'unclear', 'pass', 'pass')).verdict, 'unsure');
  assert.equal(computeVerdict('new_enquiry', crit('unclear', 'pass', 'pass', 'pass', 'pass')).verdict, 'unsure');
  assert.equal(computeVerdict('new_enquiry', crit('pass', 'fail', 'pass', 'pass', 'pass')).verdict, 'not_a_fit');
  assert.equal(computeVerdict('new_enquiry', crit('pass', 'pass', 'pass', 'fail', 'pass')).verdict, 'not_a_fit', 'a failed budget is a fail');
  assert.equal(computeVerdict('new_enquiry', crit('pass', 'unclear', 'fail', 'unclear', 'unclear')).verdict, 'not_a_fit', 'fail beats unclear');
  assert.equal(computeVerdict('existing_client_escalation', crit('pass', 'pass', 'pass', 'pass', 'pass')).verdict, 'escalate');
  assert.equal(computeVerdict('other', crit('fail', 'fail', 'fail', 'fail', 'fail')).verdict, 'other');
});

const T = (speaker: 'agent' | 'caller', text: string): Turn => ({ speaker, text });
const turns = [T('agent', 'Good morning, Aangan Studio.'), T('caller', "Hi, I'm Priya. We want to redo the whole flat — kitchen, living room.")];

ok('evidence quotes must be the caller\'s own words', () => {
  assert.ok(quoteInCaller("We want to redo the whole flat — kitchen, living room", turns));
  assert.ok(quoteInCaller('We want to redo the whole flat … kitchen, living room', turns), 'ellipsis fragments');
  assert.ok(quoteInCaller('i’m priya', turns), 'curly apostrophe + case');
  assert.ok(!quoteInCaller('Good morning, Aangan Studio', turns), 'agent words do not count');
  assert.ok(!quoteInCaller('We want to redo the entire flat', turns), 'paraphrase is rejected');
  assert.ok(!quoteInCaller(null, turns));
});

ok('masking hides card / Aadhaar / account numbers but keeps phone numbers', () => {
  assert.ok(maskSensitive('my aadhaar is 1234 5678 9012').includes('[masked number]'));
  assert.ok(maskSensitive('card 4111 1111 1111 1111 expiry').includes('[masked number]'));
  assert.ok(maskSensitive('account number 123456789012 ifsc').includes('[masked number]'));
  assert.ok(maskSensitive('PAN ABCDE1234F').includes('[masked id]'));
  for (const ph of ['+91 98765 43210', '9876543210', '+919876543210']) assert.equal(maskSensitive(`call ${ph} please`), `call ${ph} please`);
  assert.equal(normalizePhone('098765 43210'), '+919876543210');
  assert.equal(normalizePhone('+91 98765-43210'), '+919876543210');
});

ok('thin (dropped) calls are detected; merged turns collapse', () => {
  assert.ok(isThinCall([T('agent', 'Hello'), T('caller', 'Hi, I wanted to inquire about —')]));
  assert.ok(!isThinCall(turns));
  assert.equal(cleanTurns([T('caller', 'a'), T('caller', 'b'), T('agent', 'c')]).length, 2);
});

const raw = (over: Partial<RawExtraction> & { fields?: Partial<RawExtraction['fields']> } = {}): RawExtraction => ({
  fields: { name: 'Priya', locality: 'Baner', in_service_area: 'yes', property_type: 'apartment', size_bhk: '2BHK', carpet_sqft: 900, scope: 'full', rooms: [], current_state: null, timeline_text: null, timeline_date_estimate: null, decision_maker: 'unclear', budget_volunteered: null, source: null, referral_name: null, language: 'English', callback_preference: null, callback_number: null, ...over.fields },
  criteria: crit('pass', 'pass', 'pass', 'unclear', 'unclear').map((c) => ({ ...c, evidence_quote: c.status === 'pass' ? 'redo the whole flat' : null })),
  category: 'new_enquiry', suggested_verdict: 'qualified', handoff_note: '', still_unknown: [], caller_mood: 'calm', price_asked: false, mentions_prior_contact: false, existing_client: null, ...over,
});
const callDate = new Date('2026-09-10T10:00:00+05:30');
const callerT = [T('caller', 'I want to redo the whole flat in Baner. We need it finished by 20 September.')];

ok('decide(): an unquotable "pass" is downgraded to unclear (so it can never reach a designer on the model\'s word alone)', () => {
  const r = raw(); r.criteria[0].evidence_quote = 'a quote the caller never said';
  const d = decide({ raw: r, turns: callerT, callDate });
  assert.equal(d.criteria[0].status, 'unclear'); assert.equal(d.quotes_verified, false); assert.equal(d.final_verdict, 'unsure');
});
ok('decide(): finish date under 6 weeks fails the timeline', () => {
  const r = raw({ fields: { timeline_text: 'finished by 20 September', timeline_date_estimate: '2026-09-20' } as any });
  const d = decide({ raw: r, turns: callerT, callDate });
  assert.equal(d.criteria[2].status, 'fail'); assert.equal(d.final_verdict, 'not_a_fit');
});
ok('decide(): an implausible (past) date from the model is ignored, not trusted', () => {
  const r = raw({ fields: { timeline_text: 'finished by 20 September', timeline_date_estimate: '2025-09-20' } as any });
  const d = decide({ raw: r, turns: callerT, callDate });
  assert.equal(d.criteria[2].status, 'pass'); assert.ok(d.notes.some((x) => /implausible/.test(x)));
});
ok('decide(): commercial space under 500 sq ft becomes "check with designer" (Unsure)', () => {
  const r = raw({ fields: { property_type: 'office', carpet_sqft: 300 } as any });
  const d = decide({ raw: r, turns: callerT, callDate });
  assert.equal(d.final_verdict, 'unsure'); assert.ok(d.notes.some((x) => /rule to confirm with Nikhil/.test(x)));
});
ok('decide(): an adjoining Pune area is accepted but flagged', () => {
  const t = [T('caller', 'I want to redo the whole flat in Kharadi.')];
  const r = raw({ fields: { locality: 'Kharadi' } as any }); r.criteria[1].evidence_quote = 'Kharadi';
  const d = decide({ raw: r, turns: t, callDate });
  assert.equal(d.final_verdict, 'qualified'); assert.ok(d.adjoining_area); assert.ok(d.notes.some((x) => /adjoining/.test(x)));
});
ok('decide(): a locality outside Pune fails even if the model said pass', () => {
  const t = [T('caller', 'I want to redo the whole flat in Nashik.')];
  const r = raw({ fields: { locality: 'Nashik' } as any });
  assert.equal(decide({ raw: r, turns: t, callDate }).final_verdict, 'not_a_fit');
});
ok('decide(): repeat or frustrated callers are PRIORITY; unqualified ones are not', () => {
  const hist = { priorEnquiryAt: '2026-09-07T15:00:00+05:30', priorRef: 'AG-0099', priorStatus: 'routed', existingProject: false };
  assert.equal(decide({ raw: raw(), turns: callerT, callDate, history: hist }).priority, true);
  assert.equal(decide({ raw: raw({ caller_mood: 'frustrated' }), turns: callerT, callDate }).priority, true);
  assert.equal(decide({ raw: raw(), turns: callerT, callDate }).priority, false);
});
ok('decide(): the code verdict wins and the mismatch is logged', () => {
  const d = decide({ raw: raw({ suggested_verdict: 'not_a_fit' }), turns: callerT, callDate });
  assert.equal(d.final_verdict, 'qualified'); assert.equal(d.verdict_mismatch, true);
});

ok('fixtures: 20 phone calls parsed; T08 missed; T17 has two calls; WhatsApp/web are kept but not routed', () => {
  assert.equal(PHONE_FIXTURES.length, 20);
  assert.equal(PHONE_FIXTURES.find((f) => f.id === 'T08')!.missed, true);
  assert.equal(PHONE_FIXTURES.find((f) => f.id === 'T17')!.calls.length, 2);
  assert.ok(PHONE_FIXTURES.filter((f) => !f.missed).every((f) => f.calls.every((c) => c.turns.length >= 2 && c.turns.some((t) => t.speaker === 'caller'))));
});

ok('sign-in tokens and sessions: signed, tamper-proof, expiring, role-checked', async () => {
  const t = signToken({ d: 'des-1', n: 'Priya', a: 'login' }, 20 / 1440);
  assert.equal(verifyToken(t)!.d, 'des-1');
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ d: 'des-2', a: 'login', x: Date.now() + 1e9 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${sig}`), null);
  assert.equal(verifyToken(`${body}.AAAA`), null);
  assert.equal(verifyToken(signToken({ d: 'des-1', a: 'login' }, -1)), null, 'expired');
  const sess = await signSession({ r: 'designer', d: 'des-1', n: 'Priya' });
  const back = await verifySession(sess);
  assert.equal(back?.r, 'designer'); assert.equal(back?.d, 'des-1');
  const [sb, ss] = sess.split('.');
  const adminForged = Buffer.from(JSON.stringify({ r: 'admin', n: 'x', x: Date.now() + 1e9 })).toString('base64url');
  assert.equal(await verifySession(`${adminForged}.${ss}`), null, 'a designer cannot upgrade themselves to admin');
  assert.equal(await verifySession(`${sb}.AAAA`), null);
  assert.equal(await verifySession(await signSession({ r: 'admin', n: 'Studio' }, -1)), null, 'expired session');
  assert.equal(await verifySession(await signSession({ r: 'designer', n: 'no id' })), null, 'a designer session needs an id');
  assert.equal(await sessionFromCookieHeader(`a=b; aangan_session=${encodeURIComponent(sess)}`).then((x) => x?.d), 'des-1');
});

// The exact example from Vaani's docs (guides/webhook-setup), so the adapter is tested against the real shape.
const VAANI_POSTPROCESSING = {
  event: 'call_postprocessing', call_id: 'inbound-1784899978-36cec598', timestamp: '2026-07-24T13:34:22.278854+00:00',
  data: {
    room_name: 'inbound-1784899978-36cec598', call_id: 'inbound-1784899978-36cec598', call_duration: 55150.02, end_reason: 'Call ended',
    summary: 'The user called to have their name recorded.', entities: { name: 'Ayush Awasthi' }, dispositions: { acas: 'Name Collected' },
    recording_url: 'https://uat.vaaniresearch.com/api/stream/inbound-1784899978-36cec598',
    transcript: "[13:33:14] AGENT: Hi! you have reached our customer service.\n\n[13:33:19] USER: Yeah. How are you? I have a 3BHK in Baner.\n\n[13:33:31] AGENT: Great, how can I help?\n\n[13:33:33] USER: Can you take down my name?",
  },
};

ok('Vaani webhook: the secret in the URL is required (Vaani documents no signature); HMAC and header forms also work', () => {
  const body = JSON.stringify(VAANI_POSTPROCESSING);
  const url = (q = '') => new URL('https://aangan.example/api/voice/webhook' + q);
  assert.ok(verifyVaaniSignature(body, new Headers(), url('?secret=whsec_test')), 'secret in the URL');
  assert.ok(!verifyVaaniSignature(body, new Headers(), url('?secret=wrong')));
  assert.ok(!verifyVaaniSignature(body, new Headers(), url()), 'no secret at all');
  assert.ok(verifyVaaniSignature(body, new Headers({ 'x-webhook-secret': 'whsec_test' }), url()));
  const sig = createHmac('sha256', 'whsec_test').update(body).digest('hex');
  assert.ok(verifyVaaniSignature(body, new Headers({ 'x-signature': `sha256=${sig}` }), url()), 'HMAC, should Vaani add signing later');
  assert.ok(!verifyVaaniSignature(body, new Headers({ 'x-signature': 'sha256=deadbeef' }), url()));
});

ok('Vaani transcript: parses the timestamped AGENT:/USER: format, the plain format, and arrays', () => {
  const t = parseTranscript(VAANI_POSTPROCESSING.data.transcript);
  assert.equal(t.length, 4); assert.equal(t[0].speaker, 'agent'); assert.equal(t[1].speaker, 'caller');
  assert.equal(t[0].t, 13 * 3600 + 33 * 60 + 14); assert.ok(t[1].text.includes('3BHK in Baner'));
  const plain = parseTranscript('AGENT: Hello there\n\n USER: Hi, I need design\nfor my flat');
  assert.equal(plain.length, 2); assert.equal(plain[1].text, 'Hi, I need design for my flat');
  assert.equal(parseTranscript([{ role: 'assistant', text: 'Hello' }, { role: 'user', content: 'Hi' }]).length, 2);
  assert.equal(parseTranscript(null).length, 0);
});

ok('Vaani call record: caller number, times and recording come from OUR checks, not from the webhook body', () => {
  assert.equal(eventOf(VAANI_POSTPROCESSING), 'call_postprocessing'); assert.equal(callIdOf(VAANI_POSTPROCESSING), 'inbound-1784899978-36cec598');
  const ev = { started: { phone_number: '+91 98765 43210', at: '2026-07-24T13:33:13.000Z' }, ended: { call_duration: 55, at: '2026-07-24T13:34:08.000Z' } };
  const { record: r } = recordFromParts(VAANI_POSTPROCESSING, { transcription: 'AGENT: From the API\n\n USER: I have a villa in Aundh' }, ev, 'https://api.vaanivoice.ai/api');
  assert.ok(r); assert.equal(r!.providerCallId, 'inbound-1784899978-36cec598'); assert.equal(r!.callerNumber, '+919876543210');
  assert.equal(r!.durationSec, 55.15002, 'call_duration in the final event is MILLISECONDS'); assert.equal(r!.endedAt, '2026-07-24T13:34:08.000Z');
  assert.equal(new Date(r!.startedAt).toISOString(), new Date(new Date('2026-07-24T13:34:08.000Z').getTime() - 55150.02).toISOString());
  assert.equal(r!.turns[1].text, 'I have a villa in Aundh', "Vaani's own API transcript wins over the webhook's");
  assert.equal(r!.recordingUrl, 'https://api.vaanivoice.ai/api/stream/inbound-1784899978-36cec598', "never the webhook's (possibly forged) URL");
  assert.equal(r!.answeredBy, 'agent'); assert.equal(r!.answered, true);
  // when the API has not processed the call yet, fall back to the webhook's transcript
  const fb = recordFromParts(VAANI_POSTPROCESSING, { transcription: 'Transcript is not available for further evaluations.' }, ev).record!;
  assert.equal(fb.turns.length, 4);
  // time to first word, from the UTC-stamped transcript
  assert.equal(r!.ringToAnswerSec, null, 'API transcript has no timestamps, so no estimate is invented');
  assert.equal(fb.ringToAnswerSec, 2, 'first AGENT line at 13:33:14, call started at 13:33:12.85 (ended 13:34:08 minus 55.15 s)');
});

ok('Vaani: outbound calls and malformed bodies are ignored; a missing caller number is allowed', () => {
  assert.equal(recordFromParts({ event: 'call_postprocessing', call_id: 'outbound-1-abc', data: {} }, null, {}).record, null);
  assert.equal(recordFromParts({ event: 'call_postprocessing' }, null, {}).record, null);
  const r = recordFromParts(VAANI_POSTPROCESSING, null, {}).record!;
  assert.equal(r.callerNumber, null); assert.ok(r.turns.length === 4);
});

ok('calendar invite is valid-looking iCalendar', () => {
  const ics = buildIcs({ uid: 'x1', start: at(8, 15), summary: 'Consultation, Priya', description: 'Line 1\nLine 2', location: 'Baner, Pune' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.includes('BEGIN:VEVENT') && ics.includes('DTSTART:20261008T093000Z') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('Consultation\\, Priya'));
});

ok('handoff email carries the facts, one-tap links, and escapes HTML', () => {
  const lead = {
    id: 'e1', ref: 'AG-0142', callerNumber: '+919812345678', callerName: 'Priya <b>', callAt: at(7, 23, 47), afterHours: true, verdict: 'qualified', priority: true, priorityReason: 'Repeat caller',
    referral: 'Shruti Joshi', fields: { name: 'Priya', locality: 'Kothrud (Dahanukar Colony)', size_bhk: '3BHK', carpet_sqft: 1400, scope: 'full home', rooms: ['kitchen', 'living'], current_state: 'builder-finish flat', timeline_text: 'done by March', decision_maker: 'yes', source: 'referral' },
    stillUnknown: ['style preference'], notes: ['Area is adjoining Pune: confirm'], priceAsked: true, callbackDue: at(8, 11), note: 'Line one\nLine two',
  } as unknown as LeadCtx;
  const urls = { openUrl: 'https://aangan.example/me/lead/AG-0142' };
  const mail = emailHandoff(lead, urls);
  assert.ok(/call back by .*11:00/.test(mail.subject) && mail.subject.includes('⭐'), mail.subject);
  for (const must of ['Open the lead and accept', 'Ref AG-0142', 'after hours', 'PRIORITY', '~1,400 sq ft carpet', 'referral — Shruti Joshi', 'Still unknown: style preference', 'Asked about price', 'adjoining Pune', 'tel:+919812345678', 'https://aangan.example/me/lead/AG-0142'])
    assert.ok(mail.html.includes(must), `html is missing "${must}"`);
  assert.ok(mail.html.includes('Priya &lt;b&gt;') && !mail.html.includes('Priya <b>'), 'user text must be escaped');
  assert.ok(!/undefined|>null</.test(mail.html) && !/undefined/.test(mail.text));
  assert.ok(mail.text.includes('https://aangan.example/me/lead/AG-0142') && mail.text.includes('Line one'));
  const nudge = emailHandoff(lead, { ...urls, reminder: true });
  assert.ok(nudge.subject.startsWith('Still waiting') && nudge.html.includes('moves to the next designer'));
  const esc = emailEscalation(lead, { briefUrl: 'https://aangan.example/brief/AG-0142', repeat: 2 });
  assert.ok(esc.subject.includes('URGENT') && esc.subject.includes('reminder 2') && esc.html.includes('https://aangan.example/brief/AG-0142') && esc.html.includes('take ownership'));
  assert.ok(emailUnassigned(lead, 'Nobody accepted', 'https://aangan.example/brief/x').html.includes('Open and assign'));
  assert.ok(!/\/a\/|\/desk\//.test(mail.html + esc.html), 'emails must not contain anonymous action links');
});

Promise.all(queue).then(() => console.log(`\n${n} core checks passed.${process.exitCode ? ' (some failed)' : ''}`));
