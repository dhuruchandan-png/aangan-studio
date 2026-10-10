'use client';
import { useState } from 'react';
import { Label, Sheet, VerdictChip } from '@/components/ui';
import { fmtDateTime } from '@/lib/time';
import { SimTag } from './SimTag';
import type { DesignerOption, EnquiryRow } from './types';

interface Preview { title: string; channel: 'email'; subject?: string; html: string; text?: string; note?: string }

const label = (e: EnquiryRow): string => {
  const who = [e.caller_name ?? 'Caller', e.locality].filter(Boolean).join(' · ');
  return `${e.ref} · ${who} · ${e.verdict ?? 'reading'}${e.simulated ? ' · simulated' : ''} · ${fmtDateTime(e.first_contact_at)}`;
};

const MailIcon = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 4h12v8H2zM2 4l6 5 6-5" /></svg>;

export function PreviewTab({ enquiries, designers }: { enquiries: EnquiryRow[]; designers: DesignerOption[] }) {
  const [ref, setRef] = useState(enquiries[0]?.ref ?? '');
  const [designer, setDesigner] = useState('');
  const [items, setItems] = useState<Preview[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const picked = enquiries.find((e) => e.ref === ref);

  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const qs = new URLSearchParams({ ref });
      if (designer) qs.set('designer', designer);
      const res = await fetch(`/api/rehearsal/preview?${qs.toString()}`);
      const j = (await res.json().catch(() => null)) as Preview[] | { error?: string } | null;
      if (!res.ok || !Array.isArray(j)) { setItems(null); setErr((j && !Array.isArray(j) && j.error) || `Could not build the preview (${res.status}).`); }
      else setItems(j);
    } catch {
      setItems(null); setErr('Could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <Sheet>
        <div className="flex flex-wrap items-center gap-2"><Label>Notification preview</Label><SimTag text="Nothing is sent" /></div>
        <p className="mt-1 text-sm text-muted">See every email a lead can trigger, as the designer, front desk or Nikhil would receive it, without sending any of them.</p>
        {enquiries.length === 0 ? <p className="mt-3 text-sm text-muted">No enquiries yet. Replay a test call first, then come back here.</p> : (
          <div className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_auto] md:items-end">
            <div>
              <label htmlFor="pv-ref" className="annot">Enquiry</label>
              <select id="pv-ref" className="field mt-1" value={ref} onChange={(e) => setRef(e.target.value)}>
                {enquiries.map((e) => <option key={e.ref} value={e.ref}>{label(e)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pv-des" className="annot">As seen by</label>
              <select id="pv-des" className="field mt-1" value={designer} onChange={(e) => setDesigner(e.target.value)}>
                <option value="">The assigned designer</option>
                {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <button type="button" className="btn btn-primary" onClick={load} disabled={busy || !ref}>{busy ? 'Building…' : 'Show previews'}</button>
          </div>
        )}
        {picked && <div className="mt-2 flex items-center gap-2 text-xs text-muted"><VerdictChip verdict={picked.verdict} /></div>}
        <p aria-live="polite" role="status" className="mt-2 min-h-[1.25rem] text-sm text-alert">{err ?? ''}</p>
      </Sheet>

      {items && items.length === 0 && <Sheet><p className="text-sm text-muted">No messages to preview for this enquiry.</p></Sheet>}

      {items && items.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          {items.map((p, i) => (
            <section key={i} className="animate-settle" aria-label={p.title}>
              <div className="mb-1.5 flex items-start gap-2">
                <span className="mt-0.5 text-teak"><MailIcon /></span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{p.title}</h3>
                  <div className="annot !text-[10px]">Email</div>
                  {p.note && <p className="mt-0.5 text-xs text-muted">{p.note}</p>}
                </div>
              </div>
                <div className="overflow-hidden rounded border border-clay bg-paper">
                  <div className="border-b border-clay px-3 py-2 text-sm"><span className="annot mr-2">Subject</span><span className="font-medium">{p.subject ?? '(no subject)'}</span></div>
                  <iframe title={p.subject ?? p.title} sandbox="" srcDoc={p.html} className="h-[34rem] w-full bg-white" />
                </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
