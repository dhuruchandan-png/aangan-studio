import { applyAction, type ActionName } from '@/lib/actions';
import { adminSession, unauthorized } from '@/lib/auth';
import { db } from '@/lib/db';
import { loadLead } from '@/lib/leads';

export const runtime = 'nodejs';

/** Dashboard actions (Nikhil acting from Brief Book) and compliance-flag resolution. */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const admin = await adminSession(req);
  if (!admin) return unauthorized();
  const { ref } = await params;
  const b = await req.json().catch(() => ({}));
  if (b.action === 'resolve_flag') {
    await db().from('compliance_flags').update({ resolved_by: 'Nikhil', resolved_at: new Date().toISOString() }).eq('id', b.flagId);
    return Response.json({ ok: true });
  }
  const lead = await loadLead(ref);
  if (!lead) return Response.json({ error: 'not found' }, { status: 404 });
  const r = await applyAction({ enquiry: ref, action: b.action as ActionName, via: 'dashboard', designerId: b.designerId ?? lead.assignedDesignerId, adminName: admin.n, payload: b.payload });
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
