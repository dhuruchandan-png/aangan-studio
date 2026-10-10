import { buildAgentConfig } from '@/lib/agent-config';
import { secretOk } from '@/lib/auth';
import { liveRules } from '@/lib/rules/store';

export const runtime = 'nodejs';

/** Vaani (or you) can fetch the APPROVED agent config. Until Nikhil approves House Rules, there is none. */
export async function GET(req: Request) {
  if (!secretOk(req)) return Response.json({ error: 'bad secret' }, { status: 401 });
  const rules = await liveRules();
  if (!rules) return Response.json({ error: 'House Rules are not approved yet (Gate 1). The agent must not go live.' }, { status: 409 });
  return Response.json(buildAgentConfig(rules).json);
}
