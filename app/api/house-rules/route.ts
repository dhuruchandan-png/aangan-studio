import { isAuthed, unauthorized } from '@/lib/auth';
import { approve, listVersions, saveDraft } from '@/lib/rules/store';

export const runtime = 'nodejs';

/** Gate 1. Saving creates a NEW draft version; nothing goes live until Nikhil approves that version. */
export async function POST(req: Request) {
  if (!(await isAuthed(req))) return unauthorized();
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === 'approve') {
      await approve(Number(b.version), String(b.by || 'Nikhil Deshpande').slice(0, 80));
      return Response.json({ ok: true });
    }
    if (b.action === 'save') {
      const r = b.rules ?? {};
      if (typeof r.script_text !== 'string' || !r.script_text.trim()) return Response.json({ error: 'The script cannot be empty.' }, { status: 400 });
      if (!r.service_area || !r.closing_lines || !r.config) return Response.json({ error: 'Service area, closing lines and callback config are all required.' }, { status: 400 });
      const v = await saveDraft({ script_text: r.script_text, never_say: (r.never_say ?? []).filter(Boolean), service_area: r.service_area, closing_lines: r.closing_lines, config: r.config, note: b.note });
      return Response.json({ ok: true, version: v.version });
    }
    return Response.json({ versions: (await listVersions()).length });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
