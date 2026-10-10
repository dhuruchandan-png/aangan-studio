'use client';

/** True when this visit started from a button in one of our emails (the link carries ?via=email; remembered for the session). */
function cameFromEmail(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('via') === 'email') sessionStorage.setItem('aangan_via', 'email');
    return sessionStorage.getItem('aangan_via') === 'email';
  } catch { return false; }
}
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Panel = null | 'book' | 'stop' | 'pass';
interface Props { refCode: string; status: string; compact?: boolean }

const STOP_REASONS = [
  'Client chose another studio', 'Budget does not fit', 'Timeline does not fit', 'Outside our service area',
  'Not reachable after several tries', 'Client postponed the project', 'Not a design + execution project', 'Other',
];
const PASS_REASONS = ['Too busy right now', 'Away from work', 'Not my speciality', 'Clash with another site visit', 'Other'];

const tap = 'min-h-[48px] justify-center px-4 text-[15px]';

/** A designer's own actions on one lead. The server decides who is acting (the session), never this form. */
export function LeadActions({ refCode, status, compact }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [when, setWhen] = useState('');
  const [where, setWhere] = useState<'site' | 'studio'>('site');
  const [reason, setReason] = useState('');
  const id = refCode.replace(/[^a-zA-Z0-9]/g, '') + (compact ? 'c' : 'f');

  const isRouted = status === 'routed';
  const canCalled = status === 'routed' || status === 'accepted';
  const canBook = ['routed', 'accepted', 'called_back'].includes(status);
  const canStop = ['routed', 'accepted', 'called_back', 'consult_booked'].includes(status);
  const canSnooze = status === 'routed' || status === 'accepted';

  async function post(action: string, payload?: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/me/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enquiry: refCode, action, payload, via: cameFromEmail() ? 'email' : 'dashboard' }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      const ok = res.ok && j.ok !== false;
      setMsg({ ok, text: j.message ?? j.error ?? (ok ? 'Done.' : res.status === 401 ? 'Please sign in again.' : 'That did not go through. Please try again.') });
      if (ok) { setPanel(null); setReason(''); router.refresh(); }
    } catch {
      setMsg({ ok: false, text: 'Could not reach the server. Check your signal and try again.' });
    } finally { setBusy(false); }
  }

  function toggle(p: Exclude<Panel, null>) { setPanel(panel === p ? null : p); setMsg(null); setReason(''); }

  function submitBook() {
    if (!when) { setMsg({ ok: false, text: 'Pick a date and time for the consultation.' }); return; }
    void post('book', { scheduledAt: when, location: where });
  }

  const any = canCalled || canBook || canStop || canSnooze || isRouted;

  return (
    <div className="space-y-3">
      {any && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {isRouted && <button type="button" className={`btn btn-primary col-span-2 ${tap}`} disabled={busy} onClick={() => void post('accept')}>Accept this lead</button>}
          {canCalled && <button type="button" className={`btn btn-ghost ${tap}`} disabled={busy} onClick={() => void post('called_back')}>Called back</button>}
          {canBook && <button type="button" className={`btn btn-ghost ${tap}`} disabled={busy} aria-expanded={panel === 'book'} aria-controls={`${id}-book`} onClick={() => toggle('book')}>Book consultation</button>}
          {canSnooze && <button type="button" className={`btn btn-ghost ${tap}`} disabled={busy} onClick={() => void post('snooze')}>Snooze 30 min</button>}
          {canStop && <button type="button" className={`btn btn-quiet border-clay ${tap}`} disabled={busy} aria-expanded={panel === 'stop'} aria-controls={`${id}-stop`} onClick={() => toggle('stop')}>Not proceeding</button>}
          {isRouted && <button type="button" className={`btn btn-quiet border-clay ${tap}`} disabled={busy} aria-expanded={panel === 'pass'} aria-controls={`${id}-pass`} onClick={() => toggle('pass')}>Pass</button>}
        </div>
      )}

      {panel === 'book' && (
        <form id={`${id}-book`} className="animate-settle space-y-3 rounded border border-clay bg-plaster/60 p-3" onSubmit={(e) => { e.preventDefault(); submitBook(); }}>
          <div>
            <label htmlFor={`${id}-when`} className="annot">Consultation date and time (IST)</label>
            <input id={`${id}-when`} type="datetime-local" className="field num mt-1 min-h-[48px]" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </div>
          <fieldset>
            <legend className="annot">Where</legend>
            <div className="mt-1 grid gap-2 text-sm sm:grid-cols-2">
              <label className="flex min-h-[48px] items-center gap-2 rounded border border-clay bg-paper px-3"><input type="radio" name={`${id}-where`} checked={where === 'site'} onChange={() => setWhere('site')} /> At the client’s site</label>
              <label className="flex min-h-[48px] items-center gap-2 rounded border border-clay bg-paper px-3"><input type="radio" name={`${id}-where`} checked={where === 'studio'} onChange={() => setWhere('studio')} /> At the studio</label>
            </div>
          </fieldset>
          <button type="submit" className={`btn btn-primary w-full ${tap}`} disabled={busy}>{busy ? 'Booking…' : 'Book it and send the invite'}</button>
        </form>
      )}

      {(panel === 'stop' || panel === 'pass') && (
        <form id={`${id}-${panel}`} className="animate-settle space-y-3 rounded border border-clay bg-plaster/60 p-3" onSubmit={(e) => {
          e.preventDefault();
          if (!reason) { setMsg({ ok: false, text: 'Pick a reason first. It helps the studio.' }); return; }
          void post(panel === 'stop' ? 'not_proceeding' : 'pass', { reason });
        }}>
          <div>
            <label htmlFor={`${id}-reason`} className="annot">{panel === 'stop' ? 'Why is this not proceeding?' : 'Why are you passing it on?'}</label>
            <select id={`${id}-reason`} className="field mt-1 min-h-[48px]" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose…</option>
              {(panel === 'stop' ? STOP_REASONS : PASS_REASONS).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {panel === 'pass' && <p className="text-xs text-muted">The lead goes straight to the next designer. No problem at all.</p>}
          <button type="submit" className={`btn btn-ghost w-full ${tap}`} disabled={busy}>{busy ? 'Saving…' : panel === 'stop' ? 'Mark as not proceeding' : 'Pass it on'}</button>
        </form>
      )}

      <div aria-live="polite" role="status" className="min-h-[1.25rem]">
        {msg && (msg.ok
          ? <p className="inline-flex items-center gap-1.5 rounded border border-sage/50 bg-[#E6EEE5] px-3 py-1.5 text-sm font-medium text-sage-deep">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8.5l3.2 3L13 4.5" /></svg>
              <span><b>Done.</b> {msg.text}</span>
            </p>
          : <p className="text-sm font-medium text-alert">{msg.text}</p>)}
      </div>
    </div>
  );
}
