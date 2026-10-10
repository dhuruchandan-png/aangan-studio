import { db, must } from './db';
import { env } from './env';
import { istDayKey } from './time';
import type { Usage } from './ai/gemini';

const num = (k: string) => { const n = parseFloat(env(k)); return isFinite(n) ? n : 0; };

export const geminiCostInr = (u: Usage): number =>
  (u.input / 1e6) * num('COST_GEMINI_INPUT_PER_1M_INR') + (u.output / 1e6) * num('COST_GEMINI_OUTPUT_PER_1M_INR');

/** Voice minutes are billed per started minute. */
export const vaaniMinutes = (durationSec: number | null | undefined): number => (durationSec && durationSec > 0 ? Math.ceil(durationSec / 60) : 0);
export const vaaniCostInr = (durationSec: number | null | undefined): number => vaaniMinutes(durationSec) * num('COST_VAANI_PER_MIN_INR');

export async function logCost(row: {
  source: 'vaani' | 'gemini' | 'fixed'; units: number; amount_inr: number; call_id?: string | null; enquiry_id?: string | null;
  simulated?: boolean; meta?: Record<string, unknown>; at?: Date;
}): Promise<void> {
  must(await db().from('cost_ledger').insert({
    date: istDayKey(row.at ?? new Date()), source: row.source, units: row.units, amount_inr: row.amount_inr,
    call_id: row.call_id ?? null, enquiry_id: row.enquiry_id ?? null, simulated: row.simulated ?? false, meta: row.meta ?? null,
  }), 'logCost');
}
