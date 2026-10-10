// STEP D · Check and decide (code, not AI).
// The model suggests; this file decides. Pure functions, no I/O, so `npm run test:verdicts` can run it offline.
import {
  CRITERION_KEYS, type CallerHistory, type Category, type Criterion, type CriterionKey, type DecidedExtraction,
  type HouseRules, type RawExtraction, type Turn, type Verdict,
} from '../types';
import { classifyLocality } from '../rules/service-area';
import { DEFAULT_CONFIG, DEFAULT_SERVICE_AREA } from '../rules/defaults';

export const normQuote = (s: string): string =>
  s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

/** Is `quote` word-for-word in the CALLER's turns (normalised)? "…" fragments must each appear. */
export function quoteInCaller(quote: string | null | undefined, turns: Turn[]): boolean {
  if (!quote) return false;
  const hay = ' ' + normQuote(turns.filter((t) => t.speaker === 'caller').map((t) => t.text).join(' ')) + ' ';
  const frags = quote.split(/…|\.{3}/).map(normQuote).filter((f) => f.length >= 3);
  if (!frags.length) return false;
  return frags.every((f) => hay.includes(' ' + f + ' '));
}

/** qualified.md, exactly. */
export function computeVerdict(category: Category, criteria: Criterion[]): { verdict: Verdict; notes: string[] } {
  if (category === 'existing_client_escalation') return { verdict: 'escalate', notes: [] };
  if (category === 'other') return { verdict: 'other', notes: [] };
  const st = (k: CriterionKey) => criteria.find((c) => c.key === k)?.status ?? 'unclear';
  if (criteria.some((c) => c.status === 'fail')) return { verdict: 'not_a_fit', notes: [] };
  const notes: string[] = [];
  if (st('decision_maker') === 'unclear') notes.push('Decision-maker not confirmed on the call; ask at first contact.');
  if (st('real_project') === 'unclear' || st('service_area') === 'unclear' || st('timeline') === 'unclear') return { verdict: 'unsure', notes };
  return { verdict: 'qualified', notes };
}

const COMMERCIAL = /office|clinic|studio|commercial|coworking|co-working|pod|shop|workspace/i;

const parseDate = (s: string | null | undefined): Date | null => {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(s.slice(0, 10) + 'T00:00:00+05:30');
  return isNaN(d.getTime()) ? null : d;
};

export function reasonText(criteria: Criterion[]): string {
  const fails = criteria.filter((c) => c.status === 'fail');
  return fails.map((c) => c.reason).filter(Boolean).join(' ');
}

export interface DecideInput {
  raw: RawExtraction;
  turns: Turn[];                 // cleaned transcript the model saw
  callDate: Date;                // "today" for timeline maths
  history?: CallerHistory | null;
  rules?: Pick<HouseRules, 'service_area' | 'config'>;
}

export function decide({ raw, turns, callDate, history, rules }: DecideInput): DecidedExtraction {
  const config = rules?.config ?? DEFAULT_CONFIG;
  const area = rules?.service_area ?? DEFAULT_SERVICE_AREA;
  const notes: string[] = [];
  let quotesVerified = true;

  // 1. All five criteria present, in order.
  const criteria: Criterion[] = CRITERION_KEYS.map((key) => {
    const c = raw.criteria.find((x) => x.key === key);
    return c ? { ...c } : { key, status: 'unclear' as const, evidence_quote: null, reason: 'Not assessed.' };
  });
  const get = (k: CriterionKey) => criteria.find((c) => c.key === k)!;

  // 2. Every evidence_quote must exist in the caller's turns, or the criterion becomes "unclear".
  for (const c of criteria) {
    if (c.status === 'unclear') continue;
    if (!quoteInCaller(c.evidence_quote, turns)) {
      quotesVerified = false;
      c.adjusted = `Quote not found in the caller's words, so "${c.status}" was downgraded to unclear.`;
      c.status = 'unclear';
    }
  }

  // 3. Service area: the studio's own list overrides the model when the locality is unambiguous.
  const fields = { ...raw.fields, rooms: raw.fields.rooms ?? [] };
  const area_ = classifyLocality(fields.locality, area);
  let adjoining = false;
  const sa = get('service_area');
  if (area_.cls !== 'unknown' && area_.matched && quoteInCaller(area_.matched, turns)) {
    if (area_.cls === 'out') {
      sa.status = 'fail'; sa.evidence_quote = area_.matched; sa.adjusted = 'Locality is outside Pune / PCMC (studio list).';
      sa.reason = `Site is in ${fields.locality ?? area_.matched}, outside Pune city and PCMC.`;
      fields.in_service_area = 'no';
    } else {
      sa.status = 'pass'; sa.evidence_quote = area_.matched; fields.in_service_area = 'yes';
      sa.reason = `${fields.locality ?? area_.matched} is in Pune / PCMC (studio list).`;
      if (area_.cls === 'adjoining') {
        adjoining = true;
        sa.adjusted = 'Not on the studio list; accepted as an adjoining Pune area.';
        sa.reason = `${fields.locality ?? area_.matched} is an adjoining Pune area.`;
        notes.push(`Area "${fields.locality ?? area_.matched}" is not on the studio's list (adjoining Pune): designer to confirm.`);
      }
    }
  }

  // 4. Timeline: a finish date under N weeks from the call date cannot be served (services.md).
  const finish = parseDate(fields.timeline_date_estimate);
  const tl = get('timeline');
  if (finish) {
    const minDate = new Date(callDate.getTime() + config.min_lead_weeks * 7 * 86_400_000);
    const sane = finish.getTime() >= callDate.getTime() - 86_400_000 && finish.getTime() < callDate.getTime() + 3 * 365 * 86_400_000;
    if (!sane) notes.push(`Model's finish-date estimate (${fields.timeline_date_estimate}) looked implausible and was ignored.`);
    else if (finish < minDate && tl.status !== 'fail') {
      const q = quoteInCaller(fields.timeline_text, turns) ? fields.timeline_text : tl.evidence_quote;
      if (q && quoteInCaller(q, turns)) {
        tl.status = 'fail'; tl.evidence_quote = q;
        tl.adjusted = `Finish date ${fields.timeline_date_estimate} is under ${config.min_lead_weeks} weeks from the call.`;
        tl.reason = `Wants it finished by ${fields.timeline_date_estimate}, under ${config.min_lead_weeks} weeks away; execution cannot start that late.`;
      }
    }
  }

  // 5. Verdict from the criteria, then the commercial-size rule (rule to confirm with Nikhil).
  let { verdict, notes: vnotes } = computeVerdict(raw.category, criteria);
  notes.push(...vnotes);
  const sqft = fields.carpet_sqft;
  if (verdict === 'qualified' && fields.property_type && COMMERCIAL.test(fields.property_type) && sqft && sqft < config.min_commercial_sqft) {
    verdict = 'unsure';
    notes.push(`Commercial space of ${sqft} sq ft is under ${config.min_commercial_sqft} sq ft: designer to check (rule to confirm with Nikhil).`);
  }
  if (fields.budget_volunteered && get('budget').status === 'unclear' && verdict === 'qualified') {
    notes.push(`Budget volunteered ("${fields.budget_volunteered}") but fit is unclear.`);
  }
  if (verdict === 'not_a_fit') notes.unshift(`Not a fit: ${reasonText(criteria) || 'one or more criteria failed.'}`);

  // 6. Priority: repeat caller, frustrated caller, or the caller says they called before.
  const reasons: string[] = [];
  if (history?.priorEnquiryAt) reasons.push(`Repeat caller (earlier enquiry${history.priorRef ? ' ' + history.priorRef : ''})`);
  if (raw.mentions_prior_contact && !history?.priorEnquiryAt) reasons.push('Caller says they called before and nobody followed up');
  if (raw.caller_mood === 'frustrated') reasons.push('Caller sounded frustrated');
  const priority = reasons.length > 0 && verdict !== 'not_a_fit' && verdict !== 'other';

  return {
    ...raw,
    fields,
    criteria,
    final_verdict: verdict,
    verdict_mismatch: raw.suggested_verdict !== verdict,
    quotes_verified: quotesVerified,
    notes,
    adjoining_area: adjoining,
    priority,
    priority_reason: priority ? reasons.join('; ') : null,
  };
}
