// STEP B · Clean (code, not AI)
import type { Turn } from '../types';

export const MERGE_WINDOW_MS = 15 * 60_000;

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Normalise into alternating speaker turns. */
export function normalizeTurns(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    const text = collapse(t.text ?? '');
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.speaker === t.speaker) last.text += ' ' + text;
    else out.push({ speaker: t.speaker, text, t: t.t });
  }
  return out;
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

/**
 * Mask card, bank-account and Aadhaar/PAN-like numbers before anything leaves the server.
 * Phone numbers (10 digits, or +91 + 10 digits) are kept: the designer needs them.
 */
export function maskSensitive(text: string): string {
  let out = text;
  // PAN
  out = out.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[masked id]');
  // "account number 1234 5678 9012" style
  out = out.replace(/\b(account|a\/c|acct|card)(\s*(?:number|no\.?|num|#))?\D{0,12}((?:\d[ -]?){8,19}\d)/gi, (_m, w: string, n: string | undefined) => `${w}${n ?? ''} [masked number]`);
  // any other long digit run (12-19 digits) that is not a +91 mobile
  out = out.replace(/(?<![\d])(\+?(?:\d[ -]?){11,18}\d)(?!\d)/g, (m) => {
    const d = digitsOf(m);
    if (d.length === 12 && d.startsWith('91') && (m.trim().startsWith('+') || /^91[ -]?\d{5}[ -]?\d{5}$/.test(m.trim()))) return m;
    if (d.length === 11 && d.startsWith('0')) return m; // 0XXXXXXXXXX trunk-dialled mobile
    return '[masked number]';
  });
  return out;
}

export const cleanTurns = (turns: Turn[]): Turn[] =>
  normalizeTurns(turns).map((t) => ({ ...t, text: maskSensitive(t.text) }));

export const callerWordCount = (turns: Turn[]): number =>
  turns.filter((t) => t.speaker === 'caller').reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);

/** A dropped call (T17's first call) carries too little to qualify on its own. */
export const isThinCall = (turns: Turn[]): boolean => callerWordCount(turns) < 12;

export const transcriptText = (turns: Turn[]): string =>
  turns.map((t) => `${t.speaker === 'caller' ? 'Caller' : 'Assistant'}: ${t.text}`).join('\n');

export const normalizePhone = (n: string | null | undefined): string | null => {
  if (!n) return null;
  const d = digitsOf(n);
  if (!d) return null;
  if (d.length === 10) return '+91' + d;
  if (d.length === 12 && d.startsWith('91')) return '+' + d;
  if (d.length === 11 && d.startsWith('0')) return '+91' + d.slice(1);
  return '+' + d;
};
