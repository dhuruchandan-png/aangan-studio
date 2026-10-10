'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Sends (or re-sends) one enquiry to HubSpot. `force` is needed for sample and rehearsal enquiries. */
export function HubspotSyncButton({ refCode, force, label }: { refCode: string; force: boolean; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/crm/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: refCode, force }) });
      const j = await res.json().catch(() => ({}));
      if (j.ok) { setMsg({ ok: true, text: j.skipped ? `Skipped: ${j.skipped}.` : 'Sent to HubSpot.' }); router.refresh(); }
      else setMsg({ ok: false, text: j.error ?? `Something went wrong (${res.status}).` });
    } catch { setMsg({ ok: false, text: 'Could not reach the server.' }); }
    setBusy(false);
  };
  return (
    <div>
      <button type="button" onClick={go} disabled={busy} className="btn btn-ghost">{busy ? 'Sending…' : label}</button>
      <p role="status" aria-live="polite" className={`mt-2 min-h-[1.25rem] text-sm ${msg ? (msg.ok ? 'text-sage-deep' : 'text-alert') : ''}`}>{msg?.text ?? ''}</p>
    </div>
  );
}
