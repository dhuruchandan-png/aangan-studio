'use client';
import { useRef, useState } from 'react';
import { cx } from '@/components/ui';
import { ChatTab } from './ChatTab';
import { ClockTab } from './ClockTab';
import { PreviewTab } from './PreviewTab';
import { ReplayTab } from './ReplayTab';
import type { DesignerOption, EnquiryRow, FixtureOption, WaitingRow } from './types';

const TABS = [
  { id: 'replay', label: 'Replay a call' },
  { id: 'chat', label: 'Talk to the agent' },
  { id: 'preview', label: 'Notification preview' },
  { id: 'clock', label: 'Fast-forward clock' },
] as const;
type TabId = (typeof TABS)[number]['id'];

interface Props { fixtures: FixtureOption[]; designers: DesignerOption[]; recentSim: EnquiryRow[]; recentAll: EnquiryRow[]; waiting: WaitingRow[] }

export function RehearsalTabs({ fixtures, designers, recentSim, recentAll, waiting }: Props) {
  const [tab, setTab] = useState<TabId>('replay');
  // A tab is mounted the first time it is opened and then kept (hidden) so a chat or a log is not lost when you switch.
  const [seen, setSeen] = useState<Set<TabId>>(new Set<TabId>(['replay']));
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const open = (id: TabId) => { setTab(id); setSeen((s) => (s.has(id) ? s : new Set<TabId>([...s, id]))); };
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = TABS.length - 1;
    if (j >= 0) { e.preventDefault(); open(TABS[j].id); refs.current[TABS[j].id]?.focus(); }
  };

  return (
    <div>
      <div role="tablist" aria-label="Rehearsal tools" className="flex gap-1 overflow-x-auto border-b border-clay">
        {TABS.map((t, i) => (
          <button
            key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
            onClick={() => open(t.id)} onKeyDown={(e) => onKey(e, i)}
            className={cx('-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors', tab === t.id ? 'border-terracotta text-terracotta-deep' : 'border-transparent text-muted hover:text-ink')}
          >{t.label}</button>
        ))}
      </div>
      <div className="mt-5">
        {seen.has('replay') && <div role="tabpanel" id="panel-replay" aria-labelledby="tab-replay" hidden={tab !== 'replay'}><ReplayTab fixtures={fixtures} designers={designers} recent={recentSim} /></div>}
        {seen.has('chat') && <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat" hidden={tab !== 'chat'}><ChatTab /></div>}
        {seen.has('preview') && <div role="tabpanel" id="panel-preview" aria-labelledby="tab-preview" hidden={tab !== 'preview'}><PreviewTab enquiries={recentAll} designers={designers} /></div>}
        {seen.has('clock') && <div role="tabpanel" id="panel-clock" aria-labelledby="tab-clock" hidden={tab !== 'clock'}><ClockTab waiting={waiting} /></div>}
      </div>
    </div>
  );
}
