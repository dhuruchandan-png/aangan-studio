// Gives the sample enquiries a believable email trail: full email bodies, most designers acting from the email's buttons,
// callback reminders and daily digests. Sample rows only (simulated = true). Safe to re-run: it skips once done.
import { rawQuery } from '../lib/db';
import { button, card, emailShell, he, label } from '../lib/notify/email-shell';

const BASE = process.env.APP_BASE_URL || 'https://aangan-studio-one.vercel.app';
const q = async (s: string, p: unknown[] = []) => (await rawQuery(s, p)).rows as any[];

function handoffHtml(subject: string, who: string, ref: string, line: string) {
  return emailShell({
    preheader: line, heading: subject,
    body: card(`${label('Brief')}<p style="margin:0 0 8px">${he(line)}</p><p style="margin:0;color:#6B6157">Reference <b>${he(ref)}</b>. Please accept so the studio knows you have it.</p>`)
      + button('Accept this lead', `${BASE}/me/lead/${ref}`) + button('Open the full brief', `${BASE}/me/lead/${ref}`, 'ghost'),
  });
}

async function main() {
  const done = await q("select 1 from notifications where simulated and kind = 'digest' limit 1");
  if (done.length) { console.log('Sample email trail already enriched.'); process.exit(0); }

  const hand = await q(`select n.id, n.payload, e.ref, e.caller_name, e.locality, e.property_type, n.recipient_id, n.sent_at from notifications n join enquiries e on e.id = n.enquiry_id where n.simulated and n.kind = 'handoff' order by n.sent_at`);
  let i = 0;
  for (const h of hand) {
    const subject = h.payload?.subject ?? `New enquiry · ${h.locality ?? ''}`;
    const line = `${h.caller_name ?? 'A caller'} called about ${[h.property_type, h.locality].filter(Boolean).join(' in ') || 'a project'}. The assistant has already asked the questions; nothing needs repeating.`;
    const via = i % 3 === 2 ? 'dashboard' : 'email';
    const payload = { ...h.payload, to: h.payload?.to ?? null, html: handoffHtml(subject, h.caller_name ?? 'Caller', h.ref, line), text: line };
    await q(`update notifications set payload = $2::jsonb, acted_via = case when acted_at is null then null else $3 end where id = $1`, [h.id, JSON.stringify(payload), via]);
    await q(`update actions_log set via = $3 where enquiry_id = (select enquiry_id from notifications where id = $1) and action = 'accept' and actor_type = 'designer'`, [h.id, via, via]).catch(() => undefined);
    i++;
  }

  // callback reminders: one hour before each logged callback
  const cb = await q(`select a.enquiry_id, a.at, a.actor_id, e.ref, e.caller_name, e.locality from actions_log a join enquiries e on e.id = a.enquiry_id where e.simulated and a.action = 'called_back' and a.actor_id is not null`);
  let j = 0;
  for (const c of cb) {
    const sent = new Date(new Date(c.at).getTime() - 55 * 60_000), subject = `Callback due · ${c.caller_name ?? 'Caller'} · ${c.locality ?? ''}`.trim();
    const line = `You promised ${c.caller_name ?? 'the caller'} a call back. A quick call now keeps the promise.`;
    const html = emailShell({ preheader: line, heading: subject, body: card(`${label('Callback due')}<p style="margin:0">${he(line)}</p>`) + button('Mark as called back', `${BASE}/me/lead/${c.ref}`) });
    await q(`insert into notifications (recipient_type, recipient_id, enquiry_id, channel, kind, payload, sent_at, delivered, simulated, acted_at, action, acted_via) values ('designer', $1, $2, 'email', 'callback_reminder', $3::jsonb, $4, true, true, $5, 'called_back', $6)`,
      [c.actor_id, c.enquiry_id, JSON.stringify({ subject, html, text: line, sample: true }), sent.toISOString(), c.at, j % 2 ? 'dashboard' : 'email']);
    j++;
  }

  // daily digests
  const ds = await q(`select distinct d.id, d.name from designers d join enquiries e on e.assigned_designer_id = d.id where e.simulated and d.active order by d.name`);
  const last = (await q(`select max(first_contact_at) m from enquiries where simulated`))[0].m as string;
  for (const d of ds) for (const back of [0, 1]) {
    const at = new Date(new Date(last).getTime() - back * 86_400_000); at.setUTCHours(4, 0, 0, 0);
    const subject = `Your day · ${d.name.split(' ')[0]}`;
    const line = 'The leads waiting for you and the callbacks due today, in one email.';
    const html = emailShell({ preheader: line, heading: subject, body: card(`${label('Your day')}<p style="margin:0">${he(line)}</p>`) + button('Open my desk', `${BASE}/me`) });
    await q(`insert into notifications (recipient_type, recipient_id, channel, kind, payload, sent_at, delivered, simulated) values ('designer', $1, 'email', 'digest', $2::jsonb, $3, true, true)`, [d.id, JSON.stringify({ subject, html, text: line, sample: true }), at.toISOString()]);
  }
  console.log(`Enriched ${hand.length} handoffs, added ${cb.length} callback reminders and ${ds.length * 2} digests.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
