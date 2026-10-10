// npm run hubspot:test · talks to your REAL HubSpot with throw-away records, checks them, and archives them again.
// It creates 1 contact + 2 deals + notes labelled TEST-xxxx, proves a repeat caller does not make a duplicate contact, then cleans up.
import './load-env';
import assert from 'node:assert/strict';
import { archive, ensureProperties, hs, resolveConfig, syncLead } from '../lib/crm/hubspot';
import type { CrmLead } from '../lib/crm/map';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const step = async (name: string, fn: () => Promise<void>) => { try { await fn(); n++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n     ', (e as Error).message); process.exitCode = 1; throw e; } };

const base: CrmLead = {
  kind: 'lead', ref: 'TEST-0001', name: 'Aangan Test', phone: '+919000099999', locality: 'Kothrud', propertyType: 'apartment', bhk: '3BHK', carpetSqft: 1400,
  scope: 'full home', timeline: 'done by March', source: 'referral', referral: 'Test Referrer', verdict: 'qualified', status: 'routed', priority: true, priorityReason: 'integration self-test',
  note: 'Integration self-test. Safe to delete.\nWants the whole flat redone.', stillUnknown: ['style preference'], designerName: 'Test Designer', designerEmail: 'dhuruchandan@gmail.com',
  dashboardUrl: 'https://example.invalid/brief/TEST-0001', callAtIso: new Date().toISOString(), sample: true,
};

async function main() {
  console.log('\nHubSpot self-test (real account; records are removed at the end)');
  const created: { contacts: Set<string>; deals: Set<string>; notes: Set<string> } = { contacts: new Set(), deals: new Set(), notes: new Set() };
  let cfg!: NonNullable<Awaited<ReturnType<typeof resolveConfig>>['cfg']>;
  let r1!: Awaited<ReturnType<typeof syncLead>>;
  try {
    await step('properties exist (or are created) and the pipeline resolves', async () => {
      const p = await ensureProperties(); assert.equal(p.failed.length, 0, `property creation failed: ${JSON.stringify(p.failed)}`);
      const c = await resolveConfig(); assert.ok(c.cfg, c.error); cfg = c.cfg!;
      assert.ok(cfg.stages.routed && cfg.stages.accepted && cfg.stages.lost, 'stage ids resolved');
    });
    await step('first sync creates a contact, a deal in the right stage, an owner, and links them', async () => {
      r1 = await syncLead(base, {}, cfg);
      assert.ok(r1.ok, r1.error); assert.ok(r1.createdContact && r1.createdDeal && r1.contactId && r1.dealId);
      created.contacts.add(r1.contactId!); created.deals.add(r1.dealId!); r1.noteIds.forEach((x) => created.notes.add(x));
      const d = await hs('GET', `/crm/v3/objects/deals/${r1.dealId}?properties=dealname,dealstage,pipeline,aangan_ref,aangan_verdict,aangan_priority,hubspot_owner_id&associations=contacts,notes`);
      assert.ok(d.ok, d.error);
      assert.equal(d.data.properties.dealstage, cfg.stages.routed); assert.equal(d.data.properties.aangan_ref, 'TEST-0001');
      assert.match(d.data.properties.dealname, /TEST-0001 · Aangan Test · Kothrud/); assert.match(d.data.properties.aangan_priority, /^Yes/);
      assert.ok(d.data.properties.hubspot_owner_id, 'owner set from the designer email');
      assert.equal(d.data.associations?.contacts?.results?.[0]?.id, r1.contactId, 'deal is linked to the contact');
      assert.ok((d.data.associations?.notes?.results ?? []).length >= 1, 'brief note attached');
      for (const x of d.data.associations?.notes?.results ?? []) created.notes.add(String(x.id));
      const c = await hs('GET', `/crm/v3/objects/contacts/${r1.contactId}?properties=firstname,lastname,phone,city,aangan_last_ref`);
      assert.equal(c.data.properties.firstname, 'Aangan'); assert.equal(c.data.properties.lastname, 'Test'); assert.equal(c.data.properties.city, 'Kothrud');
    });
    await step('a later action updates the SAME deal (stage moves, no duplicate) and adds a timeline note', async () => {
      const r2 = await syncLead({ ...base, status: 'accepted' }, { contactId: r1.contactId, dealId: r1.dealId }, cfg, { name: 'accept' });
      assert.ok(r2.ok, r2.error); assert.equal(r2.createdDeal, false); assert.equal(r2.createdContact, false); assert.equal(r2.dealId, r1.dealId); r2.noteIds.forEach((x) => created.notes.add(x));
      const d = await hs('GET', `/crm/v3/objects/deals/${r1.dealId}?properties=dealstage,aangan_status&associations=notes`);
      assert.equal(d.data.properties.dealstage, cfg.stages.accepted); assert.equal(d.data.properties.aangan_status, 'accepted');
      const notes = d.data.associations?.notes?.results ?? []; assert.ok(notes.length >= 2, `expected 2+ notes, got ${notes.length}`);
      for (const x of notes) created.notes.add(String(x.id));
    });
    await step('a repeat caller (lost link) finds the existing contact by phone: no duplicate contact', async () => {
      let hit = 0;
      for (let i = 0; i < 12 && !hit; i++) { await sleep(3000); const s = await hs('POST', '/crm/v3/objects/contacts/search', { filterGroups: [{ filters: [{ propertyName: 'hs_searchable_calculated_phone_number', operator: 'EQ', value: '9000099999' }] }], limit: 5 }); hit = s.data?.total ?? 0; }
      assert.equal(hit, 1, 'HubSpot search should find exactly the one test contact (it can take ~30 s to index a new contact)');
      const r3 = await syncLead({ ...base, ref: 'TEST-0002', status: 'consult_booked' }, {}, cfg);
      assert.ok(r3.ok, r3.error); created.deals.add(r3.dealId!); r3.noteIds.forEach((x) => created.notes.add(x));
      assert.equal(r3.createdContact, false, 'must reuse the contact, not create another'); assert.equal(r3.contactId, r1.contactId);
      const d = await hs('GET', `/crm/v3/objects/deals/${r3.dealId}?properties=dealstage&associations=notes`);
      assert.equal(d.data.properties.dealstage, cfg.stages.consult_booked);
      for (const x of d.data.associations?.notes?.results ?? []) created.notes.add(String(x.id));
    });
    await step('a not-a-fit lead lands in the lost stage; an existing client gets a note, not a deal', async () => {
      const lost = await syncLead({ ...base, ref: 'TEST-0003', verdict: 'not_a_fit', status: 'closed' }, {}, cfg);
      assert.ok(lost.ok, lost.error); created.deals.add(lost.dealId!); lost.noteIds.forEach((x) => created.notes.add(x)); assert.equal(lost.stageId, cfg.stages.lost);
      const ex = await syncLead({ ...base, ref: 'TEST-0004', kind: 'existing_client', verdict: 'escalate' }, { contactId: r1.contactId }, cfg);
      assert.ok(ex.ok, ex.error); assert.equal(ex.dealId, null, 'no deal for a complaint'); ex.noteIds.forEach((x) => created.notes.add(x));
    });
  } finally {
    console.log('  … cleaning up the test records');
    for (const id of created.notes) await archive('notes', id);
    for (const id of created.deals) await archive('deals', id);
    for (const id of created.contacts) await archive('contacts', id);
    console.log(`  ${created.contacts.size} contact, ${created.deals.size} deals, ${created.notes.size} notes archived`);
  }
  console.log(`\n${n} HubSpot checks passed.`);
}
main().catch(() => process.exit(1));
