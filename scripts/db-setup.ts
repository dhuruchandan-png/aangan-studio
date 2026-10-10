// npm run db:setup            create the tables + seed the 14 employees and settings (safe to re-run)
// npm run db:setup -- --demo  also load the 20 sample enquiries (skipped if they are already there)
// Uses DATABASE_URL_UNPOOLED (direct connection; falls back to DATABASE_URL).
import './load-env';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { cleanDbUrl } from '../lib/db';

async function main() {
  const raw = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!raw) { console.error('Set DATABASE_URL (and ideally DATABASE_URL_UNPOOLED) in .env.local first.'); process.exit(1); }
  const demo = process.argv.includes('--demo');
  const c = new Client({ connectionString: cleanDbUrl(raw) });
  await c.connect();
  const host = new URL(raw).host;
  console.log(`Connected to ${host}`);
  try {
    await c.query(readFileSync('db/schema.sql', 'utf8'));
    console.log('✓ schema applied (tables, row-level security, never-delete triggers)');

    const { rows: [d] } = await c.query('select count(*)::int n from designers');
    if (d.n === 0) { await c.query(readFileSync('db/seed.sql', 'utf8')); console.log('✓ seeded 14 employees and the app settings'); }
    else console.log(`– employees already present (${d.n}), seed skipped`);

    if (demo) {
      const { rows: [e] } = await c.query("select count(*)::int n from enquiries where ref like 'DEMO-%'");
      if (e.n === 0) { await c.query(readFileSync('db/demo_seed.sql', 'utf8')); console.log('✓ loaded the 20 sample enquiries (DEMO-01…DEMO-20)'); }
      else console.log(`– sample enquiries already present (${e.n}), skipped`);
    }

    const { rows } = await c.query(`select
      (select count(*)::int from information_schema.tables where table_schema='public') tables,
      (select count(*)::int from designers) employees,
      (select count(*)::int from enquiries) enquiries,
      (select count(*)::int from calls) calls,
      (select count(*)::int from actions_log) audit_rows`);
    console.log('Now in the database:', rows[0]);
  } finally { await c.end(); }
}
main().catch((e) => { console.error('db:setup failed:', e.message); process.exit(1); });
