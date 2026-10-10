'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fmtDateTime } from '@/lib/time';
import { Empty, Label, Sheet } from '@/components/ui';
import { SimTag } from './SimTag';
import type { WaitingRow } from './types';

interface Ev { ref: string; step: string; detail: string }
interface LogRow extends Ev { at: number; plus: number; id: number }

const STEP: Record<string, string> = {
  nudge: 'Reminder email sent ("Still waiting")',
  reassigned: 'Reassigned',
  to_front_desk: 'Sent to the front desk',
  callback_reminder: 'Callback reminder sent',
  overdue_nudge: 'Overdue nudge sent',
  front_desk_told: 'Front desk told',
  missed_promise: 'Callback promise missed',
  escalation_repeat: 'Escalation repeated',
};
const STEPS: (5 | 10 | 15 | 30)[] = [5, 10, 15, 30];

export function ClockTab({ waiting }: { waiting: WaitingRow[] }) {
  const [offset, setOffset] = useState<number | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/rehearsal/clock').then((r) => r.json()).then((j: { offset?: number }) => { if (alive && typeof j.offset === 'number') setOffset(j.offset); }).catch(() => { if (alive) setErr('Could not read the pretend clock.'); });
    return () => { alive = false; };
  }, []);

  const advance = async (minutes: 5 | 10 | 15 | 30 | 'reset') => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/rehearsal/clock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ minutes }) });
      const j = (await res.json().catch(() => ({}))) as { offset?: number; events?: Ev[]; error?: string };
      if (!res.ok || typeof j.offset !== 'number') setErr(j.error ?? `The clock did not move (${res.status}).`);
      else {
        const events = j.events ?? [];
        const offsetNow = j.offset;
        setOffset(offsetNow);
        if (minutes === 'reset') setLastNote('Clock set back to real time.');
        else setLastNote(events.length ? `Moved to +${offsetNow} min: ${events.length} thing${events.length === 1 ? '' : 's'} happened.` : `Moved to +${offsetNow} min: nothing was due yet.`);
        setLog((prev) => [...events.map((e, i) => ({ ...e, at: Date.now(), plus: offsetNow, id: prev.length + i + Math.random() })), ...prev]);
      }
    } catch {
      setErr('Could not reach the server. Try again.');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <Sheet>
        <div className="flex flex-wrap items-center gap-2"><Label>Fast-forward clock</Label><SimTag /></div>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          This moves a pretend clock forward for simulated handoffs only, so real leads are never touched. That lets you watch the escalation ladder (a nudge at 10 minutes, a reassignment at 15, the front desk after two reassignments, then callback reminders) in minutes instead of hours.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-6">
          <div>
            <div className="annot">Pretend clock</div>
            <div className="display num mt-1 text-4xl font-semibold">{offset === null ? '…' : `+${offset}`}<span className="ml-1 text-lg font-medium text-muted">min</span></div>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Move the clock forward">
            {STEPS.map((m) => <button key={m} type="button" className="btn btn-primary" disabled={busy} onClick={() => advance(m)}>+{m} min</button>)}
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => advance('reset')}>Reset clock</button>
          </div>
        </div>
        {busy && <p className="mt-3 text-sm text-muted" role="status">Moving the clock and running the ladder…</p>}
        <p aria-live="polite" role="status" className="mt-3 min-h-[1.25rem] text-sm text-sage-deep">{busy ? '' : lastNote}</p>
        {err && <p role="alert" className="mt-1 text-sm text-alert">{err}</p>}
      </Sheet>

      <div className="grid gap-5 lg:grid-cols-2">
        <Sheet>
          <Label>Waiting for Accept</Label>
          <p className="mt-1 text-xs text-muted">Simulated enquiries that are handed over and not yet accepted. These are what will move.</p>
          {waiting.length === 0 ? <p className="mt-3 text-sm text-muted">Nothing is waiting. Replay a qualified test call first.</p> : (
            <ul className="mt-2 divide-y divide-clay">
              {waiting.map((w) => (
                <li key={w.ref} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                  <Link href={`/brief/${w.ref}`} className="num font-semibold text-indigo underline">{w.ref}</Link>
                  <span>with {w.designer ?? 'a designer'}</span>
                  <span className="num ml-auto text-xs text-muted">sent {fmtDateTime(w.sentAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Sheet>

        <Sheet>
          <Label>What happened</Label>
          {log.length === 0 ? <div className="mt-2"><Empty line="Nothing yet. Move the clock and the ladder's steps will appear here." /></div> : (
            <ol className="mt-2 max-h-[24rem] space-y-2 overflow-y-auto" aria-live="polite">
              {log.map((e) => (
                <li key={e.id} className="animate-slidein rounded border border-clay bg-plaster/40 p-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="num text-xs font-semibold text-teak">+{e.plus} min</span>
                    <Link href={`/brief/${e.ref}`} className="num font-semibold text-indigo underline">{e.ref}</Link>
                    <span className="font-medium">{STEP[e.step] ?? e.step}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{e.detail}</p>
                </li>
              ))}
            </ol>
          )}
        </Sheet>
      </div>
    </div>
  );
}
