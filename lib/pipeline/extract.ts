// STEP C · Read the call (Gemini, JSON schema). pricing.md is NEVER sent.
import { generateJson, type Usage } from '../ai/gemini';
import { QUALIFIED_MD, SERVICES_MD } from '../knowledge';
import { transcriptText } from './clean';
import { CRITERION_KEYS, type Category, type Criterion, type CriterionStatus, type ExtractedFields, type Mood, type RawExtraction, type Turn, type Verdict } from '../types';

const STR = { type: 'STRING' };
const NSTR = { type: 'STRING', nullable: true };
const NNUM = { type: 'NUMBER', nullable: true };
const BOOL = { type: 'BOOLEAN' };
const enumOf = (xs: string[]) => ({ type: 'STRING', enum: xs });

export const EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    fields: {
      type: 'OBJECT',
      properties: {
        name: NSTR, locality: NSTR, in_service_area: enumOf(['yes', 'no', 'unclear']), property_type: NSTR, size_bhk: NSTR,
        carpet_sqft: NNUM, scope: NSTR, rooms: { type: 'ARRAY', items: STR }, current_state: NSTR, timeline_text: NSTR,
        timeline_date_estimate: NSTR, decision_maker: enumOf(['yes', 'authorised', 'unclear', 'no']), budget_volunteered: NSTR,
        source: NSTR, referral_name: NSTR, language: NSTR, callback_preference: NSTR, callback_number: NSTR,
      },
      required: ['name', 'locality', 'in_service_area', 'property_type', 'size_bhk', 'carpet_sqft', 'scope', 'rooms', 'current_state', 'timeline_text', 'timeline_date_estimate', 'decision_maker', 'budget_volunteered', 'source', 'referral_name', 'language', 'callback_preference', 'callback_number'],
    },
    criteria: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { key: enumOf(CRITERION_KEYS), status: enumOf(['pass', 'fail', 'unclear']), evidence_quote: NSTR, reason: STR },
        required: ['key', 'status', 'evidence_quote', 'reason'],
      },
    },
    category: enumOf(['new_enquiry', 'existing_client_escalation', 'other']),
    suggested_verdict: enumOf(['qualified', 'unsure', 'not_a_fit', 'escalate']),
    handoff_note: STR,
    still_unknown: { type: 'ARRAY', items: STR },
    caller_mood: enumOf(['calm', 'eager', 'frustrated']),
    price_asked: BOOL,
    mentions_prior_contact: BOOL,
    existing_client: { type: 'OBJECT', nullable: true, properties: { designer_name: NSTR, project: NSTR }, required: ['designer_name', 'project'] },
  },
  required: ['fields', 'criteria', 'category', 'suggested_verdict', 'handoff_note', 'still_unknown', 'caller_mood', 'price_asked', 'mentions_prior_contact', 'existing_client'],
};

export const EXTRACTION_SYSTEM = `You read a phone-call transcript for Aangan Studio, an interior design studio in Pune, and fill the JSON schema. You work for the studio's owner, Nikhil Deshpande. Judge ONLY against the two documents provided (SERVICES and QUALIFICATION RUBRIC). Never invent facts, and never state or estimate any price.

TRANSCRIPT: lines start with "Caller:" (the person who phoned) or "Assistant:" (the studio's side). Evidence must come from the CALLER's lines.

CRITERIA (return exactly five objects, keys: real_project, service_area, timeline, budget, decision_maker):
- status "pass" or "fail" REQUIRES evidence_quote: an exact, word-for-word, contiguous quote from a Caller line. If you cannot quote the caller, the status must be "unclear" and evidence_quote null.
- real_project: pass if they want design AND execution (a full home, several rooms, an office fitout, or a single room as a complete redesign). fail if they only want ideas/advice/suggestions, or will do execution themselves, or the space is a restaurant, hotel, retail store or gym. unclear if the scope is not yet known.
- service_area: pass if the site is in Pune city or PCMC (including adjoining Pune localities). fail if it is in another city (Nashik, Mumbai, Talegaon, Lonavala...). unclear if no location was given.
- timeline: judge the caller's FINAL stated position. pass if their timing allows execution to start within about 8-10 weeks of a consultation and any finish date they gave is at least 6 weeks away. fail if they need it finished in under 6 weeks. If they gave only a start date or a possession date, that is not a finish date. unclear if no timing was discussed or the caller left it open ("let me think").
- budget: ONLY if the caller volunteered a figure: pass if plausible for the described scope, fail if clearly far too low for design plus execution (e.g. 1-1.5 lakh for a kitchen plus a bedroom). If no budget was mentioned, status "unclear" and evidence_quote null. Never ask for or infer a budget.
- decision_maker: pass if the caller is the owner/decision-maker or says they are authorised by them. unclear if not discussed, or if the caller is only "checking" or "researching" on behalf of family and the real decision lies with others. Use "fail" only if the caller explicitly says they cannot or will not decide and nobody authorised them.
Do NOT treat these as failures: not knowing what they want, calling after hours, asking about price, being unsure about style, a single room with full execution, a rented apartment with no structural changes.

FIELDS: use null when unknown. carpet_sqft is a number. timeline_date_estimate is the date by which the caller wants the work FINISHED or ready to use, as YYYY-MM-DD, interpreted relative to the call date given (choose the next such date in the future); null if the caller gave only a start or possession date or nothing. decision_maker: yes | authorised | unclear | no. source = how they heard of the studio. referral_name = the person who referred them, if any. language = the language the caller spoke (English, Hindi, Marathi, Hinglish). budget_volunteered = the caller's own words about budget, else null. callback_number = a phone number the caller dictated for the call-back (digits only, with +91 if they said it), else null; do not invent one.

category: "existing_client_escalation" if the caller is an EXISTING client with a project already under way who is complaining or has an urgent issue (not a new enquiry). "other" for vendors, job-seekers, sales calls, wrong numbers. Otherwise "new_enquiry". For an existing client fill existing_client.designer_name and .project (else existing_client null).
suggested_verdict: qualified | unsure | not_a_fit | escalate, by the rubric: any criterion failed -> not_a_fit; unclear on real_project, service_area or timeline -> unsure; unclear only on budget or decision_maker -> qualified; existing client escalation -> escalate.
caller_mood: calm | eager | frustrated. price_asked: true if the caller asked what it would cost. mentions_prior_contact: true if the caller says they called or messaged before.

handoff_note: 5 to 7 short plain lines for the designer who will call back: who and where; what they want; size and current state; timeline; decision-maker; how they heard of us; and what is still unknown or worth asking. Specific, no fluff, no marketing words, no prices. Write it in English even if the call was not.
still_unknown: short phrases for what the designer should still find out (e.g. "style preference", "whether a site visit is wanted this week"). Do not list budget.`;

const coerceStatus = (s: unknown): CriterionStatus => (s === 'pass' || s === 'fail' ? s : 'unclear');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Defensive coercion: the schema should guarantee shape, but the pipeline must never crash on a bad answer. */
export function coerceExtraction(j: any): RawExtraction {
  const f = j?.fields ?? {};
  const fields: ExtractedFields = {
    name: strOrNull(f.name), locality: strOrNull(f.locality),
    in_service_area: ['yes', 'no', 'unclear'].includes(f.in_service_area) ? f.in_service_area : 'unclear',
    property_type: strOrNull(f.property_type), size_bhk: strOrNull(f.size_bhk),
    carpet_sqft: typeof f.carpet_sqft === 'number' && isFinite(f.carpet_sqft) ? f.carpet_sqft : null,
    scope: strOrNull(f.scope), rooms: Array.isArray(f.rooms) ? f.rooms.filter((x: unknown) => typeof x === 'string') : [],
    current_state: strOrNull(f.current_state), timeline_text: strOrNull(f.timeline_text), timeline_date_estimate: strOrNull(f.timeline_date_estimate),
    decision_maker: ['yes', 'authorised', 'unclear', 'no'].includes(f.decision_maker) ? f.decision_maker : 'unclear',
    budget_volunteered: strOrNull(f.budget_volunteered), source: strOrNull(f.source), referral_name: strOrNull(f.referral_name),
    language: strOrNull(f.language), callback_preference: strOrNull(f.callback_preference), callback_number: strOrNull(f.callback_number),
  };
  const criteria: Criterion[] = (Array.isArray(j?.criteria) ? j.criteria : [])
    .filter((c: any) => CRITERION_KEYS.includes(c?.key))
    .map((c: any) => ({ key: c.key, status: coerceStatus(c.status), evidence_quote: strOrNull(c.evidence_quote), reason: strOrNull(c.reason) ?? '' }));
  const category: Category = ['new_enquiry', 'existing_client_escalation', 'other'].includes(j?.category) ? j.category : 'new_enquiry';
  const sv: Verdict = ['qualified', 'unsure', 'not_a_fit', 'escalate'].includes(j?.suggested_verdict) ? j.suggested_verdict : 'unsure';
  const mood: Mood = ['calm', 'eager', 'frustrated'].includes(j?.caller_mood) ? j.caller_mood : 'calm';
  return {
    fields, criteria, category, suggested_verdict: sv,
    handoff_note: strOrNull(j?.handoff_note) ?? '',
    still_unknown: Array.isArray(j?.still_unknown) ? j.still_unknown.filter((x: unknown) => typeof x === 'string') : [],
    caller_mood: mood, price_asked: !!j?.price_asked, mentions_prior_contact: !!j?.mentions_prior_contact,
    existing_client: j?.existing_client ? { designer_name: strOrNull(j.existing_client.designer_name), project: strOrNull(j.existing_client.project) } : null,
  };
}

export function buildExtractionUser(turns: Turn[], callDate: Date): string {
  const dateStr = new Date(callDate.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return `CALL DATE (today, IST): ${dateStr}

=== SERVICES ===
${SERVICES_MD}

=== QUALIFICATION RUBRIC (Nikhil's) ===
${QUALIFIED_MD}

=== TRANSCRIPT ===
${transcriptText(turns)}`;
}

export async function extractFromTranscript(turns: Turn[], callDate: Date): Promise<{ raw: RawExtraction; usage: Usage; model: string }> {
  const res = await generateJson<unknown>({ system: EXTRACTION_SYSTEM, user: buildExtractionUser(turns, callDate), schema: EXTRACTION_SCHEMA });
  return { raw: coerceExtraction(res.data), usage: res.usage, model: res.model };
}
