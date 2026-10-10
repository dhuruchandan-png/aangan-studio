'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Label, Sheet } from '@/components/ui';

export function AddDesigner() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) { setMsg({ ok: false, text: 'Please add a name.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/roster', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', name: name.trim(), email: email.trim() }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.error) setMsg({ ok: false, text: j.error ?? 'Could not add the designer.' });
      else { setMsg({ ok: true, text: `${name.trim()} is on the roster. Leads will go to that address.` }); setName(''); setEmail(''); router.refresh(); }
    } catch {
      setMsg({ ok: false, text: 'Could not reach the server. Try again.' });
    }
    setBusy(false);
  };

  return (
    <Sheet>
      <Label>Add a designer</Label>
      <form onSubmit={submit} className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="new-name" className="text-sm font-medium">Name</label>
          <input id="new-name" className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="new-email" className="text-sm font-medium">Email</label>
          <input id="new-email" type="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add to roster'}</button>
      </form>
      <p aria-live="polite" role="status" className={`mt-2 min-h-[1.25rem] text-sm ${msg ? (msg.ok ? 'text-sage-deep' : 'text-alert') : ''}`}>{msg?.text ?? ''}</p>
    </Sheet>
  );
}
