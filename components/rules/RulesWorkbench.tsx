'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAgentPrompt, PRICE_LINE } from '@/lib/rules/defaults';
import type { HouseRules, RulesConfig } from '@/lib/types';
import { Badge, Label, Sheet, cx } from '@/components/ui';

export type RulesInput = Pick<HouseRules, 'script_text' | 'never_say' | 'service_area' | 'closing_lines' | 'config'>;

interface Props {
  /** Latest saved version: the editor starts from this and "unsaved" is measured against it. */
  initial: RulesInput;
  latestVersion: number;
  /** Latest version that is still a draft (null if the newest version is approved). */
  draft: { version: number; rules: RulesInput } | null;
  /** Live (approved) version content, for "what changed". */
  live: { version: number; rules: RulesInput } | null;
}

const CLOSING_KEYS: { key: string; label: string; hint?: string }[] = [
  { key: 'qualified_hours', label: 'Qualified, during designer hours' },
  { key: 'qualified_after', label: 'Qualified, after hours or Sunday', hint: 'Uses {{callback_time}}' },
  { key: 'unsure', label: 'Unsure', hint: 'Uses {{callback_time}}' },
  { key: 'not_a_fit', label: 'Not a fit' },
  { key: 'price_line', label: 'Price question: the approved line' },
  { key: 'price_push_line', label: 'Price question: if they push again' },
  { key: 'budget_low_line', label: 'Budget far too low' },
  { key: 'existing_client', label: 'Existing client with a problem' },
];
const DAY_LABELS: { n: number; label: string }[] = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' }, { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 0, label: 'Sun' },
];

const lines = (s: string): string[] => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const toText = (xs: string[] | undefined): string => (xs ?? []).join('\n');

/** JSON with sorted keys so Postgres jsonb key reordering never looks like a change. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Plain-words list of what differs between two rule sets. */
function whatChanged(a: RulesInput, b: RulesInput): string[] {
  const out: string[] = [];
  if (a.script_text !== b.script_text) out.push('The script wording');
  if (stable(a.never_say) !== stable(b.never_say)) out.push('The never-say list');
  if (stable(a.service_area) !== stable(b.service_area)) out.push('The service area');
  for (const { key, label } of CLOSING_KEYS) {
    if ((a.closing_lines?.[key] ?? '') !== (b.closing_lines?.[key] ?? '')) out.push(`Closing line: ${label}`);
  }
  const ca = a.config, cb = b.config;
  if (ca.afterhours_callback_by !== cb.afterhours_callback_by) out.push('After-hours callback time');
  if (ca.callback_in_hours_min !== cb.callback_in_hours_min) out.push('In-hours callback promise');
  if (stable(ca.hours) !== stable(cb.hours)) out.push('Designer hours');
  if (ca.min_commercial_sqft !== cb.min_commercial_sqft) out.push('Commercial minimum size');
  if (ca.min_lead_weeks !== cb.min_lead_weeks) out.push('Minimum lead time');
  return out;
}

export function RulesWorkbench({ initial, latestVersion, draft, live }: Props) {
  const router = useRouter();
  const [script, setScript] = useState(initial.script_text);
  const [neverSay, setNeverSay] = useState(toText(initial.never_say));
  const [pune, setPune] = useState(toText(initial.service_area.pune));
  const [pcmc, setPcmc] = useState(toText(initial.service_area.pcmc));
  const [adjoining, setAdjoining] = useState(toText(initial.service_area.adjoining));
  const [notServed, setNotServed] = useState(toText(initial.service_area.not_served));
  const [closing, setClosing] = useState<Record<string, string>>({ ...initial.closing_lines });
  const [cfg, setCfg] = useState<RulesConfig>({ ...initial.config, hours: { ...initial.config.hours, days: [...initial.config.hours.days] } });
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [confirmed, setConfirmed] = useState(false);
  const [by, setBy] = useState('Nikhil Deshpande');
  const [approving, setApproving] = useState(false);
  const [approveMsg, setApproveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const current: RulesInput = useMemo(() => ({
    script_text: script,
    never_say: lines(neverSay),
    service_area: { pune: lines(pune), pcmc: lines(pcmc), adjoining: lines(adjoining), not_served: lines(notServed) },
    closing_lines: closing,
    config: cfg,
  }), [script, neverSay, pune, pcmc, adjoining, notServed, closing, cfg]);

  const dirty = stable(current) !== stable(initial);
  const prompt = useMemo(() => {
    try { return buildAgentPrompt(current); } catch { return ''; }
  }, [current]);
  const priceOk = prompt.includes(PRICE_LINE);

  const changes = draft ? (live ? whatChanged(live.rules, draft.rules) : null) : null;

  const setNum = (k: 'min_commercial_sqft' | 'min_lead_weeks' | 'callback_in_hours_min', v: string) => setCfg((c) => ({ ...c, [k]: Number(v) || 0 }));
  const toggleDay = (n: number) => setCfg((c) => {
    const days = c.hours.days.includes(n) ? c.hours.days.filter((x) => x !== n) : [...c.hours.days, n];
    return { ...c, hours: { ...c.hours, days: days.sort((a, b) => a - b) } };
  });

  const saveDraft = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch('/api/house-rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', rules: current, note: note.trim() || null }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; version?: number };
      if (!res.ok || j.error) setSaveMsg({ ok: false, text: j.error ?? 'Could not save the draft.' });
      else { setSaveMsg({ ok: true, text: `Saved as draft version ${j.version}. It is not live until you approve it below.` }); setNote(''); setConfirmed(false); router.refresh(); }
    } catch {
      setSaveMsg({ ok: false, text: 'Could not reach the server. Try again.' });
    }
    setSaving(false);
  };

  const approve = async () => {
    if (!draft) return;
    setApproving(true); setApproveMsg(null);
    try {
      const res = await fetch('/api/house-rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve', version: draft.version, by: by.trim() || 'Nikhil Deshpande' }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.error) setApproveMsg({ ok: false, text: j.error ?? 'Could not approve.' });
      else { setApproveMsg({ ok: true, text: `Version ${draft.version} is approved and live. The agent may now go on the line.` }); setConfirmed(false); router.refresh(); }
    } catch {
      setApproveMsg({ ok: false, text: 'Could not reach the server. Try again.' });
    }
    setApproving(false);
  };

  const ta = 'field mt-1 leading-relaxed';

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ editor */}
      <Sheet>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>The rules · starts from version {latestVersion}</Label>
          {dirty ? <Badge tone="brass">Unsaved changes</Badge> : <span className="text-xs text-muted">Matches the saved version</span>}
        </div>

        <div className="mt-5">
          <label htmlFor="never" className="text-sm font-semibold">Never-say list</label>
          <p className="text-xs text-muted">One per line.</p>
          <textarea id="never" className={ta} rows={8} value={neverSay} onChange={(e) => setNeverSay(e.target.value)} />
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">Service area</legend>
          <p className="text-xs text-muted">One locality per line.</p>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <div><label htmlFor="sa-pune" className="annot">Pune</label><textarea id="sa-pune" className={ta} rows={6} value={pune} onChange={(e) => setPune(e.target.value)} /></div>
            <div><label htmlFor="sa-pcmc" className="annot">PCMC</label><textarea id="sa-pcmc" className={ta} rows={6} value={pcmc} onChange={(e) => setPcmc(e.target.value)} /></div>
            <div>
              <label htmlFor="sa-adj" className="annot">Adjoining Pune areas</label>
              <p className="text-xs text-muted">Accepted, but flagged for the designer to confirm.</p>
              <textarea id="sa-adj" className={ta} rows={6} value={adjoining} onChange={(e) => setAdjoining(e.target.value)} />
            </div>
            <div><label htmlFor="sa-not" className="annot">Not served</label><textarea id="sa-not" className={ta} rows={6} value={notServed} onChange={(e) => setNotServed(e.target.value)} /></div>
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">Closing lines</legend>
          <p className="text-xs text-muted">
            What the agent says to end the call. <span className="num">{'{{name}}'}</span> becomes the caller&apos;s name; <span className="num">{'{{callback_time}}'}</span> becomes the after-hours callback time below.
          </p>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            {CLOSING_KEYS.map(({ key, label, hint }) => (
              <div key={key}>
                <label htmlFor={`cl-${key}`} className="annot">{label}<span className="num ml-1 normal-case tracking-normal opacity-70">({key})</span></label>
                {hint && <p className="text-xs text-muted">{hint}</p>}
                <textarea id={`cl-${key}`} className={ta} rows={4} value={closing[key] ?? ''} onChange={(e) => setClosing((c) => ({ ...c, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">Callback promises and thresholds</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><label htmlFor="cfg-ah" className="annot">After-hours callback by</label><input id="cfg-ah" type="time" className="field num mt-1" value={cfg.afterhours_callback_by} onChange={(e) => setCfg((c) => ({ ...c, afterhours_callback_by: e.target.value }))} /></div>
            <div><label htmlFor="cfg-min" className="annot">In-hours callback within (minutes)</label><input id="cfg-min" type="number" min={5} className="field num mt-1" value={cfg.callback_in_hours_min} onChange={(e) => setNum('callback_in_hours_min', e.target.value)} /></div>
            <div><label htmlFor="cfg-sq" className="annot">Commercial minimum (sq ft)</label><input id="cfg-sq" type="number" min={0} className="field num mt-1" value={cfg.min_commercial_sqft} onChange={(e) => setNum('min_commercial_sqft', e.target.value)} /></div>
            <div><label htmlFor="cfg-wk" className="annot">Minimum lead time (weeks)</label><input id="cfg-wk" type="number" min={0} className="field num mt-1" value={cfg.min_lead_weeks} onChange={(e) => setNum('min_lead_weeks', e.target.value)} /></div>
            <div><label htmlFor="cfg-hs" className="annot">Designer hours start</label><input id="cfg-hs" type="time" className="field num mt-1" value={cfg.hours.start} onChange={(e) => setCfg((c) => ({ ...c, hours: { ...c.hours, start: e.target.value } }))} /></div>
            <div><label htmlFor="cfg-he" className="annot">Designer hours end</label><input id="cfg-he" type="time" className="field num mt-1" value={cfg.hours.end} onChange={(e) => setCfg((c) => ({ ...c, hours: { ...c.hours, end: e.target.value } }))} /></div>
          </div>
          <div className="mt-3">
            <div className="annot">Designer days</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DAY_LABELS.map((d) => (
                <label key={d.n} className={cx('flex min-h-[40px] min-w-[48px] cursor-pointer items-center justify-center rounded border px-2 text-sm font-medium', cfg.hours.days.includes(d.n) ? 'border-terracotta bg-[#F7E3DA] text-terracotta-deep' : 'border-clay bg-white text-muted')}>
                  <input type="checkbox" className="sr-only" checked={cfg.hours.days.includes(d.n)} onChange={() => toggleDay(d.n)} />{d.label}
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <div className="mt-5 border-t border-clay pt-4">
          <label htmlFor="note" className="text-sm font-semibold">A note for this version <span className="font-normal text-muted">(optional)</span></label>
          <input id="note" className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Raised the commercial minimum to 600 sq ft" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={saving || !dirty} onClick={saveDraft}>{saving ? 'Saving…' : 'Save as new draft'}</button>
            {!dirty && <span className="text-xs text-muted">Change something above to save a new draft.</span>}
          </div>
          <p aria-live="polite" role="status" className={cx('mt-2 min-h-[1.25rem] text-sm', saveMsg?.ok ? 'text-sage-deep' : 'text-alert')}>{saveMsg?.text ?? ''}</p>
        </div>
      </Sheet>

      {/* ------------------------------------------------ Gate 1 */}
      <Sheet tone={draft ? 'terracotta' : undefined}>
        <Label>Gate 1 · Approve and publish</Label>
        {!draft ? (
          <p className="mt-2 text-sm text-muted">There is no draft waiting. Version {latestVersion} is already approved. Any change you save creates a new draft that must be approved again before it goes live.</p>
        ) : (
          <div className="mt-2 space-y-4">
            <p className="text-sm">
              <span className="font-semibold">Draft version <span className="num">{draft.version}</span></span> is waiting for approval.
              {live ? <> It would replace the live version <span className="num">{live.version}</span>.</> : <> Nothing is live yet.</>}
            </p>
            {draft.version !== latestVersion && <p className="text-xs text-brass-deep">Only the most recent draft can be approved.</p>}
            <div>
              <div className="annot">What changed {live ? `since version ${live.version}` : ''}</div>
              {changes === null ? <p className="mt-1 text-sm text-muted">This is the first version, so everything is new. Please read the whole script and the never-say list.</p>
                : changes.length === 0 ? <p className="mt-1 text-sm text-muted">Nothing differs from the live version.</p>
                  : <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm marker:text-terracotta">{changes.map((c) => <li key={c}>{c}</li>)}</ul>}
            </div>
            {dirty && <p className="rounded border border-brass/50 bg-[#F5EBD2] px-3 py-2 text-sm text-brass-deep">The editor has unsaved changes. Approval applies to the saved draft version {draft.version} only.</p>}
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#B8573A]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span className="font-medium">I have read the rules and the never-say list.</span>
            </label>
            <div className="max-w-sm">
              <label htmlFor="approver" className="annot">Approved by</label>
              <input id="approver" className="field mt-1" value={by} onChange={(e) => setBy(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary" disabled={!confirmed || approving || !by.trim() || draft.version !== latestVersion} onClick={approve}>{approving ? 'Approving…' : `Approve & publish version ${draft.version}`}</button>
          </div>
        )}
        <p aria-live="polite" role="status" className={cx('mt-3 min-h-[1.25rem] text-sm font-medium', approveMsg?.ok ? 'text-sage-deep' : 'text-alert')}>{approveMsg?.text ?? ''}</p>
        <p className="mt-2 text-xs text-muted">Approved versions are never edited. Any change creates a new draft that needs approving again.</p>
      </Sheet>
    </div>
  );
}
