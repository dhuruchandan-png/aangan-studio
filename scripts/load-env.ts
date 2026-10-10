// Tiny .env.local loader for the scripts (Next loads it for the app itself).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

for (const f of ['.env.local', '.env']) {
  const p = join(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (v.startsWith('#')) v = ''; // `KEY=   # TODO: ...` means empty
    if (!/^["']/.test(v)) v = v.replace(/\s+#.*$/, '');
    v = v.replace(/^["']|["']$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
