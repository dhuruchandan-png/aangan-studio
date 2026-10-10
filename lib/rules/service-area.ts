import { DEFAULT_SERVICE_AREA } from './defaults';
import type { HouseRules } from '../types';

export type AreaClass = 'in' | 'adjoining' | 'out' | 'unknown';

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
const hit = (text: string, term: string) => text.includes(norm(term));

// Alternate spellings people actually say.
const ALIASES: Record<string, string[]> = {
  lonavala: ['lonavla'],
  'pimple saudagar': ['pimple saudager'],
  'koregaon park': ['koregaon pk'],
  'nanded city': ['nanded'],
};
const OUT_EXTRA = ['nagpur', 'thane', 'navi mumbai', 'satara', 'kolhapur', 'solapur', 'ahmednagar', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'goa', 'ahmedabad', 'kolkata', 'indore', 'surat', 'nasik'];

/** Classify a locality string. Only used to override the model when it is unambiguous. */
export function classifyLocality(
  locality: string | null | undefined,
  area: HouseRules['service_area'] = DEFAULT_SERVICE_AREA,
): { cls: AreaClass; matched: string | null } {
  if (!locality || !locality.trim()) return { cls: 'unknown', matched: null };
  const t = norm(locality);
  const withAliases = (terms: string[]) => terms.flatMap((x) => [x, ...(ALIASES[x.toLowerCase()] ?? [])]);
  for (const x of withAliases([...area.not_served, ...OUT_EXTRA])) if (hit(t, x)) return { cls: 'out', matched: x };
  for (const x of withAliases([...area.pune, ...area.pcmc])) if (hit(t, x)) return { cls: 'in', matched: x };
  for (const x of withAliases(area.adjoining)) if (hit(t, x)) return { cls: 'adjoining', matched: x };
  return { cls: 'unknown', matched: null };
}
