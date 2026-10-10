import { Markdown } from '@/components/rules/Markdown';
import { RulesWorkbench, type RulesInput } from '@/components/rules/RulesWorkbench';
import { Badge, Label, Page, PageHeader, Sheet } from '@/components/ui';
import { QUALIFIED_MD } from '@/lib/knowledge';
import { RULES_TO_CONFIRM } from '@/lib/rules/defaults';
import { listVersions } from '@/lib/rules/store';
import { fmtDateTime } from '@/lib/time';
import type { HouseRules } from '@/lib/types';

export const dynamic = 'force-dynamic';

const pick = (v: HouseRules): RulesInput => ({ script_text: v.script_text, never_say: v.never_say, service_area: v.service_area, closing_lines: v.closing_lines, config: v.config });

export default async function HouseRulesPage() {
  let versions: HouseRules[] = [];
  let loadError: string | null = null;
  try {
    versions = await listVersions(); // newest first
  } catch (e) {
    loadError = (e as Error).message;
  }

  const header = <PageHeader title="House Rules" plain="What the assistant may and may not say, and Nikhil's sign-off." />;

  if (loadError || versions.length === 0) {
    return (
      <>
        {header}
        <Page>
          <Sheet tone="terracotta">
            <Label>Could not load the House Rules</Label>
            <p className="mt-2 text-sm">{loadError ?? 'No versions found.'} Check the database connection and refresh.</p>
          </Sheet>
        </Page>
      </>
    );
  }

  const latest = versions[0];
  const live = versions.find((v) => !!v.approved_at) ?? null;
  const draft = versions.find((v) => !v.approved_at && v.version > (live?.version ?? 0)) ?? null;
  
  return (
    <>
      {header}
      <Page>
        {/* ---- status */}
        {live ? (
          <Sheet tone="sage">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="indigo">Live</Badge>
              <p className="text-sm"><b>Live: version <span className="num">{live.version}</span></b>, approved by {live.approved_by ?? 'Nikhil'} on <span className="num">{fmtDateTime(live.approved_at)}</span>.</p>
            </div>
            {draft && <p className="mt-2 text-sm text-brass-deep">A newer draft (version <span className="num">{draft.version}</span>) is waiting for approval below. Callers still hear version {live.version} until then.</p>}
          </Sheet>
        ) : (
          <Sheet tone="terracotta">
            <p className="text-sm font-semibold text-terracotta-deep">No version approved yet: the agent must not go live.</p>
            <p className="mt-1 text-sm text-muted">Review the rules below, then approve the draft at the bottom.</p>
          </Sheet>
        )}

        {/* ---- editor, prompt preview, gate */}
        <RulesWorkbench
          initial={pick(latest)}
          latestVersion={latest.version}
          draft={draft ? { version: draft.version, rules: pick(draft) } : null}
          live={live ? { version: live.version, rules: pick(live) } : null}
        />

        {/* ---- version history */}
        <Sheet>
          <Label>Version history</Label>
          <ul className="mt-2 divide-y divide-clay">
            {versions.map((v) => (
              <li key={v.version} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 text-sm">
                <span className="num w-10 font-semibold">v{v.version}</span>
                {v.approved_at
                  ? <span className="inline-flex items-center gap-1 text-sage-deep"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8.5l3.2 3L13 4.5" /></svg>Approved by {v.approved_by ?? '—'} · <span className="num">{fmtDateTime(v.approved_at)}</span></span>
                  : <span className="inline-flex items-center gap-1 text-brass-deep"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M8 4v4l2.5 1.5" /></svg>Draft · not approved</span>}
                <span className="text-muted">{v.note ?? 'No note'}</span>
                {v.created_at && <span className="num ml-auto text-xs text-muted">saved {fmtDateTime(v.created_at)}</span>}
              </li>
            ))}
          </ul>
        </Sheet>

        {/* ---- rubric + rules to confirm */}
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <Sheet>
            <Label>Nikhil&apos;s rubric · qualified.md · read only</Label>
            <Markdown source={QUALIFIED_MD} />
          </Sheet>
          <Sheet>
            <Label>Rules to confirm</Label>
            <p className="mt-1 text-sm text-muted">Judgement calls the assistant makes today. Tell us if any should change.</p>
            <ul className="mt-3 space-y-3">
              {RULES_TO_CONFIRM.map((r) => (
                <li key={r.key} className="rounded border border-brass/50 bg-[#F5EBD2] p-3 text-sm text-brass-deep">
                  <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M6 6a2 2 0 1 1 2.8 1.8C8.3 8.1 8 8.5 8 9.2M8 12h.01" /></svg>To confirm</span>
                  {r.text}
                </li>
              ))}
            </ul>
          </Sheet>
        </div>

      </Page>
    </>
  );
}
