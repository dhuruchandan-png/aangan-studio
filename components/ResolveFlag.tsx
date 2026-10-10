'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Marks one House Rule flag as reviewed. */
export function ResolveFlag({ refCode, flagId }: { refCode: string; flagId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/enquiries/${encodeURIComponent(refCode)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'resolve_flag', flagId }) });
      if (!res.ok) throw new Error(res.status === 401 ? 'Please sign in again.' : 'Could not mark this as reviewed.');
      setMsg('Marked as reviewed.');
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not mark this as reviewed.');
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-ghost" onClick={() => void go()} disabled={busy}>{busy ? 'Saving…' : 'Mark as reviewed'}</button>
      <span className="text-xs text-muted" aria-live="polite">{msg}</span>
    </div>
  );
}
