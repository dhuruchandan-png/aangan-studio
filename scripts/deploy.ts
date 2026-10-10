// npm run deploy  ·  one command from a signed-in Vercel CLI to a live production site.
//   1. links (or creates) the Vercel project "aangan-studio"
//   2. copies every non-empty value from .env.local into Vercel's PRODUCTION environment (values are never printed)
//   3. deploys to production, then sets APP_BASE_URL to the live URL and redeploys once so emails and links are correct
// First run `npx vercel login` (it opens a browser; that is the one step only you can do).
import './load-env';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (args: string[], input?: string) => spawnSync('npx', ['vercel', ...args], { input, encoding: 'utf8', stdio: input === undefined ? ['inherit', 'pipe', 'inherit'] : ['pipe', 'pipe', 'inherit'] });

const who = run(['whoami']);
if (who.status !== 0) { console.error('Not signed in to Vercel. Run:  npx vercel login   then try again.'); process.exit(1); }
console.log('Signed in to Vercel as', who.stdout.trim());

const link = run(['link', '--yes', '--project', 'aangan-studio']);
if (link.status !== 0) { console.error('Could not link the Vercel project.'); process.exit(1); }

const REQUIRED = ['DATABASE_URL', 'LINK_SIGNING_SECRET', 'CRON_SECRET', ...(process.env.DEMO_OPEN === 'true' ? [] : ['GEMINI_API_KEY', 'DASHBOARD_PASSCODE'])];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) { console.error('Fill these in .env.local first:', missing.join(', ')); process.exit(1); }

const keys = readFileSync('.env.local', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1]).filter((k): k is string => !!k && !!process.env[k]);
const setEnv = (k: string, v: string) => { const r = run(['env', 'add', k, 'production', '--force', '--sensitive'], v); if (r.status !== 0) { const r2 = run(['env', 'add', k, 'production', '--force'], v); if (r2.status !== 0) console.error('  could not set', k); } };
for (const k of keys) { if (k === 'APP_BASE_URL' || k === 'DATABASE_URL_UNPOOLED') continue; setEnv(k, process.env[k]!); console.log('  set', k); }

const deploy = () => { const r = run(['--prod', '--yes']); if (r.status !== 0) { console.error('Deploy failed.'); process.exit(1); } return (r.stdout + ' ' + (r.stderr ?? '')).match(/https:\/\/[a-z0-9-]+\.vercel\.app/g)?.pop() ?? ''; };
let url = deploy();
console.log('First deploy:', url);
const prod = process.env.APP_BASE_URL?.startsWith('https://') ? process.env.APP_BASE_URL : url;
setEnv('APP_BASE_URL', prod);
url = deploy();
console.log('\nLive at', prod, '\nNext: set APP_BASE_URL in .env.local to that address, and point the 5-minute cron job (cron-job.org) at <live address>/api/cron/tick.');
