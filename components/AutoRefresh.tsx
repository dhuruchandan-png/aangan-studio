'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Refreshes the server data every 20 s while the tab is visible. Shows a small live dot and "updated … ago". */
export function AutoRefresh({ everyMs = 20_000 }: { everyMs?: number }) {
  const router = useRouter();
  const last = useRef<number>(Date.now());
  const [ago, setAgo] = useState(0);

  const refresh = useCallback(() => {
    router.refresh();
    last.current = Date.now();
    setAgo(0);
  }, [router]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(refresh, everyMs); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - last.current > everyMs) refresh();
        start();
      } else stop();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    const tick = setInterval(() => setAgo(Math.round((Date.now() - last.current) / 1000)), 5_000);
    return () => { stop(); clearInterval(tick); document.removeEventListener('visibilitychange', onVis); };
  }, [everyMs, refresh]);

  const text = ago < 8 ? 'updated just now' : `updated ${ago} s ago`;
  return (
    <div className="flex items-center gap-2 text-xs text-[#E8D9C2]" role="status" aria-live="off">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-sage opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8FB88E]" />
      </span>
      <span>live</span>
      <span aria-hidden>·</span>
      <span className="num">{text}</span>
      <button type="button" onClick={refresh} className="btn btn-quiet !min-h-0 !px-2 !py-1 !text-xs !text-gold underline">refresh now</button>
    </div>
  );
}
