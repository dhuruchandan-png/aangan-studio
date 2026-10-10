// npm run db:test · integration test of the Neon data layer against the REAL database in DATABASE_URL.
// Touches only throw-away rows (app_settings / job_runs keys starting "test_"), which it removes at the end.
import './load-env';
import assert from 'node:assert/strict';
import { db, getSetting, must, rawQuery, setSetting } from '../lib/db';

let n = 0;
const ok = async (name: string, fn: () => Promise<void>) => { try { await fn(); n++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n    ', (e as Error).message); process.exitCode = 1; } };

async function main() {
  console.log('\nNeon data layer');
  await ok('select with eq / in / order / limit returns plain rows', async () => {
    const r = await db().from('designers').select('id, name, specialities').in('name', ['Priya Kulkarni', 'Rhea Shah']).order('name').limit(5);
    assert.equal(r.error, null); assert.equal(r.data.length, 2); assert.equal(r.data[0].name, 'Priya Kulkarni');
    assert.ok(Array.isArray(r.data[0].specialities), 'text[] arrives as an array');
  });
  await ok('values arrive in the shapes the app expects (ISO timestamps, numbers, date strings, parsed JSON, uuid arrays)', async () => {
    const e = must(await db().from('enquiries').select('*').eq('ref', 'DEMO-01').single(), 'enquiry');
    assert.match(e.first_contact_at, /^\d{4}-\d{2}-\d{2}T.*Z$/); assert.equal(typeof e.priority, 'boolean');
    assert.ok(Array.isArray(e.merged_call_ids) && e.merged_call_ids.length === 1, 'uuid[] ok');
    const c = must(await db().from('calls').select('duration_sec, ring_to_answer_sec, cost_inr, transcript').eq('enquiry_id', e.id).single(), 'call');
    assert.equal(typeof c.duration_sec, 'number'); assert.equal(typeof c.ring_to_answer_sec, 'number'); assert.equal(typeof c.cost_inr, 'number');
    assert.ok(Array.isArray(c.transcript) && c.transcript[0].speaker, 'jsonb array parsed');
    const l = must(await db().from('cost_ledger').select('date, amount_inr').eq('enquiry_id', e.id).limit(1), 'ledger');
    assert.match(l[0].date, /^\d{4}-\d{2}-\d{2}$/); assert.equal(typeof l[0].amount_inr, 'number');
  });
  await ok('is / not / gte / lt / neq / ilike filters', async () => {
    const a = must(await db().from('enquiries').select('ref').is('assigned_designer_id', null).not('verdict', 'is', null).limit(50), 'a');
    assert.ok(a.length > 0);
    const b = must(await db().from('calls').select('id').gte('started_at', '2026-10-01T00:00:00Z').lt('started_at', '2026-10-10T00:00:00Z'), 'b');
    assert.ok(b.length >= 8, `expected October sample calls, got ${b.length}`);
    const c = must(await db().from('designers').select('name').ilike('name', 'priya%'), 'c');
    assert.equal(c.length, 1);
    const d = must(await db().from('enquiries').select('ref').neq('verdict', 'qualified').eq('simulated', true), 'd');
    assert.ok(d.length > 0 && d.length < 20);
    const e = must(await db().from('enquiries').select('ref').in('simulated', [true, false]), 'e');
    assert.equal(e.length >= 20, true);
  });
  await ok('count with head returns just the number', async () => {
    const r = await db().from('enquiries').select('id', { count: 'exact', head: true }).in('simulated', [true, false]);
    assert.equal(r.error, null); assert.equal(r.data, null); assert.ok((r.count ?? 0) >= 20);
  });
  await ok('single / maybeSingle behave like before', async () => {
    assert.equal((await db().from('enquiries').select('ref').eq('ref', 'NOPE-1').maybeSingle()).data, null);
    const bad = await db().from('enquiries').select('ref').eq('ref', 'NOPE-1').single();
    assert.ok(bad.error && bad.error.code === 'PGRST116');
    const many = await db().from('enquiries').select('ref').maybeSingle();
    assert.ok(many.error, 'more than one row is an error for maybeSingle');
  });
  await ok('upsert + update + select: JSON values of every shape round-trip', async () => {
    await setSetting('test_obj', { a: 1, b: ['x', 'y'] });
    await setSetting('test_arr', [1, 2, { z: true }]);
    await setSetting('test_str', 'hello');
    await setSetting('test_num', 1100000);
    assert.deepEqual(await getSetting('test_obj', null), { a: 1, b: ['x', 'y'] });
    assert.deepEqual(await getSetting('test_arr', null), [1, 2, { z: true }]);
    assert.equal(await getSetting('test_str', ''), 'hello'); assert.equal(await getSetting('test_num', 0), 1100000);
    await setSetting('test_num', 7);
    assert.equal(await getSetting('test_num', 0), 7, 'upsert overwrites');
    assert.equal(await getSetting('test_missing', 'dflt'), 'dflt');
    const up = await db().from('app_settings').update({ value: { v: 2 } }).eq('key', 'test_obj').select('key');
    assert.equal(up.error, null); assert.equal(up.data.length, 1);
  });
  await ok('insert returns the new row; errors come back as { error } (never thrown)', async () => {
    const r = await db().from('job_runs').insert({ job: 'test_job', run_key: 'k1' }).select('job, run_key').single();
    assert.equal(r.error, null); assert.equal(r.data.run_key, 'k1');
    const dup = await db().from('job_runs').insert({ job: 'test_job', run_key: 'k1' });
    assert.ok(dup.error && dup.error.code === '23505', 'unique violation is reported with its code (the cron "once" lock relies on it)');
    const nocol = await db().from('job_runs').select('nope');
    assert.ok(nocol.error);
  });
  await ok('rpc: next_enquiry_ref hands out SIM refs', async () => {
    const r = await db().rpc('next_enquiry_ref', { sim: true });
    assert.equal(r.error, null); assert.match(r.data, /^SIM-\d{4}$/);
  });
  await ok('the "never delete rows" rule is enforced by the database', async () => {
    await assert.rejects(() => rawQuery("delete from enquiries where ref = 'DEMO-01'"), /never deleted/);
  });
  await ok('identifiers are validated (no SQL injection through a column or table name)', async () => {
    assert.throws(() => db().from('designers; drop table designers'));
    const r = await db().from('designers').select('name').eq('name; drop table designers', 'x');
    assert.ok(r.error, 'unsafe column names are rejected');
    assert.equal((await db().from('designers').select('id', { count: 'exact', head: true })).count, 14);
  });
  await ok('values are parameterised (a quote in data cannot break out)', async () => {
    const r = await db().from('designers').select('id').eq('name', "x' or '1'='1");
    assert.equal(r.error, null); assert.equal(r.data.length, 0);
  });
  await rawQuery("delete from app_settings where key like 'test_%'");
  await rawQuery("delete from job_runs where job = 'test_job'");
  console.log(`\n${n} database checks passed.${process.exitCode ? ' (some failed)' : ''}`);
  process.exit(process.exitCode ?? 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
