// Shared types. Everything downstream of the voice adapter speaks CallRecord, so the provider can be
// swapped and WhatsApp / web-form enquiries can feed the same pipeline later (EnquiryInput).

export type Speaker = 'agent' | 'caller';
export interface Turn { speaker: Speaker; text: string; t?: number }

export interface CallRecord {
  provider: string;                 // 'vaani' | 'rehearsal' | ...
  providerCallId: string;
  channel: 'phone';
  callerNumber: string | null;
  startedAt: string;                // ISO
  answeredAt?: string | null;
  endedAt?: string | null;
  ringToAnswerSec: number | null;
  durationSec: number | null;
  answered: boolean;                // false = missed / failed
  answeredBy: 'agent' | 'front_desk';
  turns: Turn[];
  recordingUrl?: string | null;
  costInr?: number | null;
  minutes?: number | null;
  summary?: string | null;          // provider's own summary, never trusted for verdicts
  raw: unknown;
  simulated?: boolean;
  /** Date the model should treat as "today" for timeline maths (rehearsal replays 2026-09 fixtures). */
  asIfDate?: string;
}

/** Channel-agnostic input to STEP B onwards. Phone builds it from CallRecord(s); WhatsApp / web form later. */
export interface EnquiryInput {
  channel: 'phone' | 'whatsapp' | 'web';
  contact: string | null;
  receivedAt: string;
  turns: Turn[];
  callIds: string[];
  referenceDate: string;
}

export type CriterionKey = 'real_project' | 'service_area' | 'timeline' | 'budget' | 'decision_maker';
export type CriterionStatus = 'pass' | 'fail' | 'unclear';
export const CRITERION_KEYS: CriterionKey[] = ['real_project', 'service_area', 'timeline', 'budget', 'decision_maker'];
export const CRITERION_LABEL: Record<CriterionKey, string> = {
  real_project: '1 · Real project, design + execution',
  service_area: '2 · Pune city or PCMC',
  timeline: '3 · Realistic timeline',
  budget: '4 · Budget broadly right',
  decision_maker: '5 · Decision-maker on the call',
};

export interface Criterion {
  key: CriterionKey;
  status: CriterionStatus;
  evidence_quote: string | null;
  reason: string;
  /** set by code when it overrides or downgrades the model */
  adjusted?: string;
}

export interface ExtractedFields {
  name: string | null;
  locality: string | null;
  in_service_area: 'yes' | 'no' | 'unclear';
  property_type: string | null;
  size_bhk: string | null;
  carpet_sqft: number | null;
  scope: string | null;
  rooms: string[];
  current_state: string | null;
  timeline_text: string | null;
  timeline_date_estimate: string | null;   // date the caller wants the work FINISHED (YYYY-MM-DD), else null
  decision_maker: 'yes' | 'authorised' | 'unclear' | 'no';
  budget_volunteered: string | null;
  source: string | null;
  referral_name: string | null;
  language: string | null;
  callback_preference: string | null;
  callback_number: string | null;          // the number the caller dictated for call-back, if any
}

export type Category = 'new_enquiry' | 'existing_client_escalation' | 'other';
export type Verdict = 'qualified' | 'unsure' | 'not_a_fit' | 'escalate' | 'other';
export type Mood = 'calm' | 'eager' | 'frustrated';

export interface RawExtraction {
  fields: ExtractedFields;
  criteria: Criterion[];
  category: Category;
  suggested_verdict: Verdict;
  handoff_note: string;
  still_unknown: string[];
  caller_mood: Mood;
  price_asked: boolean;
  mentions_prior_contact: boolean;
  existing_client: { designer_name: string | null; project: string | null } | null;
}

export interface DecidedExtraction extends RawExtraction {
  final_verdict: Verdict;
  verdict_mismatch: boolean;
  quotes_verified: boolean;
  notes: string[];                 // code-added uncertainty notes for the handoff
  adjoining_area: boolean;
  priority: boolean;
  priority_reason: string | null;
}

export interface ComplianceHit { rule: string; excerpt: string }

export interface CallerHistory {
  priorEnquiryAt: string | null;
  priorRef: string | null;
  priorStatus: string | null;
  existingProject: boolean;
}

export type EnquiryStatus = 'new' | 'routed' | 'accepted' | 'called_back' | 'consult_booked' | 'not_proceeding' | 'closed';

export interface Hours { days: number[]; start: string; end: string }

export interface RulesConfig {
  min_commercial_sqft: number;
  min_lead_weeks: number;
  callback_in_hours_min: number;
  afterhours_callback_by: string;
  hours: Hours;
}

export interface HouseRules {
  id?: string;
  version: number;
  script_text: string;
  never_say: string[];
  service_area: { pune: string[]; pcmc: string[]; adjoining: string[]; not_served: string[] };
  closing_lines: Record<string, string>;
  config: RulesConfig;
  note?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at?: string;
}
