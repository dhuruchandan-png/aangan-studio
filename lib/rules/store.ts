// House Rules store (Gate 1). The agent config is only "live" once a version is approved.
import { db, must } from '../db';
import type { HouseRules } from '../types';
import { defaultRules, DEFAULT_CONFIG, DEFAULT_SERVICE_AREA } from './defaults';

const normalise = (r: any): HouseRules => ({
  ...r,
  service_area: { ...DEFAULT_SERVICE_AREA, ...(r.service_area ?? {}) },
  config: { ...DEFAULT_CONFIG, ...(r.config ?? {}), hours: { ...DEFAULT_CONFIG.hours, ...(r.config?.hours ?? {}) } },
});

export async function listVersions(): Promise<HouseRules[]> {
  const rows = must(await db().from('house_rules').select('*').order('version', { ascending: false }), 'listVersions');
  if (rows.length) return rows.map(normalise);
  // First load: create v1 as a draft from the defaults. Nikhil approves it in the app.
  const v1 = { version: 1, ...defaultRules(), note: 'Initial draft from services.md, qualified.md and the never-say list.' };
  must(await db().from('house_rules').insert(v1), 'seed house_rules');
  return [normalise(v1)];
}

/** The approved version the agent runs on; null until Nikhil approves one. */
export async function liveRules(): Promise<HouseRules | null> {
  const { data } = await db().from('house_rules').select('*').not('approved_at', 'is', null).order('version', { ascending: false }).limit(1);
  return data?.[0] ? normalise(data[0]) : null;
}

/** Rules used by code (hours, thresholds): the live version if approved, else the defaults. */
export async function effectiveRules(): Promise<HouseRules> {
  return (await liveRules()) ?? { version: 0, ...defaultRules() };
}

export async function saveDraft(input: Omit<HouseRules, 'version' | 'approved_at' | 'approved_by'>): Promise<HouseRules> {
  const versions = await listVersions();
  const next = Math.max(...versions.map((v) => v.version)) + 1;
  const row = { version: next, script_text: input.script_text, never_say: input.never_say, service_area: input.service_area, closing_lines: input.closing_lines, config: input.config, note: input.note ?? null };
  must(await db().from('house_rules').insert(row), 'saveDraft');
  return normalise(row);
}

export async function approve(version: number, by: string): Promise<void> {
  const rows = must(await db().from('house_rules').update({ approved_by: by, approved_at: new Date().toISOString() }).eq('version', version).is('approved_at', null).select('version'), 'approve');
  if (!rows.length) throw new Error(`Version ${version} does not exist or is already approved.`);
}
