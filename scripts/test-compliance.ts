// npm run test:compliance · THE CUT: a fake call where the agent quotes a price must raise a House Rule flag,
// and the approved script lines must stay clean.
import assert from 'node:assert/strict';
import { complianceScan } from '../lib/pipeline/compliance';
import { buildAgentPrompt, defaultRules, DEFAULT_CLOSING, OPENING_LINE, PRICE_LINE, PRICE_PUSH_LINE, BUDGET_LOW_LINE, DECLINE_LINE } from '../lib/rules/defaults';
import type { Turn } from '../lib/types';

const A = (text: string): Turn => ({ speaker: 'agent', text });
const C = (text: string): Turn => ({ speaker: 'caller', text });
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('  ✓', name); };

console.log('\nCompliance check');

ok('the fake call from the brief raises a flag ("around ₹2,000 per sq ft")', () => {
  const hits = complianceScan([C('How much for a 2BHK in Baner?'), A('For a 2BHK it will cost around ₹2,000 per sq ft, so roughly 18 lakh.')]);
  assert.ok(hits.length >= 2, 'expected several hits');
  assert.ok(hits.some((h) => h.rule === 'price_figure'));
  assert.ok(hits.some((h) => h.rule === 'per_sqft'));
  assert.ok(hits.every((h) => h.excerpt.length > 5));
});

const positives: [string, string, string][] = [
  ['rates start at', 'Our rates start at 1,800 for a standard flat.', 'price_phrase'],
  ['typically costs', 'A 3BHK typically costs between fifteen and twenty.', 'price_phrase'],
  ['it will cost around', "It'll cost around twelve lakh or so.", 'price_phrase'],
  ['lakh figure', 'Most flats like yours come to about 12 lakh.', 'price_figure'],
  ['per square foot', 'We charge 2400 per square foot for premium finish.', 'per_sqft'],
  ['discount', 'I can give you a 10% discount if you book today.', 'discount'],
  ['date promise', "We'll start work on 15 November and finish by January.", 'date_promise'],
  ['guarantee', 'I guarantee it will be handed over before Diwali.', 'date_promise'],
  ['named designer', 'Our designer Rhea will visit you tomorrow at ten.', 'designer_promise'],
];
for (const [name, line, rule] of positives) ok(`flags: ${name}`, () => assert.ok(complianceScan([A(line)]).some((h) => h.rule === rule), `no ${rule} hit for: ${line}`));

const approved = [OPENING_LINE, PRICE_LINE, PRICE_PUSH_LINE, BUDGET_LOW_LINE, DECLINE_LINE, ...Object.values(DEFAULT_CLOSING).map((s) => s.replace('{{name}}', 'Priya').replace('{{callback_time}}', '11am'))];
ok('every approved script line is clean', () => {
  for (const line of approved) assert.deepEqual(complianceScan([A(line)]), [], `false positive on: ${line}`);
});

ok('echoing the caller\'s own budget is not quoting a price', () => {
  assert.deepEqual(complianceScan([C('My budget is 1 to 1.5 lakh.'), A('1 to 1.5 lakh would be well below what that scope needs with us.')]), []);
});

ok('the caller saying numbers never flags', () => {
  assert.deepEqual(complianceScan([C('I heard it is ₹2,000 per sq ft elsewhere.'), A('Pricing depends on the site, the materials you choose, and the scope.')]), []);
});

ok('the built prompt contains the exact price line and never contains a rupee figure', () => {
  const r = { version: 1, ...defaultRules() };
  const prompt = buildAgentPrompt(r);
  assert.ok(prompt.includes(PRICE_LINE));
  assert.ok(!/₹|\bRs\.?\s?\d|per sq(?:uare)? ?f/i.test(prompt.replace(/per-sq-ft/gi, '')), 'prompt must not contain price figures');
  assert.ok(!/\{\{/.test(prompt), 'unfilled placeholder left in prompt');
});

console.log(`\n${n} compliance checks passed.`);
