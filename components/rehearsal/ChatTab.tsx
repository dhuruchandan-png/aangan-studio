'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { complianceScan } from '@/lib/pipeline/compliance';
import type { Turn } from '@/lib/types';
import { Badge, Label, Sheet, cx } from '@/components/ui';
import { SimTag } from './SimTag';

interface Msg { role: 'user' | 'model'; text: string }
interface ChatInfo { version: number; approved: boolean }

const CHIPS = ['How much for a 2BHK?', 'Can you give me a rough range?', 'I\'m in Nashik', 'I just want some ideas for my living room', 'My designer hasn\'t replied in five days'];
// The server's Gemini call needs the conversation to begin with a caller turn, so we always lead with this stage direction.
const SEED: Msg = { role: 'user', text: '(The caller has just been connected. Begin with your opening line.)' };

const toTurns = (msgs: Msg[]): Turn[] => msgs.map((m) => ({ speaker: m.role === 'user' ? 'caller' : 'agent', text: m.text }));

export function ChatTab() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [info, setInfo] = useState<ChatInfo | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const ask = useCallback(async (history: Msg[]) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/rehearsal/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ history: history.length ? [SEED, ...history] : [] }) });
      const j = (await res.json().catch(() => ({}))) as { reply?: string; version?: number; approved?: boolean; error?: string };
      if (!res.ok || j.error || typeof j.reply !== 'string') setErr(j.error ?? `The agent did not answer (${res.status}).`);
      else {
        const reply = j.reply;
        setMsgs([...history, { role: 'model', text: reply }]);
        if (typeof j.version === 'number') setInfo({ version: j.version, approved: !!j.approved });
      }
    } catch {
      setErr('Could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void ask([]);
  }, [ask]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [msgs, busy]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', text: t }];
    setMsgs(next); setInput('');
    void ask(next);
  };
  const reset = () => {
    setMsgs([]); setErr(null); setInput('');
    void ask([]);
  };

  return (
    <div className="space-y-4">
      <Sheet>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2"><Label>Talk to the agent</Label><SimTag /></div>
          <div className="flex flex-wrap items-center gap-2">
            {info && (info.approved
              ? <Badge tone="indigo">House Rules v{info.version} · approved</Badge>
              : <Badge tone="terracotta">{info.version === 0 ? 'Default draft: not approved' : `House Rules v${info.version} · draft: not approved`}</Badge>)}
            <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}>Start over</button>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">A text chat standing in for a phone call. The agent is told exactly what the voice agent is told.</p>

        <div className="mt-4 max-h-[28rem] min-h-[12rem] space-y-3 overflow-y-auto rounded border border-clay bg-plaster/50 p-3 md:p-4" aria-label="Conversation with the agent" role="log" aria-live="polite">
          {msgs.map((m, i) => {
            const isAgent = m.role === 'model';
            // Judge this reply on its own, with the caller's earlier words as context (echoing a figure they gave is fine).
            const callerBefore: Turn[] = toTurns(msgs.slice(0, i)).filter((t) => t.speaker === 'caller');
            const reply: Turn = { speaker: 'agent', text: m.text };
            const own = isAgent ? complianceScan([...callerBefore, reply]) : [];
            return (
              <div key={i} className={cx('flex flex-col', isAgent ? 'items-start' : 'items-end')}>
                <div className={cx('max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed', isAgent ? 'rounded-tl-sm border border-clay bg-paper' : 'rounded-tr-sm bg-indigo text-white')}>{m.text}</div>
                {isAgent && (
                  own.length > 0
                    ? <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-alert bg-[#F6DDD8] px-2 py-0.5 text-[11px] font-semibold text-alert" title={own.map((h) => h.excerpt).join(' | ')}>
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M8 3v6M8 12h.01" /></svg>House Rule: price quoted
                    </span>
                    : <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-sage-deep"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8.5l3.2 3L13 4.5" /></svg>clean</span>
                )}
              </div>
            );
          })}
          {busy && <div className="text-sm italic text-muted" role="status">The agent is typing…</div>}
          <div ref={endRef} />
        </div>
        {err && <p role="alert" className="mt-3 rounded border border-terracotta/50 bg-[#F7E3DA] px-3 py-2 text-sm text-terracotta-deep">{err}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((c) => <button key={c} type="button" className="rounded-full border border-clay bg-paper px-3 py-1.5 text-sm text-indigo hover:border-indigo disabled:opacity-50" disabled={busy || msgs.length === 0} onClick={() => send(c)}>{c}</button>)}
        </div>

        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <label htmlFor="chat-input" className="sr-only">Your message as the caller</label>
          <input id="chat-input" className="field" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Say something as the caller…" autoComplete="off" disabled={busy && msgs.length === 0} />
          <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
        </form>
      </Sheet>
    </div>
  );
}
