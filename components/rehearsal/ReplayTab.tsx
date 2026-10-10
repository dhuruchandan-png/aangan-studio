'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CRITERION_LABEL, type Criterion } from '@/lib/types';
import { fmtDateTime } from '@/lib/time';
import { Badge, Label, Sheet, StatusChip, VerdictChip, cx } from '@/components/ui';
import { SimTag } from './SimTag';
import type { DesignerOption, EnquiryRow, FixtureOption } from './types';

interface RouteOut { kind: string; designer?: string; silent?: boolean }
interface RunResponse {
  error?: string; skipped?: boolean; message?: string; fixture?: string;
  ref?: string; verdict?: string | null; route?: RouteOut | null; complianceHits?: number; deferred?: boolean; merged?: boolean;
  elapsedMs?: number; totalMs?: number; callback_due?: string | null;
  extraction?: { verdict: string; suggested: string; mismatch: boolean; notes: string[]; priority: boolean; criteria: Criterion[]; handoff_note: string } | null;
}

const PASTE_HINT = 'Caller: Hi, I want to redo my 3BHK in Baner.\nAssistant: Lovely, may I have your name?\nCaller: Priya. We need it done in about three months.';

const routeWords = (r: RouteOut | null | undefined): string => {
  if (!r) return 'No routing was needed.';
  switch (r.kind) {
    case 'handoff': return `Handed to ${r.designer ?? 'a designer'}${r.silent ? ' silently' : ''}`;
    case 'frontdesk_queue': return 'Placed in the front-desk queue';
    case 'escalated': return 'Escalated to Nikhil and the senior chat';
    case 'unassigned': return 'No designer was free: the front desk was alerted';
    case 'logged': return 'Logged. No designer needed';
    default: return r.kind;
  }
};

const CRIT_UI: Record<string, { word: string; cls: string; d: string }> = {
  pass: { word: 'Pass', cls: 'border-sage/40 bg-[#E6EEE5] text-sage-deep', d: 'M3 8.5l3.2 3L13 4.5' },
  fail: { word: 'Fail', cls: 'border-terracotta bg-[#F7E3DA] text-terracotta-deep', d: 'M4 4l8 8M12 4l-8 8' },
  unclear: { word: 'Unclear', cls: 'border-brass/50 bg-[#F5EBD2] text-brass-deep', d: 'M6 6a2 2 0 1 1 2.8 1.8C8.3 8.1 8 8.5 8 9.2M8 12h.01' },
};

export function ReplayTab({ fixtures, designers, recent }: { fixtures: FixtureOption[]; designers: DesignerOption[]; recent: EnquiryRow[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'fixture' | 'paste'>('fixture');
  const [fixtureId, setFixtureId] = useState(fixtures[0]?.id ?? '');
  const [designerId, setDesignerId] = useState('');
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<RunResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fx = fixtures.find((f) => f.id === fixtureId) ?? null;

  const run = async () => {
    setRunning(true); setErr(null); setRes(null);
    const body: Record<string, unknown> = mode === 'fixture' ? { fixture: fixtureId } : { text };
    if (designerId) body.designerId = designerId;
    try {
      const r = await fetch('/api/rehearsal/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as RunResponse;
      if (!r.ok || j.error) setErr(friendly(j.error ?? `The rehearsal stopped (${r.status}).`));
      else { setRes(j); router.refresh(); }
    } catch {
      setErr('Could not reach the server. Check your connection and try again.');
    }
    setRunning(false);
  };

  const canRun = !running && (mode === 'fixture' ? !!fixtureId : text.trim().length > 0);
  const x = res?.extraction ?? null;
  const expectedOk = fx && res?.verdict ? fx.expected.length === 0 || fx.expected.includes(res.verdict) : null;
  const fast = res && typeof res.elapsedMs === 'number' && res.elapsedMs < 30_000 && res.route?.kind === 'handoff';
  const sec = (ms?: number) => (typeof ms === 'number' ? (ms / 1000).toFixed(1) : '—');

  return (
    <div className="space-y-5">
      <Sheet>
        <div className="flex flex-wrap items-center gap-2"><Label>Replay a call</Label><SimTag /></div>
        <p className="mt-1 text-sm text-muted">Runs a past call, or a transcript you paste, through the same reading, rules and handoff as a real one.</p>

        <fieldset className="mt-4">
          <legend className="sr-only">Where the call comes from</legend>
          <div className="flex flex-wrap gap-2">
            {([['fixture', 'One of the 20 test calls'], ['paste', 'Paste a transcript']] as const).map(([k, l]) => (
              <label key={k} className={cx('flex min-h-[40px] cursor-pointer items-center gap-2 rounded border px-3 text-sm font-medium', mode === k ? 'border-terracotta bg-[#F7E3DA] text-terracotta-deep' : 'border-clay bg-white text-muted')}>
                <input type="radio" name="replay-mode" className="sr-only" checked={mode === k} onChange={() => setMode(k)} />{l}
              </label>
            ))}
          </div>
        </fieldset>

        {mode === 'fixture' ? (
          <div className="mt-3">
            <label htmlFor="fixture" className="annot">Test call</label>
            <select id="fixture" className="field mt-1" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
              {fixtures.map((f) => <option key={f.id} value={f.id}>{f.id} · {f.label} · {f.date}{f.expected.length ? ` · expect ${f.expected.join(' / ')}` : ''}</option>)}
            </select>
            {fx && (
              <p className="mt-1.5 text-xs text-muted">
                <span className="num">{fx.id}</span> from <span className="num">{fx.date}</span>{fx.expected.length ? <>, expected verdict: <b>{fx.expected.join(' or ')}</b></> : null}{fx.priority ? ', expected to be marked priority' : ''}.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <label htmlFor="paste" className="annot">Transcript</label>
            <textarea id="paste" className="field num mt-1 !text-[13px] leading-relaxed" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={PASTE_HINT} />
            <p className="mt-1 text-xs text-muted">Start each line with <span className="num">Caller:</span> or <span className="num">Assistant:</span>.</p>
          </div>
        )}

        <div className="mt-3">
          <label htmlFor="rdesigner" className="annot">Send the handoff to</label>
          <select id="rdesigner" className="field mt-1" value={designerId} onChange={(e) => setDesignerId(e.target.value)}>
            <option value="">Whoever is next on the rota (the usual choice)</option>
            {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">Hand the lead to this designer. The email still goes to the test address, never to the designer, and shows who it was meant for.</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={!canRun} onClick={run}>{running ? 'Running…' : 'Run'}</button>
          {running && <span className="text-sm text-muted" role="status">Reading the call, checking the rules and sending the handoff. This takes about 10 to 30 seconds.</span>}
        </div>
        {err && <p role="alert" className="mt-3 rounded border border-terracotta/50 bg-[#F7E3DA] px-3 py-2 text-sm text-terracotta-deep">{err}</p>}
      </Sheet>

      {res?.skipped && (
        <Sheet tone="sage">
          <div className="flex items-center gap-2"><Label>Would now be answered</Label><SimTag /></div>
          <p className="mt-2 text-sm">{res.message}</p>
        </Sheet>
      )}

      {res && !res.skipped && (
        <Sheet>
          <div className="flex flex-wrap items-center gap-2"><Label>Result</Label><SimTag /></div>

          <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <div className="annot">Handoff speed</div>
              <div className={cx('display num mt-1 text-3xl font-semibold', fast ? 'text-sage-deep' : 'text-ink')}>{sec(res.elapsedMs)} s</div>
              <div className="text-xs text-muted">{fast ? <span className="font-medium text-sage-deep">Handoff email sent in {sec(res.elapsedMs)} s</span> : 'from the end of the call'} · whole run <span className="num">{sec(res.totalMs)} s</span></div>
            </div>
            <div>
              <div className="annot">Verdict</div>
              <div className="mt-1.5 flex items-center gap-2"><VerdictChip verdict={res.verdict ?? null} />{x?.priority && <Badge tone="terracotta">Priority</Badge>}</div>
            </div>
            <div>
              <div className="annot">What happened next</div>
              <div className="mt-1 text-sm font-medium">{res.deferred ? 'Held back: the call was very short, so the app waits for a call back.' : routeWords(res.route)}</div>
            </div>
          </div>

          {fx && fx.expected.length > 0 && res.verdict && (
            <p className={cx('mt-3 flex items-start gap-2 rounded border px-3 py-2 text-sm', expectedOk ? 'border-sage/40 bg-[#E6EEE5] text-sage-deep' : 'border-brass/50 bg-[#F5EBD2] text-brass-deep')}>
              <svg width="14" height="14" viewBox="0 0 16 16" className="mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{expectedOk ? <path d="M3 8.5l3.2 3L13 4.5" /> : <path d="M8 3v6M8 12h.01" />}</svg>
              <span>
                {expectedOk ? <>As expected: {fx.expected.join(' or ')}.</> : <>Expected {fx.expected.join(' or ')}, got {res.verdict}. {x?.notes?.length ? `The notes below may say why.` : 'Open the Brief Book to compare the evidence.'}</>}
              </span>
            </p>
          )}

          {x && (
            <>
              {x.mismatch && <p className="mt-3 text-sm text-brass-deep">The model first suggested <b>{x.suggested}</b>; the rules adjusted it to <b>{x.verdict}</b>.</p>}
              <div className="mt-4">
                <Label>The five criteria</Label>
                <ul className="mt-2 space-y-2.5">
                  {x.criteria.map((c) => {
                    const ui = CRIT_UI[c.status] ?? CRIT_UI.unclear;
                    return (
                      <li key={c.key} className="rounded border border-clay bg-plaster/40 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', ui.cls)}>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ui.d} /></svg>{ui.word}
                          </span>
                          <span className="text-sm font-medium">{CRITERION_LABEL[c.key] ?? c.key}</span>
                        </div>
                        {c.evidence_quote && <blockquote className="mt-1.5 border-l-2 border-terracotta/60 pl-3 text-sm italic text-ink">&ldquo;{c.evidence_quote}&rdquo;</blockquote>}
                        <p className="mt-1 text-xs text-muted">{c.reason}{c.adjusted ? ` · adjusted: ${c.adjusted}` : ''}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {x.notes.length > 0 && (
                <div className="mt-4">
                  <Label>Notes added by the rules</Label>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm marker:text-brass">{x.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                </div>
              )}
              <div className="mt-4">
                <Label>Handoff note for the designer</Label>
                <p className="mt-1.5 whitespace-pre-line rounded border border-clay bg-plaster/40 p-3 text-sm">{x.handoff_note}</p>
              </div>
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className={cx('inline-flex items-center gap-1.5', res.complianceHits ? 'font-semibold text-alert' : 'text-sage-deep')}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{res.complianceHits ? <path d="M8 3v6M8 12h.01" /> : <path d="M3 8.5l3.2 3L13 4.5" />}</svg>
              House Rule hits: <span className="num">{res.complianceHits ?? 0}</span>
            </span>
            {res.callback_due && <span className="text-muted">Callback due <span className="num text-ink">{fmtDateTime(res.callback_due)}</span></span>}
            {res.ref && <Link href={`/brief/${res.ref}`} className="font-semibold text-indigo underline">Open {res.ref} in Brief Book</Link>}
          </div>
        </Sheet>
      )}

      <Sheet>
        <Label>Recent rehearsals</Label>
        {recent.length === 0 ? <p className="mt-2 text-sm text-muted">None yet. Run a test call above and it will show here.</p> : (
          <ul className="mt-2 divide-y divide-clay">
            {recent.map((r) => (
              <li key={r.ref} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5 text-sm">
                <Link href={`/brief/${r.ref}`} className="num font-semibold text-indigo underline">{r.ref}</Link>
                <span className="num text-muted">{r.caller_number ?? 'no number'}</span>
                <VerdictChip verdict={r.verdict} />
                <StatusChip status={r.status} />
                <span className="num ml-auto text-xs text-muted">{fmtDateTime(r.first_contact_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

function friendly(m: string): string {
  if (/GEMINI_API_KEY|Gemini/i.test(m) && /key|not set|missing|env/i.test(m)) return `The reading model is not connected yet (${m}). Add the Gemini key to the environment settings and try again.`;
  return m;
}
