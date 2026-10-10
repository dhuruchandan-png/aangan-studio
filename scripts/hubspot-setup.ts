// npm run hubspot:setup · one-time: creates the custom properties and maps our stages onto your existing deal pipeline.
// Safe to re-run. Creates no contacts or deals.
import './load-env';
import { ensureProperties, hs, resolveConfig } from '../lib/crm/hubspot';
import { getConfig } from '../lib/crm/sync';
import { DEFAULT_STAGE_LABELS } from '../lib/crm/map';

async function main() {
  const me = await hs('GET', '/crm/v3/owners?limit=500');
  if (!me.ok) { console.error('HubSpot rejected the token:', me.error); process.exit(1); }
  console.log(`✓ token works · ${me.data.results.length} HubSpot user(s): ${me.data.results.map((o: any) => o.email).join(', ')}`); // eslint-disable-line @typescript-eslint/no-explicit-any

  const props = await ensureProperties();
  console.log(`✓ custom properties: ${props.created.length} created, ${props.existed} already there`);
  for (const f of props.failed) console.log(`  ✗ ${f.name}: ${f.error}`);
  if (props.failed.length) console.log('  → the key probably lacks the "schemas" scopes (crm.schemas.deals.write / crm.schemas.contacts.write). Add them to the service key, then re-run.');

  const probe = await resolveConfig();
  if (!probe.cfg) { console.error('✗ could not read the deal pipeline:', probe.error); process.exit(1); }
  const { cfg } = await getConfig(true);
  if (!cfg) { console.error('✗ could not save the pipeline mapping'); process.exit(1); }
  console.log(`✓ pipeline "${cfg.pipelineId}" · portal ${cfg.portalId ?? '(not readable; deal links will be omitted)'}`);
  for (const [k, label] of Object.entries(DEFAULT_STAGE_LABELS)) {
    const got = cfg.stageLabels[k as keyof typeof cfg.stageLabels];
    console.log(`   ${k.padEnd(15)} → ${got}${got.toLowerCase() === label.toLowerCase() ? '' : `  (fallback: no stage named "${label}")`}`);
  }
  console.log('\nDone. "Deal Won" is never set automatically; a person decides that in HubSpot.');
  process.exit(props.failed.length ? 2 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
