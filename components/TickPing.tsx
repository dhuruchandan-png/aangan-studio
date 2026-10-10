'use client';
import { useEffect } from 'react';

/** Quietly keeps the background work (reminders, hand-overs, retries) moving while anyone has the dashboard open. */
export function TickPing({ everyMs = 60_000 }: { everyMs?: number }) {
  useEffect(() => {
    const ping = () => { if (document.visibilityState === 'visible') fetch('/api/tick', { method: 'POST', keepalive: true }).catch(() => {}); };
    ping();
    const t = setInterval(ping, everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return null;
}
