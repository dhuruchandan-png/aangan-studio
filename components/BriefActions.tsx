'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Panel = null | 'book' | 'stop';
interface Props { refCode: string; status: string; verdict: string | null; hasDesigner: boolean; designers: { id: string; name: string }[]; assignedId: string | null; needsAck?: boolean }

/** Nikhil's toolbar on a brief. Every action goes through the same engine as the email links. */
export function BriefActions({ refCode, status, verdict, hasDesigner, designers, assignedId, needsAck }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [when, setWhen] = useState('');
  const [where, setWhere] = useState<'site' | 'studio'>('site');
  const [reason, setReason] = useState('');
  const [assignTo, setAssignTo] = useState('');

  const closed = status === 'not_proceeding' || status === 'closed' || verdict === 'not_a_fit' || verdict === 'other';

  async function post(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/enquiries/${encodeURIComponent(refCode)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      const ok = res.ok && j.ok !== false;
      setMsg({ ok, text: j.message ?? j.error ?? (ok ? 'Done.' : res.status === 401 ? 'Please sign in again.' : 'That did not go through.') });
      if (ok) { setPanel(null); router.refresh(); }
    } catch {
      setMsg({ ok: false, text: 'Could not reach the server. Try again in a moment.' });
    } finally { setBusy(false); }
  }

  const canAccept = hasDesigner && (status === 'new' || status === 'routed');
  const canCalled = hasDesigner && ['new', 'routed', 'accepted'].includes(status);
  const canBook = hasDesigner && ['new', 'routed', 'accepted', 'called_back'].includes(status);
  const canStop = hasDesigner;
  const canFd = ['new', 'routed', 'accepted'].includes(status);

  function submitBook() {
    if (!when) { setMsg({ ok: false, text: 'Pick a date and time for the consultation.' }); return; }
    const d = new Date(`${when}:00+05:30`);
    if (isNaN(d.getTime())) { setMsg({ ok: false, text: 'That date and time does not look right.' }); return; }
    void post({ action: 'book', payload: { scheduledAt: d.toISOString(), location: where } });
  }

  return (
    <div className="space-y-3">
      {needsAck && (
        <div className="rounded border-2 border-terracotta bg-[#F7E3DA] p-3">
          <p className="text-sm text-terracotta-deep"><b>An existing client needs a human.</b> Reminders keep going every 10 minutes until someone takes ownership.</p>
          <button type="button" className="btn btn-primary mt-2 min-h-[48px]" disabled={busy} onClick={() => void post({ action: 'ack' })}>I’ve got it — take ownership</button>
        </div>
      )}
      {!closed && (
        <div className="flex flex-wrap gap-2">
          {canAccept && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void post({ action: 'accept' })}>Accept</button>}
          {canCalled && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void post({ action: 'called_back' })}>Called back</button>}
          {canBook && <button type="button" className="btn btn-ghost" disabled={busy} aria-expanded={panel === 'book'} onClick={() => setPanel(panel === 'book' ? null : 'book')}>Book consultation</button>}
          {canFd && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void post({ action: 'fd_called' })}>Front desk called</button>}
          {canStop && <button type="button" className="btn btn-quiet" disabled={busy} aria-expanded={panel === 'stop'} onClick={() => setPanel(panel === 'stop' ? null : 'stop')}>Not proceeding</button>}
        </div>
      )}

      {!closed && !hasDesigner && <p className="text-xs text-muted">Assign a designer below to unlock Accept, Called back and Book.</p>}

      {panel === 'book' && (
        <form className="animate-settle space-y-3 rounded border border-clay bg-plaster/60 p-3" onSubmit={(e) => { e.preventDefault(); submitBook(); }}>
          <div>
            <label htmlFor="book-when" className="annot">Consultation date and time (IST)</label>
            <input id="book-when" type="datetime-local" className="field num mt-1 max-w-xs" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <fieldset>
            <legend className="annot">Where</legend>
            <div className="mt-1 flex gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="radio" name="where" checked={where === 'site'} onChange={() => setWhere('site')} /> At the client’s site</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="where" checked={where === 'studio'} onChange={() => setWhere('studio')} /> At the studio</label>
            </div>
          </fieldset>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Booking…' : 'Book it'}</button>
        </form>
      )}

      {panel === 'stop' && (
        <form className="animate-settle space-y-3 rounded border border-clay bg-plaster/60 p-3" onSubmit={(e) => { e.preventDefault(); void post({ action: 'not_proceeding', payload: { reason: reason.trim() || undefined } }); }}>
          <div>
            <label htmlFor="stop-reason" className="annot">Why is this not proceeding?</label>
            <input id="stop-reason" className="field mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. caller found another studio" />
          </div>
          <button type="submit" className="btn btn-ghost" disabled={busy}>{busy ? 'Saving…' : 'Mark as not proceeding'}</button>
        </form>
      )}

      {designers.length > 0 && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!assignTo) { setMsg({ ok: false, text: 'Pick a designer to assign.' }); return; } void post({ action: 'assign', payload: { assignTo } }); }}>
          <div>
            <label htmlFor="assign-to" className="annot">{assignedId ? 'Hand to a different designer' : 'Assign to a designer'}</label>
            <select id="assign-to" className="field mt-1 min-w-[12rem]" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Choose…</option>
              {designers.filter((d) => d.id !== assignedId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-ghost" disabled={busy}>Assign</button>
        </form>
      )}

      <p aria-live="polite" role="status" className={`min-h-[1.25rem] text-sm ${msg ? (msg.ok ? 'text-sage-deep' : 'text-alert') : ''}`}>{msg?.text}</p>
    </div>
  );
}
