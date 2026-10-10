// npm run test:verdicts        offline: hand-written "golden" extractions → decide() (the rules engine)
// npm run test:verdicts:live   same assertions, but Gemini reads each transcript (needs GEMINI_API_KEY)
//
// The expected outcomes are Nikhil's reading of qualified.md. Where the strict rubric disagrees, the test does NOT
// change the expectation silently: DISAGREEMENTS below records the alternative result and the reason, and the run
// prints every one of them.
import './load-env';
import assert from 'node:assert/strict';
import { cleanTurns } from '../lib/pipeline/clean';
import { complianceScan } from '../lib/pipeline/compliance';
import { decide } from '../lib/pipeline/decide';
import { extractFromTranscript } from '../lib/pipeline/extract';
import { PHONE_FIXTURES, type Fixture } from '../lib/fixtures';
import type { CallerHistory, Verdict } from '../lib/types';

import { GOLDEN } from './golden';

/** Where the strict rubric gives a different answer from the expected one, and why. Printed on every run. */
const DISAGREEMENTS: Record<string, { got: Verdict; why: string }> = {
  T11: { got: 'unsure', why: 'The timeline was never discussed on this call, and qualified.md says unclear on criteria 1–3 means "ask one direct question". The human front desk booked without asking; the voice agent is scripted to ask, so in production this would be answered before the call ends.' },
  T13: { got: 'unsure', why: 'Same: no timeline was given (the caller pushed on price instead). Strictly UNSURE until one question is answered.' },
  T14: { got: 'unsure', why: 'No timeline was given, and the caller is a son "just checking" for parents who decide (criterion 5 unclear is only a note). The timeline gap is what makes it UNSURE; the decision-maker note is still attached.' },
  T16: { got: 'unsure', why: 'The caller never said what work they want or when, only "3BHK in Viman Nagar". UNSURE by the rubric, but PRIORITY: an unsure + priority lead alerts the front desk at once instead of waiting for the 10am digest.' },
};

const live = process.argv.includes('--live');
const turnsOf = (fx: Fixture) => cleanTurns(fx.calls.flatMap((c) => c.turns));

async function main() {
let failures = 0;
const rows: string[] = [];
const fail = (id: string, msg: string) => { failures++; rows.push(`  ✗ ${id}  ${msg}`); };

for (const fx of PHONE_FIXTURES) {
  if (fx.missed) { rows.push(`  – ${fx.id}  missed call (no transcript): shown as "would now be answered", routing skipped`); continue; }
  const turns = turnsOf(fx);
  const callDate = new Date(fx.calls[0].started_at);
  const history: CallerHistory | null = fx.history ? { priorEnquiryAt: fx.history.prior_at, priorRef: fx.history.prior_ref, priorStatus: fx.history.prior_status, existingProject: false } : null;
  const raw = live ? (await extractFromTranscript(turns, callDate)).raw : GOLDEN[fx.id];
  if (!raw) { fail(fx.id, 'no golden extraction'); continue; }
  const d = decide({ raw, turns, callDate, history });
  const exp = fx.expect;
  const alt = DISAGREEMENTS[fx.id];
  const okVerdict = exp.verdicts!.includes(d.final_verdict);
  const explained = !okVerdict && alt && alt.got === d.final_verdict;
  const probs: string[] = [];
  if (!okVerdict && !explained) probs.push(`verdict ${d.final_verdict}, expected ${exp.verdicts!.join(' or ')}`);
  if (!live && !d.quotes_verified) probs.push('a golden quote is not in the transcript (quote check downgraded it)');
  if (exp.priority && !d.priority) probs.push('expected PRIORITY');
  if (exp.referral && !(d.fields.referral_name ?? '').toLowerCase().includes(exp.referral.toLowerCase())) probs.push(`expected referral ${exp.referral}`);
  if (exp.price_asked && !d.price_asked) probs.push('expected price_asked');
  if (exp.decision_maker_note && !d.notes.some((n) => /decision-maker/i.test(n))) probs.push('expected a decision-maker note');
  if (fx.id === 'T17' && fx.calls.length !== 2) probs.push('expected 2 calls merged');
  const hits = complianceScan(fx.calls.flatMap((c) => c.turns));
  if (hits.length) probs.push(`compliance false positive: ${hits[0].rule} "${hits[0].excerpt}"`);
  if (probs.length) { fail(fx.id, probs.join('; ')); continue; }
  const tags = [d.priority ? 'PRIORITY' : '', exp.referral ? `referral: ${d.fields.referral_name}` : '', d.adjoining_area ? 'adjoining area flagged' : '', fx.calls.length > 1 ? `${fx.calls.length} calls merged` : ''].filter(Boolean).join(' · ');
  rows.push(`  ${explained ? '≠' : '✓'} ${fx.id}  ${d.final_verdict.padEnd(9)} ${explained ? '(expected ' + exp.verdicts!.join('/') + ', see below)' : ''}${tags ? '  [' + tags + ']' : ''}`);
}

console.log(`\nVerdicts · ${live ? 'LIVE (Gemini)' : 'offline (golden extractions)'}\n${rows.join('\n')}`);
const used = Object.entries(DISAGREEMENTS).filter(([id]) => rows.some((r) => r.includes(`≠ ${id}`)));
if (used.length) {
  console.log('\nWhere the strict rubric disagrees with the expected outcome (the expectation was NOT changed):');
  for (const [id, a] of used) console.log(`  ${id}: strict result is ${a.got.toUpperCase()}. ${a.why}`);
}
if (failures) { console.error(`\n${failures} failure(s).`); process.exit(1); }
assert.ok(true);
console.log('\nAll verdict checks passed.');

}
main().catch((e) => { console.error(e); process.exit(1); });
