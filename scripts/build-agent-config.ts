// npm run agent-config  → voice/agent-config.md + voice/agent-config.json (paste into Vaani if it has no config API).
// Uses the default (draft) rules. The House Rules screen shows and exports the APPROVED version.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildAgentConfig } from '../lib/agent-config';
import { defaultRules } from '../lib/rules/defaults';

const rules = { version: 1, ...defaultRules() };
const { json, md } = buildAgentConfig(rules);
mkdirSync('voice', { recursive: true });
writeFileSync('voice/agent-config.md', md);
writeFileSync('voice/agent-config.json', JSON.stringify(json, null, 2));
console.log('Wrote voice/agent-config.md and voice/agent-config.json (draft v1)');
