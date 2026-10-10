'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Edit the average project value used for the indicative pipeline figure. */
export function AvgValueEditor({ initial }: { initial: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const n = Number(value.replace(/[,\s₹]/g, ''));
    if (!isFinite(n) || n <= 0) { setMsg('Enter an amount in rupees, for example 1100000.'); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'avg_project_value_inr', value: n }) });
      if (!res.ok) throw new Error(res.status === 401 ? 'Please sign in again.' : 'Could not save just now.');
      setMsg('Saved. The pipeline figure now uses this value.');
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save just now.');
    } finally { setBusy(false); }
  }

  return (
    <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label htmlFor="avg-value" className="annot">Average project value (₹)</label>
      <div className="mt-1 flex gap-2">
        <input id="avg-value" className="field num max-w-[11rem]" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="submit" className="btn btn-ghost" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <p className="mt-1 min-h-[1.25rem] text-xs text-muted" aria-live="polite">{msg}</p>
    </form>
  );
}
