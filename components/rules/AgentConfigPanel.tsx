'use client';
import { useState } from 'react';
import { Badge, Label, Sheet } from '@/components/ui';

export function AgentConfigPanel({ md, json, version, approved }: { md: string; json: string; version: number; approved: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(md); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); }
  };
  const mdHref = `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`;
  const jsonHref = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  return (
    <Sheet>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Agent configuration for Vaani · version {version}</Label>
        {approved ? <Badge tone="indigo">Approved</Badge> : <Badge tone="terracotta">Draft: not approved</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted">
        {approved ? 'Paste this into the Vaani agent, or let Vaani fetch it from the app.' : 'This is a DRAFT. Do not put the agent live until the version is approved above.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? 'Copied' : 'Copy markdown'}</button>
        <a className="btn btn-ghost" href={mdHref} download={`aangan-agent-v${version}${approved ? '' : '-draft'}.md`}>Download .md</a>
        <a className="btn btn-ghost" href={jsonHref} download={`aangan-agent-v${version}${approved ? '' : '-draft'}.json`}>Download .json</a>
      </div>
      <pre className="num mt-3 max-h-[26rem] overflow-auto whitespace-pre-wrap rounded border border-clay bg-plaster/60 p-4 text-[12.5px] leading-relaxed">{md}</pre>
    </Sheet>
  );
}
