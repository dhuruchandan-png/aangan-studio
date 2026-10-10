'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Designer } from '@/lib/leads';
import { Badge, Label, Sheet, cx } from '@/components/ui';

export interface CardStats {
  handoffs: number; accept: string; kept: string; consults: number; nudged: number; movedAway: number;
}

const DAYS: { n: number; label: string }[] = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' }, { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 0, label: 'Sun' },
];

type Feedback = { kind: 'ok' | 'err' | 'idle'; text: string };

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/roster', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || j.error) return { ok: false, error: j.error ?? `Something went wrong (${res.status}).` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

const Toggle = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
    <input type="checkbox" role="switch" className="h-5 w-5 accent-[#B8573A]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="text-sm"><span className="font-medium text-ink">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
  </label>
);

export function RosterCard({ designer, stats }: { designer: Designer; stats: CardStats | null }) {
  const router = useRouter();
  const id = designer.id;
  const [name, setName] = useState(designer.name);
  const [email, setEmail] = useState(designer.email ?? '');
  const [active, setActive] = useState(designer.active);
  const [onLeave, setOnLeave] = useState(designer.on_leave);
  const [days, setDays] = useState<number[]>(designer.rota?.days ?? [1, 2, 3, 4, 5, 6]);
  const [start, setStart] = useState(designer.rota?.start ?? '10:00');
  const [end, setEnd] = useState(designer.rota?.end ?? '19:00');
  const [digest, setDigest] = useState(designer.digest_time ?? '09:30');
  const [spec, setSpec] = useState<string[]>(designer.specialities ?? []);
  const [fb, setFb] = useState<Feedback>({ kind: 'idle', text: '' });
  const seq = useRef(0);

  const save = async (patch: Record<string, unknown>, what = 'Saved') => {
    const mine = ++seq.current;
    setFb({ kind: 'idle', text: 'Saving…' });
    const r = await post({ action: 'update', id, patch });
    if (mine !== seq.current) return;
    setFb(r.ok ? { kind: 'ok', text: `${what} for ${name.split(' ')[0] || 'this designer'}.` } : { kind: 'err', text: r.error ?? 'Could not save.' });
  };

  const saveRota = (nd: number[], s: string, e: string) => save({ rota: { days: [...nd].sort((a, b) => a - b), start: s, end: e } }, 'Rota saved');
  const toggleDay = (n: number) => {
    const nd = days.includes(n) ? days.filter((x) => x !== n) : [...days, n];
    setDays(nd);
    void saveRota(nd, start, end);
  };
  const toggleSpec = (s: string) => {
    const ns = spec.includes(s) ? spec.filter((x) => x !== s) : [...spec, s];
    setSpec(ns);
    void save({ specialities: ns }, 'Specialities saved');
  };

  const worth = !!stats && (stats.nudged >= 3 || stats.movedAway >= 2);
  const first = name.split(' ')[0] || 'this designer';

  return (
    <Sheet className={cx((!active || onLeave) && 'bg-paper/70')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <label className="annot block" htmlFor={`name-${id}`}>Name</label>
          <input id={`name-${id}`} className="field display mt-1 !text-lg font-semibold" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== designer.name) void save({ name: name.trim() }, 'Name saved'); }} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {email.trim()
            ? <span className="inline-flex items-center gap-1 rounded-full border border-sage/40 bg-[#E6EEE5] px-2.5 py-0.5 text-xs font-semibold text-sage-deep"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="3.5" width="12" height="9" rx="1.5" /><path d="M2.5 4.5 8 9l5.5-4.5" /></svg>Gets leads by email</span>
            : <span className="inline-flex items-center gap-1 rounded-full border border-brass/50 bg-[#F5EBD2] px-2.5 py-0.5 text-xs font-semibold text-brass-deep"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 3v6M8 12h.01" /></svg>No email yet</span>}
          {onLeave && <Badge tone="indigo">Away</Badge>}
          {!active && <Badge tone="terracotta">Inactive</Badge>}
        </div>
      </div>

      <div className="mt-3">
        <label className="annot block" htmlFor={`email-${id}`}>Email</label>
        <input id={`email-${id}`} type="email" className="field mt-1" value={email} placeholder="name@studio.in" autoComplete="off"
          onChange={(e) => setEmail(e.target.value)} onBlur={() => { if (email !== (designer.email ?? '')) void save({ email: email.trim() || null }, 'Email saved'); }} />
      </div>

      {/* ---- stats */}
      {stats && (
        <div className="mt-4 grid grid-cols-2 gap-3 border-y border-clay py-3 sm:grid-cols-4">
          <div><Label>Leads handed</Label><div className="num mt-0.5 text-xl font-semibold">{stats.handoffs}</div></div>
          <div><Label>Median accept</Label><div className="num mt-0.5 text-xl font-semibold">{stats.accept}</div></div>
          <div><Label>Callbacks kept</Label><div className="num mt-0.5 text-xl font-semibold">{stats.kept}</div></div>
          <div><Label>Consultations</Label><div className="num mt-0.5 text-xl font-semibold">{stats.consults}</div></div>
          <p className="col-span-2 -mb-1 text-xs text-muted sm:col-span-4">This month so far.</p>
        </div>
      )}
      {worth && stats && (
        <p className="mt-3 rounded border border-brass/50 bg-[#F5EBD2] px-3 py-2 text-sm text-brass-deep">
          Worth a conversation: needed <span className="num font-semibold">{stats.nudged}</span> nudges and moved <span className="num font-semibold">{stats.movedAway}</span> leads on this month.
        </p>
      )}

      {/* ---- Rota */}
      <fieldset className="mt-4">
        <legend className="annot">Rota</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <label key={d.n} className={cx('flex min-h-[40px] min-w-[48px] cursor-pointer items-center justify-center rounded border px-2 text-sm font-medium', days.includes(d.n) ? 'border-terracotta bg-[#F7E3DA] text-terracotta-deep' : 'border-clay bg-white text-muted')}>
              <input type="checkbox" className="sr-only" checked={days.includes(d.n)} onChange={() => toggleDay(d.n)} />{d.label}
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2"><span className="text-muted">From</span><input type="time" className="field num !w-auto" value={start} onChange={(e) => setStart(e.target.value)} onBlur={() => void saveRota(days, start, end)} /></label>
          <label className="flex items-center gap-2"><span className="text-muted">to</span><input type="time" className="field num !w-auto" value={end} onChange={(e) => setEnd(e.target.value)} onBlur={() => void saveRota(days, start, end)} /></label>
        </div>
      </fieldset>

      {/* ---- switches */}
      <div className="mt-3 grid gap-x-4 sm:grid-cols-2">
        <Toggle checked={onLeave} label="On leave" hint="Away: leads skip them" onChange={(v) => { setOnLeave(v); void save({ on_leave: v }, v ? `${first} is marked away` : `${first} is back`); }} />
        <Toggle checked={active} label="Active" hint="Switch off when someone leaves the studio" onChange={(v) => { setActive(v); void save({ active: v }, v ? 'Active' : 'Made inactive'); }} />
      </div>

      {/* ---- how to reach */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="annot block" htmlFor={`dg-${id}`}>"Your day" email at</label>
          <input id={`dg-${id}`} type="time" className="field num mt-1" value={digest} onChange={(e) => setDigest(e.target.value)} onBlur={() => void save({ digest_time: digest }, 'Digest time saved')} />
        </div>
      </div>
      <fieldset className="mt-3">
        <legend className="annot">Specialities</legend>
        <div className="mt-1 flex flex-wrap gap-x-5">
          {(['residential', 'commercial'] as const).map((s) => (
            <label key={s} className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm capitalize">
              <input type="checkbox" className="h-4 w-4 accent-[#B8573A]" checked={spec.includes(s)} onChange={() => toggleSpec(s)} />{s}
            </label>
          ))}
        </div>
      </fieldset>

      <p aria-live="polite" role="status" className={cx('mt-3 min-h-[1.25rem] text-sm', fb.kind === 'ok' && 'text-sage-deep', fb.kind === 'err' && 'text-alert', fb.kind === 'idle' && 'text-muted')}>{fb.text}</p>
    </Sheet>
  );
}
