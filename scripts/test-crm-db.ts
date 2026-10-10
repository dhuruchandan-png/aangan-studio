// npm run hubspot:e2e · the database-linked sync, end to end, on ONE sample enquiry (DEMO-01) against your real HubSpot + Neon.
// Everything it creates in HubSpot is archived again, and the crm_links row is reset (rows are never deleted).
import './load-env';
import assert from 'node:assert/strict';
import { archive, hs } from '../lib/crm/hubspot';
import { syncEnquiry } from '../lib/crm/sync';
import { db, must, rawQuery } from '../lib/db';

let n = 0;
const ok = async (name: string, fn: () => Promise<void>) => { try { await fn(); n++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n     ', (e as Error).message); process.exitCode = 1; } };

async function main() {
  console.log('\nHubSpot sync, database-linked (sample enquiry DEMO-01)');
  const ids = { deal: '', contact: '', notes: new Set<string>() };
  try {
    await ok('sample / rehearsal enquiries are NOT sent unless forced', async () => {
      const r = await syncEnquiry('DEMO-01');
      assert.equal(r.ok, true); assert.match(r.skipped ?? '', /sample/);
      assert.equal((await rawQuery("select count(*)::int n from crm_links")).rows[0].n, 0, 'nothing recorded');
    });
    await ok('forced sync builds the lead from the database and creates contact + deal', async () => {
      const r = await syncEnquiry('DEMO-01', { force: true });
      assert.ok(r.ok, r.error); assert.ok(r.dealId && r.contactId); ids.deal = r.dealId!; ids.contact = r.contactId!;
      const d = await hs('GET', `/crm/v3/objects/deals/${ids.deal}?properties=dealname,dealstage,aangan_ref,aangan_verdict,aangan_locality,aangan_handoff_note&associations=notes,contacts`);
      assert.ok(d.ok, d.error);
      assert.match(d.data.properties.dealname, /^DEMO-01 · Priya · Kothrud/); assert.equal(d.data.properties.aangan_ref, 'DEMO-01'); assert.equal(d.data.properties.aangan_verdict, 'qualified');
      assert.match(d.data.properties.aangan_handoff_note, /still the builder finish/);
      for (const x of d.data.associations?.notes?.results ?? []) ids.notes.add(String(x.id));
      assert.equal(d.data.associations?.contacts?.results?.[0]?.id, ids.contact);
      const c = await hs('GET', `/crm/v3/objects/contacts/${ids.contact}?properties=firstname,phone`);
      assert.equal(c.data.properties.firstname, 'Priya'); assert.equal(c.data.properties.phone, '+919000000001');
    });
    await ok('the HubSpot ids are remembered in crm_links', async () => {
      const row = must(await db().from('crm_links').select('*').single(), 'link');
      assert.equal(row.deal_id, ids.deal); assert.equal(row.contact_id, ids.contact); assert.equal(row.error, null); assert.ok(row.synced_at);
    });
    await ok('a second sync (an action happened) updates the SAME deal and adds a timeline note', async () => {
      const r = await syncEnquiry('DEMO-01', { force: true, event: 'book', detail: 'Fri 5 Sep · 11:00' });
      assert.ok(r.ok, r.error); assert.equal(r.dealId, ids.deal, 'same deal, not a new one');
      const d = await hs('GET', `/crm/v3/objects/deals/${ids.deal}?associations=notes`);
      const notes = d.data.associations?.notes?.results ?? []; assert.ok(notes.length >= 2, `expected a timeline note, have ${notes.length}`);
      for (const x of notes) ids.notes.add(String(x.id));
    });
  } finally {
    for (const id of ids.notes) await archive('notes', id);
    if (ids.deal) await archive('deals', ids.deal);
    if (ids.contact) await archive('contacts', ids.contact);
    await rawQuery("update crm_links set contact_id = null, deal_id = null, synced_at = null, stage_id = null, last_event = 'test reset', error = null, attempts = 0");
    console.log('  … HubSpot records archived, crm_links reset');
  }
  console.log(`\n${n} database-linked HubSpot checks passed.${process.exitCode ? ' (some failed)' : ''}`);
  process.exit(process.exitCode ?? 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
