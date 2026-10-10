import phone from '../scripts/fixtures/phone.json';
import other from '../scripts/fixtures/other.json';
import type { Turn } from './types';

export interface FixtureCall { started_at: string; duration_sec: number; turns: Turn[]; dropped?: boolean }
export interface Fixture {
  id: string; label: string; channel: 'phone'; caller_number: string; started_at: string; after_hours: boolean; missed: boolean;
  calls: FixtureCall[]; staff_note: string | null;
  history: { prior_at: string; prior_ref: string; prior_status: string; note?: string } | null;
  expect: { verdicts?: string[]; priority?: boolean; referral?: string; price_asked?: boolean; merged_calls?: number; missed?: boolean; decision_maker_note?: boolean };
}
export const PHONE_FIXTURES = phone as unknown as Fixture[];
/** WhatsApp + web-form enquiries: parsed but NOT routed (future channels, see README). */
export const OTHER_FIXTURES = other as { id: string; channel: string; raw: string; routed: boolean }[];
export const fixtureById = (id: string): Fixture | undefined => PHONE_FIXTURES.find((f) => f.id === id);
