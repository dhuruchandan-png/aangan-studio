// Everything in the studio runs on India Standard Time (UTC+5:30, no DST), so we use a fixed offset.
import type { Hours } from './types';

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

export interface IstParts { y: number; m: number; d: number; h: number; min: number; dow: number }
export const istParts = (date: Date): IstParts => {
  const s = new Date(date.getTime() + IST_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate(), h: s.getUTCHours(), min: s.getUTCMinutes(), dow: s.getUTCDay() };
};
export const istDate = (y: number, m: number, d: number, h = 0, min = 0): Date =>
  new Date(Date.UTC(y, m - 1, d, h, min) - IST_MS);

export const hm = (s: string): { h: number; m: number } => {
  const [h, m] = s.split(':').map(Number);
  return { h: h || 0, m: m || 0 };
};
export const minutesOfDay = (date: Date): number => { const p = istParts(date); return p.h * 60 + p.min; };
const hmMin = (s: string): number => { const { h, m } = hm(s); return h * 60 + m; };

export const DEFAULT_HOURS: Hours = { days: [1, 2, 3, 4, 5, 6], start: '10:00', end: '19:00' };

export const startOfIstDay = (date: Date): Date => { const p = istParts(date); return istDate(p.y, p.m, p.d); };
export const addDays = (date: Date, n: number): Date => new Date(date.getTime() + n * DAY_MS);
export const istDayKey = (date: Date): string => {
  const p = istParts(date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};
export const istMonthRange = (date: Date, offsetMonths = 0): { start: Date; end: Date } => {
  const p = istParts(date);
  const idx = p.y * 12 + (p.m - 1) + offsetMonths;
  const y = Math.floor(idx / 12), m = (idx % 12) + 1;
  return { start: istDate(y, m, 1), end: istDate(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) };
};

export const inDesignerHours = (date: Date, hours: Hours = DEFAULT_HOURS): boolean => {
  const p = istParts(date);
  const mins = p.h * 60 + p.min;
  return hours.days.includes(p.dow) && mins >= hmMin(hours.start) && mins < hmMin(hours.end);
};
export const isAfterHours = (date: Date, hours: Hours = DEFAULT_HOURS): boolean => !inDesignerHours(date, hours);

/** Midnight IST of the next day (strictly after `date`'s day) that is a working day. */
export const nextWorkingDayStart = (date: Date, hours: Hours = DEFAULT_HOURS): Date => {
  let d = addDays(startOfIstDay(date), 1);
  for (let i = 0; i < 8; i++) {
    if (hours.days.includes(istParts(d).dow)) return d;
    d = addDays(d, 1);
  }
  return d;
};

export const atTime = (day: Date, hhmm: string): Date => {
  const p = istParts(day);
  const { h, m } = hm(hhmm);
  return istDate(p.y, p.m, p.d, h, m);
};

export interface CallbackPromise {
  dueAt: Date;
  kind: 'in_hours' | 'after_hours';
  /** words the agent / templates use: "within the hour" | "by 11am" */
  spoken: string;
}
/** The callback clock: 1 hour in designer hours, else 11am on the next working morning. */
export const callbackPromise = (
  callEnd: Date,
  hours: Hours = DEFAULT_HOURS,
  afterHoursBy = '11:00',
  inHoursMin = 60,
): CallbackPromise => {
  if (inDesignerHours(callEnd, hours)) {
    return { dueAt: new Date(callEnd.getTime() + inHoursMin * 60_000), kind: 'in_hours', spoken: 'within the hour' };
  }
  const p = istParts(callEnd);
  const mins = p.h * 60 + p.min;
  const sameMorning = hours.days.includes(p.dow) && mins < hmMin(hours.start);
  const day = sameMorning ? startOfIstDay(callEnd) : nextWorkingDayStart(callEnd, hours);
  return { dueAt: atTime(day, afterHoursBy), kind: 'after_hours', spoken: `by ${fmtClockWords(afterHoursBy)}` };
};

export const fmtClockWords = (hhmm: string): string => {
  const { h, m } = hm(hhmm);
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${ap}` : `${h12}${ap}`;
};

export const fmtTime = (date: Date | string | null | undefined): string => {
  if (!date) return '—';
  const p = istParts(new Date(date));
  return `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fmtDate = (date: Date | string): string => {
  const p = istParts(new Date(date));
  return `${p.d} ${MON[p.m - 1]}`;
};
export const fmtDateTime = (date: Date | string | null | undefined): string =>
  date ? `${fmtDate(date)} · ${fmtTime(date)}` : '—';
export const fmtDayDateTime = (date: Date | string): string => {
  const p = istParts(new Date(date));
  return `${DOW[p.dow]} ${p.d} ${MON[p.m - 1]} · ${fmtTime(date)}`;
};
export const fmtDuration = (sec: number | null | undefined): string => {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
};

/**
 * Minutes elapsed between start and now that fall inside the ladder's active window
 * (default 09:30–19:00 on working days). The ladder pauses overnight and on Sundays and restarts at 09:30.
 * `ignoreHours` is used for simulated enquiries so rehearsals work at any time of day.
 */
export const activeElapsedMin = (
  start: Date,
  now: Date,
  opts: { hours?: Hours; ladderStart?: string; ignoreHours?: boolean } = {},
): number => {
  if (now <= start) return 0;
  if (opts.ignoreHours) return (now.getTime() - start.getTime()) / 60_000;
  const hours = opts.hours ?? DEFAULT_HOURS;
  const winStart = hmMin(opts.ladderStart ?? '09:30');
  const winEnd = hmMin(hours.end);
  let total = 0;
  let day = startOfIstDay(start);
  for (let i = 0; i < 40 && day < now; i++, day = addDays(day, 1)) {
    if (!hours.days.includes(istParts(day).dow)) continue;
    const a = new Date(Math.max(start.getTime(), day.getTime() + winStart * 60_000));
    const b = new Date(Math.min(now.getTime(), day.getTime() + winEnd * 60_000));
    if (b > a) total += (b.getTime() - a.getTime()) / 60_000;
  }
  return total;
};

/** True while the ladder may send things (09:30–19:00 on working days). */
export const ladderActive = (now: Date, hours: Hours = DEFAULT_HOURS, ladderStart = '09:30'): boolean => {
  const p = istParts(now);
  const mins = p.h * 60 + p.min;
  return hours.days.includes(p.dow) && mins >= hmMin(ladderStart) && mins < hmMin(hours.end);
};

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
