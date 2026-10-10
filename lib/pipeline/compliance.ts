// STEP D (second half) · COMPLIANCE CHECK: enforces THE CUT.
// Scans the AGENT's turns for prices, per-sq-ft figures, discounts and date promises.
// The patterns are written from the never-say rules; pricing.md itself is never loaded.
import type { ComplianceHit, Turn } from '../types';

const AMOUNT_RES: RegExp[] = [
  /(?:₹|\b(?:rs\.?|inr))\s*\d[\d,\.]*\s*(?:k|lakhs?|lacs?|crores?|cr)?/gi,
  /\b\d[\d,\.]*\s*(?:-|–|to)?\s*\d*[\d,\.]*\s*(?:lakhs?|lacs?|crores?)\b/gi,
  /\b(?:lakhs?|lacs?|crores?)\b/gi,
];
const PER_SQFT = /\d[\d,\.]*\s*(?:rs\.?|rupees|₹)?\s*(?:\/|per|a|each)\s*(?:sq\.?\s*ft\.?|sqft|square\s*(?:foot|feet|ft))|(?:sq\.?\s*ft\.?|sqft|square\s*(?:foot|feet))\s*(?:rate|cost|price)[^.]{0,20}\d/gi;
const PRICE_PHRASES: RegExp[] = [
  /\b(?:our\s+)?rates?\s+(?:start|begin|are|will be)\b/gi,
  /\bstart(?:s|ing)?\s+(?:at|from)\s+(?:₹|rs\.?|\d)/gi,
  /\btypically\s+(?:costs?|runs?|comes?|is|would be)\b/gi,
  /\bit(?:'|’)?(?:ll|\s+will|\s+would)\s+(?:cost|come|be|run)\s+(?:around|about|roughly|approximately|somewhere)\b/gi,
  /\bcosts?\s+(?:around|about|roughly|approximately|somewhere)\b/gi,
  /\bball\s?park\s+(?:of|is|would be|figure)\b/gi,
  /\bfor\s+a\s+\d\s?bhk\s+it(?:'|’)?s\s+typically\b/gi,
];
const DISCOUNT = /\b(?:discounts?|\d+\s*%\s*off|special\s+offer|offer\s+you\s+a|waive[sd]?\s+(?:the|our)\s+fee)\b/gi;
const DATE_PROMISE: RegExp[] = [
  /\b(?:we|i)(?:'|’)?(?:ll|\s+will|\s+can|\s+shall)\s+(?:start|begin|complete|finish|deliver|hand\s+over|be\s+done)\b[^.?!]{0,50}\b(?:by|on|in|within|before|from)\s+[\w ]{2,25}/gi,
  /\bwill\s+be\s+(?:done|ready|finished|completed|handed over)\s+(?:by|in|within|before)\b[^.?!]{0,30}/gi,
  /\bguarantee[sd]?\b[^.?!]{0,40}/gi,
  /\bpromise[sd]?\b[^.?!]{0,40}(?:by|within|on)\b[^.?!]{0,20}/gi,
];
const DESIGNER_PROMISE = /\b(?:senior\s+)?designer\s+(?!will\b)[A-Z][a-z]{2,}\s+(?:will|is going to|would)\b[^.?!]{0,40}/g;

const nums = (s: string): string[] => (s.match(/\d[\d,\.]*/g) ?? []).map((x) => x.replace(/[,\.]+$/, '').replace(/,/g, ''));

function excerptAround(text: string, idx: number, len: number): string {
  const a = Math.max(0, idx - 50), b = Math.min(text.length, idx + len + 50);
  return (a > 0 ? '…' : '') + text.slice(a, b).trim() + (b < text.length ? '…' : '');
}

export function complianceScan(turns: Turn[]): ComplianceHit[] {
  const hits: ComplianceHit[] = [];
  const seen = new Set<string>();
  const push = (rule: string, text: string, idx: number, len: number) => {
    const key = rule + '|' + idx + '|' + text.slice(0, 30);
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ rule, excerpt: excerptAround(text, idx, len) });
  };

  const callerSoFar: string[] = [];
  for (const turn of turns) {
    if (turn.speaker === 'caller') { callerSoFar.push(turn.text); continue; }
    const text = turn.text;
    const callerBlob = callerSoFar.join(' ').replace(/,/g, '');

    for (const re of AMOUNT_RES) {
      for (const m of text.matchAll(re)) {
        // Echoing a figure the caller just volunteered is not quoting a price of ours.
        const ns = nums(m[0]);
        const echoed = ns.length > 0 && ns.every((n) => callerBlob.includes(n)) && !/per|\/|sq/i.test(text.slice(m.index!, m.index! + m[0].length + 14));
        const wordOnly = ns.length === 0 && /lakh|lac|crore/i.test(m[0]) && /lakh|lac|crore/i.test(callerBlob);
        if (echoed || wordOnly) continue;
        push('price_figure', text, m.index!, m[0].length);
      }
    }
    for (const m of text.matchAll(PER_SQFT)) push('per_sqft', text, m.index!, m[0].length);
    for (const re of PRICE_PHRASES) for (const m of text.matchAll(re)) push('price_phrase', text, m.index!, m[0].length);
    for (const m of text.matchAll(DISCOUNT)) push('discount', text, m.index!, m[0].length);
    for (const re of DATE_PROMISE) for (const m of text.matchAll(re)) push('date_promise', text, m.index!, m[0].length);
    for (const m of text.matchAll(DESIGNER_PROMISE)) push('designer_promise', text, m.index!, m[0].length);
  }
  return hits;
}

export const RULE_LABEL: Record<string, string> = {
  price_figure: 'A price or amount was quoted',
  per_sqft: 'A per-sq-ft figure was quoted',
  price_phrase: 'A "typically / rates start at / around" pricing phrase',
  discount: 'A discount or offer was mentioned',
  date_promise: 'A start or completion date was promised',
  designer_promise: 'A named designer was promised',
};
