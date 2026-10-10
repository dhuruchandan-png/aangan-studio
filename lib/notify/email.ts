import { env, envBool } from '../env';

export interface Attachment { filename: string; content: string /* base64 */; contentType?: string }
export interface EmailResult { ok: boolean; id?: string; error?: string; to: string; redirected: boolean }

/**
 * Sends via Resend. While EMAIL_TEST_MODE=true (default), every email goes to TEST_EMAIL
 * with the intended recipient shown at the top. Simulated sends always go to the test address.
 */
export async function sendEmail(o: {
  to: string | null | undefined; subject: string; html: string; text: string; attachments?: Attachment[]; simulated?: boolean;
}): Promise<EmailResult> {
  const testMode = envBool('EMAIL_TEST_MODE', true) || !!o.simulated;
  const testTo = env('TEST_EMAIL') || env('NIKHIL_EMAIL');
  const intended = o.to || '(no address on file)';
  const to = testMode ? testTo : o.to || '';
  if (!to) return { ok: false, error: testMode ? 'TEST_EMAIL not set' : 'No recipient address', to: '', redirected: testMode };
  if (!env('RESEND_API_KEY')) return { ok: false, error: 'RESEND_API_KEY not set', to, redirected: testMode };

  const banner = testMode ? `TEST MODE · intended for: ${intended}` : '';
  const html = testMode
    ? `<div style="background:#B8913F;color:#fff;font:12px/1.4 monospace;padding:6px 12px;text-align:center">${banner}</div>${o.html}`
    : o.html;
  const text = testMode ? `[${banner}]\n\n${o.text}` : o.text;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env('EMAIL_FROM') || 'Aangan Studio <onboarding@resend.dev>', to: [to], subject: testMode ? `[TEST] ${o.subject}` : o.subject, html, text,
        attachments: o.attachments?.map((a) => ({ filename: a.filename, content: a.content, content_type: a.contentType })),
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${j.message ?? JSON.stringify(j).slice(0, 200)}`, to, redirected: testMode };
    return { ok: true, id: j.id, to, redirected: testMode };
  } catch (e) {
    return { ok: false, error: (e as Error).message, to, redirected: testMode };
  }
}
