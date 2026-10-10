// Small formatting helpers shared by the Courtyard, Front Door and Brief Book pages. Server and client safe.

/** Minutes between two timestamps (null if either is missing). */
export const minutesBetween = (a: string | Date | null | undefined, b: string | Date | null | undefined): number | null => {
  if (!a || !b) return null;
  const m = (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
  return isFinite(m) ? m : null;
};

/** "6 min", "1.5 hr", "2.3 days": plain elapsed time. */
export const elapsedWords = (min: number | null | undefined): string => {
  if (min == null) return '—';
  const m = Math.max(0, min);
  if (m < 1) return 'under a minute';
  if (m < 90) return `${Math.round(m)} min`;
  if (m < 60 * 36) return `${(m / 60).toFixed(1).replace(/\.0$/, '')} hr`;
  return `${(m / 1440).toFixed(1).replace(/\.0$/, '')} days`;
};

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
