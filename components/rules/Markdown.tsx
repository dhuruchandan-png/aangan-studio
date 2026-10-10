import type { ReactNode } from 'react';

// A tiny, safe markdown renderer: headings, bold, italic, code, bullet / numbered lists, paragraphs.
// Everything is rendered as React text nodes, so nothing is ever injected as raw HTML.

function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter((p) => p !== '');
  return parts.map((p, i) => {
    const key = `${keyBase}-${i}`;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={key} className="font-semibold text-ink">{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={key} className="num rounded bg-clay/50 px-1 text-[0.85em]">{p.slice(1, -1)}</code>;
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={key}>{p.slice(1, -1)}</em>;
    return <span key={key}>{p}</span>;
  });
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? 'display mt-1 text-2xl font-semibold text-ink' : level === 2 ? 'display mt-5 text-xl font-semibold text-ink' : 'mt-4 text-base font-semibold text-terracotta-deep';
      out.push(level === 1 ? <h3 key={k++} className={cls}>{inline(h[2], `h${k}`)}</h3> : level === 2 ? <h4 key={k++} className={cls}>{inline(h[2], `h${k}`)}</h4> : <h5 key={k++} className={cls}>{inline(h[2], `h${k}`)}</h5>);
      i++; continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      out.push(<ul key={k++} className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed marker:text-teak">{items.map((t, j) => <li key={j}>{inline(t, `l${k}-${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      out.push(<ol key={k++} className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed marker:text-teak">{items.map((t, j) => <li key={j}>{inline(t, `o${k}-${j}`)}</li>)}</ol>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) { para.push(lines[i]); i++; }
    out.push(<p key={k++} className="mt-2 text-sm leading-relaxed">{inline(para.join(' '), `p${k}`)}</p>);
  }
  return <div>{out}</div>;
}
