import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/notify/email';
import { createLoginLink } from '@/lib/notify/links';
import { emailShell, button } from '@/lib/notify/email-shell';
import { limited } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const adminEmails = () => [env('NIKHIL_EMAIL'), env('FRONTDESK_EMAIL'), env('ESCALATION_EMAIL')].map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Emails a one-time sign-in link. The answer is always the same, so nobody can probe who is on the roster. */
export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const next = String(form.get('next') ?? '');
  const done = () => new Response(null, { status: 303, headers: { location: `/login?sent=1` } });
  if (!email || !email.includes('@') || email.length > 200) return done();
  if (limited(req, 'signin', 6) || limited(new Request(req.url, { headers: { 'x-forwarded-for': `e:${email}` } }), 'signin-email', 3, 10 * 60_000)) return done();

  try {
    let who: Parameters<typeof createLoginLink>[0] | null = null;
    const { data: d } = await db().from('designers').select('id, name, active').ilike('email', email).eq('active', true).limit(1);
    if (d?.[0]) who = { kind: 'designer', designerId: d[0].id, name: d[0].name };
    else if (adminEmails().includes(email)) who = { kind: 'admin', email };
    if (who) {
      const link = await createLoginLink(who, next);
      const name = who.kind === 'designer' ? who.name.split(' ')[0] : 'there';
      await sendEmail({
        to: email, subject: 'Your Aangan sign-in link',
        html: emailShell({ preheader: 'Valid for 20 minutes.', heading: `Hi ${name}, sign in to Aangan`, body: `<p style="font:16px/1.5 Georgia,serif">Tap the button to open your dashboard. The link works once and expires in 20 minutes.</p><div style="padding:8px 0">${button('Sign in', link)}</div><p style="font:13px/1.5 Helvetica,Arial,sans-serif;color:#6B6157">If you didn't ask for this, ignore it. Nobody can sign in without this email.</p>`, footer: 'Aangan Studio · Pune' }),
        text: `Sign in to Aangan (works once, 20 minutes): ${link}\n\nIf you didn't ask for this, ignore this email.`,
      });
    }
  } catch (e) { console.error('sign-in link failed', (e as Error).message); }
  return done();
}
