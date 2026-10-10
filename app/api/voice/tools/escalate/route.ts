import { db, must } from '@/lib/db';
import { secretOk } from '@/lib/auth';
import { loadLead } from '@/lib/leads';
import { normalizePhone } from '@/lib/pipeline/clean';
import { sendEscalation } from '@/lib/route';
import { limited } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * Optional mid-call tool: the agent calls this the moment an EXISTING client reports a problem, so the senior
 * alert goes out while the caller is still on the line. The enquiry is created here and the call that follows
 * merges into it (same number, within 15 minutes). If Vaani has no tools, the pipeline escalates after the call instead.
 */
export async function POST(req: Request) {
  if (limited(req, 'escalate', 30)) return Response.json({ error: 'rate limited' }, { status: 429 });
  if (!secretOk(req)) return Response.json({ error: 'bad secret' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const now = new Date();
  const number = normalizePhone(b.caller_number ?? b.from ?? b.phone);
  const ref = must(await db().rpc('next_enquiry_ref', { sim: false }), 'ref') as string;
  const note = [`Existing client: ${b.name ?? 'name not captured'}`, b.project ? `Project: ${b.project}` : null, b.designer_name ? `Designer: ${b.designer_name}` : null, b.issue ? `Issue: ${b.issue}` : null].filter(Boolean).join('\n');
  const enq = must(await db().from('enquiries').insert({
    ref, channel: 'phone', caller_number: number, caller_name: b.name ?? null,
    // back-dated so the call that follows (it started a few minutes ago) merges into this enquiry
    first_contact_at: new Date(now.getTime() - 10 * 60_000).toISOString(), last_contact_at: now.toISOString(),
    category: 'existing_client_escalation', verdict: 'escalate', verdict_source: 'code', status: 'routed', priority: true, priority_reason: 'Existing client, urgent',
    handoff_note: note, callback_due_at: new Date(now.getTime() + 15 * 60_000).toISOString(), extraction_pending: true,
  }).select('id').single(), 'insert escalation');
  const lead = (await loadLead(enq.id))!;
  lead.existingClient = { designer_name: b.designer_name ?? null, project: b.project ?? null };
  lead.note = note;
  await sendEscalation(lead, 0);
  return Response.json({ ok: true, ref, say: 'A senior person will call you back within 15 minutes.' });
}
