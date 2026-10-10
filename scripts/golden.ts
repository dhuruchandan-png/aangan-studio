// Hand-written "golden" extractions for T01–T20: what a careful reader would pull from each transcript.
// Shared by `npm run test:verdicts` (offline) and the demo-data builder. Every quote is verified against the transcript.
import type { Category, ExtractedFields, Mood, RawExtraction, Verdict } from '../lib/types';

type St = 'pass' | 'fail' | 'unclear';
const C = (s: St, q: string | null = null, r = '') => ({ s, q, r });
const KEYS = ['real_project', 'service_area', 'timeline', 'budget', 'decision_maker'] as const;

function g(o: {
  name?: string; locality?: string; bhk?: string; prop?: string; sqft?: number; scope?: string; rooms?: string[]; state?: string; ttext?: string; tdate?: string;
  dm?: ExtractedFields['decision_maker']; budget?: string; source?: string; ref?: string; cat?: Category; mood?: Mood; price?: boolean; prior?: boolean;
  cr: [ReturnType<typeof C>, ReturnType<typeof C>, ReturnType<typeof C>, ReturnType<typeof C>, ReturnType<typeof C>]; sv: Verdict;
}): RawExtraction {
  return {
    fields: {
      name: o.name ?? null, locality: o.locality ?? null, in_service_area: 'unclear', property_type: o.prop ?? null, size_bhk: o.bhk ?? null, carpet_sqft: o.sqft ?? null,
      scope: o.scope ?? null, rooms: o.rooms ?? [], current_state: o.state ?? null, timeline_text: o.ttext ?? null, timeline_date_estimate: o.tdate ?? null,
      decision_maker: o.dm ?? 'unclear', budget_volunteered: o.budget ?? null, source: o.source ?? null, referral_name: o.ref ?? null, language: 'English', callback_preference: null, callback_number: null,
    },
    criteria: o.cr.map((c, i) => ({ key: KEYS[i], status: c.s, evidence_quote: c.q, reason: c.r || (c.s === 'unclear' ? 'Not discussed.' : 'See quote.') })),
    category: o.cat ?? 'new_enquiry', suggested_verdict: o.sv, handoff_note: 'golden', still_unknown: [], caller_mood: o.mood ?? 'calm',
    price_asked: !!o.price, mentions_prior_contact: !!o.prior, existing_client: null,
  };
}

export const GOLDEN: Record<string, RawExtraction> = {
  T01: g({ name: 'Priya', locality: 'Kothrud (Dahanukar Colony)', bhk: '3BHK', prop: 'apartment', sqft: 1400, scope: 'full home', rooms: ['kitchen', 'living room', '2 bedrooms'], state: 'builder flat', ttext: "done by March", tdate: '2027-03-31', dm: 'yes', source: 'referral', ref: 'Shruti Joshi', sv: 'qualified',
    cr: [C('pass', 'We want to redo the whole thing — kitchen, living room, both bedrooms'), C('pass', 'Kothrud'), C('pass', "We'd like to be done by March"), C('unclear'), C('pass', "He knows we're calling and is happy to go ahead")] }),
  T02: g({ locality: 'Wakad', bhk: '2BHK', prop: 'apartment', sqft: 950, scope: 'full redesign', ttext: 'move in November', tdate: '2026-11-01', source: 'Instagram', price: true, sv: 'qualified',
    cr: [C('pass', 'Full redesign — modular kitchen, wardrobes, living room, both bedrooms'), C('pass', 'I have a 2BHK in Wakad'), C('pass', 'We move in November'), C('unclear'), C('unclear')] }),
  T03: g({ name: 'Suresh Patil', locality: 'Nashik', prop: 'home office', scope: 'home office and study', source: 'LinkedIn', sv: 'not_a_fit',
    cr: [C('pass', 'I want to redo my home office and study'), C('fail', "I'm in Nashik"), C('unclear'), C('unclear'), C('unclear')] }),
  T04: g({ prop: 'apartment', scope: 'living room ideas only', sv: 'not_a_fit',
    cr: [C('fail', 'Just want suggestions on colours, furniture arrangement, what to change'), C('unclear'), C('unclear'), C('unclear'), C('unclear')] }),
  T05: g({ name: 'Aarti Mehta', locality: 'Koregaon Park', bhk: '4BHK', prop: 'apartment', sqft: 2400, scope: 'complete redesign', ttext: 'move back in by February', tdate: '2027-02-28', ref: 'Vikram Agarwal', sv: 'qualified',
    cr: [C('pass', 'Complete redesign. New flooring, kitchen, all four bedrooms'), C('pass', 'Koregaon Park'), C('pass', 'We want to move back in by February'), C('unclear'), C('unclear')] }),
  T06: g({ locality: 'Baner', prop: 'office', sqft: 800, scope: 'full office fitout', state: 'bare shell', ttext: 'operational by December', tdate: '2026-12-31', dm: 'yes', sv: 'qualified',
    cr: [C('pass', 'We need workstations for 20 people, a small cabin, a meeting room, and a break area'), C('pass', 'office space in Baner'), C('pass', 'We want to be operational by December'), C('unclear'), C('pass', "Yes, I'm the founder")] }),
  T07: g({ prop: 'apartment', scope: 'living room and kitchen', ttext: 'before Diwali, then maybe after', sv: 'unsure',
    cr: [C('pass', 'I want to redo my living room and kitchen before Diwali'), C('unclear'), C('unclear', null, 'Wanted it before Diwali, then asked about starting after Diwali, then left it open.'), C('unclear'), C('unclear')] }),
  T09: g({ name: 'Sheetal Deshpande', locality: 'Viman Nagar', cat: 'existing_client_escalation', mood: 'frustrated', prior: true, sv: 'escalate',
    cr: [C('unclear'), C('unclear'), C('unclear'), C('unclear'), C('unclear')] }),
  T10: g({ locality: 'Kharadi', bhk: '1BHK', prop: 'apartment', sqft: 550, scope: 'kitchen + one bedroom', budget: '1 to 1.5 lakh maximum for everything', sv: 'not_a_fit',
    cr: [C('pass', 'I want to do the kitchen and one bedroom'), C('pass', 'Kharadi'), C('unclear'), C('fail', 'My budget is 1 to 1.5 lakh maximum for everything'), C('unclear')] }),
  T11: g({ locality: 'Baner', bhk: '2BHK', prop: 'apartment (rented)', scope: 'living room, bedroom, kitchen', state: 'bare, rented, no structural changes', sv: 'qualified',
    cr: [C('pass', 'I want to properly design the living room, bedroom, and kitchen'), C('pass', "It's a 2BHK in Baner"), C('unclear'), C('unclear'), C('unclear')] }),
  T12: g({ name: 'Anand Sharma', locality: 'Kalyani Nagar', prop: 'villa', sqft: 5500, scope: 'full end-to-end design', state: 'new, empty', ttext: 'March next year to move in', tdate: '2027-03-31', sv: 'qualified',
    cr: [C('pass', 'Full end-to-end design'), C('pass', 'villa project in Kalyani Nagar'), C('pass', 'March next year to move in'), C('unclear'), C('unclear')] }),
  T13: g({ locality: 'Aundh', bhk: '3BHK', prop: 'apartment', sqft: 1100, scope: 'kitchen, wardrobes, living room', price: true, sv: 'qualified',
    cr: [C('pass', 'Kitchen, wardrobes in both bedrooms, living room'), C('pass', 'redo my flat in Aundh'), C('unclear'), C('unclear'), C('unclear')] }),
  T14: g({ locality: 'Hadapsar', bhk: '3BHK', prop: 'apartment', state: 'new possession', scope: 'full design', dm: 'unclear', sv: 'qualified',
    cr: [C('pass', 'They want a proper design'), C('pass', 'They have a 3BHK in Hadapsar'), C('unclear'), C('unclear'), C('unclear', null, "Caller is the son 'checking' on behalf of parents who decide.")] }),
  T15: g({ name: 'Smita', locality: 'Undri', bhk: '2BHK', prop: 'apartment', sqft: 875, scope: 'full home', ttext: 'possession in about six weeks; start design right away', dm: 'yes', sv: 'qualified',
    cr: [C('pass', 'Full home — kitchen, wardrobes, living room. The full package'), C('pass', 'my flat in Undri'), C('pass', 'I want to start the design right away'), C('unclear'), C('pass', 'Yes — my husband and I')] }),
  T16: g({ name: 'Girish Nair', locality: 'Viman Nagar', bhk: '3BHK', prop: 'apartment', mood: 'frustrated', prior: true, sv: 'qualified',
    cr: [C('unclear', null, 'Never said what work they want.'), C('pass', 'my 3BHK in Viman Nagar'), C('unclear'), C('unclear'), C('unclear')] }),
  T17: g({ name: 'Ritu Kapoor', locality: 'Pimple Saudagar', bhk: '3BHK', prop: 'apartment', sqft: 1050, scope: 'full home', ttext: 'done by March', tdate: '2027-03-31', sv: 'qualified',
    cr: [C('pass', 'Kitchen, wardrobes, living room'), C('pass', "I'm Ritu Kapoor from Pimple Saudagar"), C('pass', 'Ideally done by March'), C('unclear'), C('unclear')] }),
  T18: g({ prop: 'coworking pod', sqft: 180, scope: 'lighting, desk, storage', sv: 'unsure',
    cr: [C('pass', 'I have a 180 sq ft pod I want to make look really nice'), C('unclear'), C('unclear'), C('unclear'), C('unclear')] }),
  T19: g({ locality: 'Koregaon Park', prop: 'restaurant', scope: 'restaurant interiors', sv: 'not_a_fit',
    cr: [C('fail', "I'm planning to open a restaurant in Koregaon Park"), C('pass', 'Koregaon Park'), C('unclear'), C('unclear'), C('unclear')] }),
  T20: g({ name: 'Pooja', locality: 'Magarpatta', bhk: '2BHK', prop: 'apartment', sqft: 900, scope: 'kitchen, bedrooms, living room', ttext: 'January start for execution', dm: 'yes', sv: 'qualified',
    cr: [C('pass', 'Kitchen, both bedrooms, living room'), C('pass', 'I have a 2BHK in Magarpatta'), C('pass', 'a January start for execution would be ideal'), C('unclear'), C('pass', 'Yes — my husband and I')] }),
};
// g() stores {s,q,r}; normalise to the Criterion shape
for (const e of Object.values(GOLDEN)) e.criteria = e.criteria.map((c: any) => ({ key: c.key, status: c.status, evidence_quote: c.evidence_quote, reason: c.reason }));

