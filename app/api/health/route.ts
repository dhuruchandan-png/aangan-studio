import { isAuthed, unauthorized } from '@/lib/auth';
import { env, envBool } from '@/lib/env';

export const runtime = 'nodejs';

/** Which integrations are configured (booleans only, never values). Drives the setup checklist on The Courtyard. */
export async function GET(req: Request) {
  if (!(await isAuthed(req))) return unauthorized();
  const has = (k: string) => !!env(k);
  return Response.json({
    database: has('DATABASE_URL'), hubspot: has('HUBSPOT_ACCESS_TOKEN'), gemini: has('GEMINI_API_KEY'),
    inboxes: has('NIKHIL_EMAIL') && has('FRONTDESK_EMAIL'),
    vaani: has('VAANI_WEBHOOK_SECRET'), resend: has('RESEND_API_KEY'), email_test_mode: envBool('EMAIL_TEST_MODE', true), cron: has('CRON_SECRET'),
    links: has('LINK_SIGNING_SECRET'), costs: has('COST_VAANI_PER_MIN_INR') && has('COST_GEMINI_INPUT_PER_1M_INR'),
  });
}
