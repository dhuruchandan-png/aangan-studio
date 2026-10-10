import { isAuthed, unauthorized } from '@/lib/auth';
import { runFixture, runPasted } from '@/lib/rehearsal';
import { loadLead } from '@/lib/leads';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAuthed(req))) return unauthorized();
  const b = await req.json().catch(() => ({}));
  try {
    const t0 = Date.now();
    const r = b.fixture ? await runFixture(String(b.fixture), { designerId: b.designerId || undefined }) : await runPasted(String(b.text ?? ''), { designerId: b.designerId || undefined });
    const lead = r.enquiryId ? await loadLead(r.enquiryId) : null;
    return Response.json({
      ...r, extraction: r.extraction ? { verdict: r.extraction.final_verdict, suggested: r.extraction.suggested_verdict, mismatch: r.extraction.verdict_mismatch, notes: r.extraction.notes, priority: r.extraction.priority, criteria: r.extraction.criteria, fields: r.extraction.fields, handoff_note: r.extraction.handoff_note } : null,
      callback_due: lead?.callbackDue, totalMs: Date.now() - t0,
    });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
