// "Aangan: the Courtyard" design system. Server-safe (no hooks). Warm, crafted, editorial, calm.
import type { ReactNode } from 'react';
import { ArchLine } from './art';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ------------------------------------------------------------------ surfaces
export function Sheet({ children, className, tone }: { children: ReactNode; className?: string; tone?: 'plain' | 'terracotta' | 'sage' | 'alert' }) {
  return (
    <section className={cx('sheet p-5 animate-settle', tone === 'terracotta' && '!border-terracotta', tone === 'sage' && '!border-sage', tone === 'alert' && '!border-alert', className)}>
      <i className="reg tl" /><i className="reg tr" /><i className="reg bl" /><i className="reg br" />
      {children}
    </section>
  );
}

/** Section label, spaced like an annotation on a drawing: SITE · KOTHRUD */
export const Label = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx('annot', className)}>{children}</div>;

export function PageHeader({ title, plain, right, eyebrow }: { title: string; plain: string; right?: ReactNode; eyebrow?: string }) {
  return (
    <header className="hero">
      <div className="jaali absolute inset-0" aria-hidden />
      <div className="glow" aria-hidden />
      <ArchLine className="pointer-events-none absolute -bottom-2 right-4 hidden h-44 w-72 opacity-30 md:block lg:right-16" />
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 py-8 md:px-8 md:py-10">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-gold">{eyebrow ?? 'Aangan Studio · Pune'}</div>
          <h1 className="display mt-2 text-3xl font-semibold leading-tight text-[#FFF6E6] md:text-5xl">{title}</h1>
          <p className="mt-2 max-w-xl text-sm text-[#E8D9C2]/80 md:text-base">{plain}</p>
        </div>
        {right && <div className="text-[#FBF3E4]">{right}</div>}
      </div>
    </header>
  );
}

export const Page = ({ children }: { children: ReactNode }) => <div className="mx-auto max-w-6xl space-y-6 px-4 py-7 md:px-8">{children}</div>;

// ------------------------------------------------------------------ drawing details
/** ← 4 min 12 s →  a dimension line with tick ends */
export function Dimension({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center gap-1.5 text-[11px] text-muted', className)} aria-hidden={false}>
      <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-teak"><path d="M9 5H1M4 2 1 5l3 3M1 1v8" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
      <span className="num whitespace-nowrap">{children}</span>
      <span className="h-px flex-1 bg-clay" />
      <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-teak"><path d="M1 5h8M6 2l3 3-3 3M9 1v8" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
    </div>
  );
}

export function BigFigure({ value, unit, label, note, tone, dim }: { value: ReactNode; unit?: string; label: string; note?: string; tone?: 'ok' | 'warn' | 'alert'; dim?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className={cx('figure mt-1.5 flex items-baseline gap-1 text-[2.6rem] font-semibold leading-none', tone === 'alert' ? 'text-alert' : tone === 'warn' ? 'text-brass-deep' : 'text-ink')} style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span>{value}</span>{unit && <span className="text-lg font-medium text-muted">{unit}</span>}
      </div>
      {dim ? <Dimension className="mt-2">{dim}</Dimension> : null}
      {note && <p className="mt-1.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ chips (always a word and an icon)
const Ico = ({ d, className }: { d: string; className?: string }) => (
  <svg width="13" height="13" viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const VERDICT = {
  qualified: { word: 'Qualified', d: 'M3 8.5l3.2 3L13 4.5', cls: 'bg-[#E6EEE5] text-sage-deep border-sage/40' },
  unsure: { word: 'Unsure', d: 'M6 6a2 2 0 1 1 2.8 1.8C8.3 8.1 8 8.5 8 9.2M8 12h.01', cls: 'bg-[#F5EBD2] text-brass-deep border-brass/50' },
  not_a_fit: { word: 'Not a fit', d: 'M4 8h8', cls: 'bg-clay/60 text-muted border-clay' },
  escalate: { word: 'Escalate', d: 'M8 3v6M8 12h.01', cls: 'bg-transparent text-terracotta-deep border-terracotta border-2' },
  other: { word: 'Other', d: 'M4 8h8', cls: 'bg-transparent text-muted border-clay' },
  pending: { word: 'Reading…', d: 'M8 4v4l2.5 1.5', cls: 'bg-transparent text-muted border-clay border-dashed' },
} as const;

export function VerdictChip({ verdict }: { verdict: string | null | undefined }) {
  const v = VERDICT[(verdict as keyof typeof VERDICT) ?? 'pending'] ?? VERDICT.pending;
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', v.cls)}><Ico d={v.d} />{v.word}</span>;
}

const STATUS: Record<string, string> = {
  new: 'Reading', routed: 'Handed over', accepted: 'Accepted', called_back: 'Called back', consult_booked: 'Consultation booked', not_proceeding: 'Not proceeding', closed: 'Closed',
};
export const StatusChip = ({ status }: { status: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-clay bg-paper px-2.5 py-0.5 text-xs font-medium text-ink">
    <span className={cx('h-1.5 w-1.5 rounded-full', status === 'consult_booked' || status === 'called_back' ? 'bg-sage' : status === 'accepted' ? 'bg-indigo' : status === 'not_proceeding' ? 'bg-muted' : 'bg-brass')} />{STATUS[status] ?? status}
  </span>
);

export const Badge = ({ children, tone = 'brass' }: { children: ReactNode; tone?: 'brass' | 'terracotta' | 'indigo' | 'alert' }) => (
  <span className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
    tone === 'brass' && 'border-brass/50 bg-[#F5EBD2] text-brass-deep', tone === 'terracotta' && 'border-terracotta bg-[#F7E3DA] text-terracotta-deep',
    tone === 'indigo' && 'border-indigo/40 bg-[#E2E8F0] text-indigo', tone === 'alert' && 'border-alert bg-[#F6DDD8] text-alert')}>{children}</span>
);

/** Soft inked stamp, only for real states. */
export function Stamp({ children, tone = 'sage', sub }: { children: ReactNode; tone?: 'sage' | 'indigo' | 'terracotta' | 'alert'; sub?: string }) {
  const c = { sage: 'text-sage-deep border-sage-deep', indigo: 'text-indigo border-indigo', terracotta: 'text-terracotta-deep border-terracotta-deep', alert: 'text-alert border-alert' }[tone];
  return (
    <span className={cx('inline-block -rotate-2 rounded-sm border-2 border-double px-2.5 py-1 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.12em] opacity-85', c)} style={{ filter: 'url(#ink)' }}>
      {children}{sub && <span className="block text-[10px] font-medium opacity-80">{sub}</span>}
    </span>
  );
}
/** One-time SVG filter that roughens stamp edges slightly, like ink on paper. */
export const InkFilter = () => (
  <svg width="0" height="0" className="absolute" aria-hidden><filter id="ink"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" /></filter></svg>
);

// ------------------------------------------------------------------ material swatches (decorative, seeded by id)
const MATERIALS: Record<string, { name: string; bg: string; fx?: string }> = {
  terrazzo: { name: 'terrazzo', bg: '#DDD3C5', fx: 'radial-gradient(circle at 20% 30%, #8E8173 1.5px, transparent 2px), radial-gradient(circle at 70% 60%, #B9694A 2px, transparent 2.5px), radial-gradient(circle at 45% 80%, #6F8A6E 1.5px, transparent 2px)' },
  teak: { name: 'teak', bg: '#8B5A33', fx: 'repeating-linear-gradient(95deg, rgba(0,0,0,.12) 0 2px, transparent 2px 7px)' },
  lime: { name: 'lime plaster', bg: '#EDE6D8', fx: 'radial-gradient(circle at 30% 40%, rgba(255,255,255,.7), transparent 60%)' },
  cane: { name: 'cane', bg: '#C9A66B', fx: 'repeating-linear-gradient(45deg, rgba(90,60,20,.25) 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, rgba(90,60,20,.25) 0 1px, transparent 1px 5px)' },
  slate: { name: 'slate', bg: '#5B6770', fx: 'linear-gradient(135deg, rgba(255,255,255,.08), rgba(0,0,0,.12))' },
  tile: { name: 'terracotta tile', bg: '#B8573A', fx: 'linear-gradient(90deg, transparent 49%, rgba(0,0,0,.18) 50%, transparent 51%), linear-gradient(0deg, transparent 49%, rgba(0,0,0,.18) 50%, transparent 51%)' },
  brass: { name: 'brass', bg: '#B8913F', fx: 'linear-gradient(120deg, rgba(255,255,255,.25), transparent 50%)' },
  indigo: { name: 'indigo dye', bg: '#2F4A6D', fx: 'repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 1px, transparent 1px 6px)' },
};
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export function swatchSet(seed: string, propertyType?: string | null, scope?: string | null): string[] {
  const t = `${propertyType ?? ''} ${scope ?? ''}`.toLowerCase();
  const pool = new Set<string>();
  if (/kitchen/.test(t)) { pool.add('terrazzo'); pool.add('teak'); }
  if (/bedroom|wardrobe/.test(t)) { pool.add('cane'); pool.add('lime'); }
  if (/office|clinic|studio|commercial/.test(t)) { pool.add('slate'); pool.add('teak'); }
  if (/villa|house/.test(t)) { pool.add('tile'); pool.add('brass'); }
  ['lime', 'teak', 'terrazzo', 'cane', 'indigo'].forEach((m) => pool.add(m));
  const arr = [...pool];
  const h = hash(seed);
  const start = h % Math.max(1, arr.length - 3);
  return arr.slice(start, start + 3 + (h % 2));
}
export function Swatches({ seed, propertyType, scope }: { seed: string; propertyType?: string | null; scope?: string | null }) {
  return (
    <div className="flex items-center gap-1.5" title="Indicative material palette, seeded from the enquiry. Not the client's choice.">
      {swatchSet(seed, propertyType, scope).map((k) => (
        <span key={k} className="h-7 w-7 rounded-sm border border-ink/10" style={{ background: MATERIALS[k].fx ? `${MATERIALS[k].fx}, ${MATERIALS[k].bg}` : MATERIALS[k].bg, backgroundSize: k === 'terrazzo' ? '14px 14px' : k === 'tile' ? '14px 14px' : undefined }} aria-label={MATERIALS[k].name} />
      ))}
      <span className="annot ml-1 !text-[10px]">palette · indicative</span>
    </div>
  );
}

// ------------------------------------------------------------------ floor-plan icons (1.5px strokes)
export function PlanIcon({ type, size = 28, className }: { type?: string | null; size?: number; className?: string }) {
  const t = (type ?? '').toLowerCase();
  const kind = /villa|house|bungalow/.test(t) ? 'villa' : /clinic/.test(t) ? 'clinic' : /office|commercial|cowork|pod/.test(t) ? 'office' : /studio/.test(t) ? 'studio' : 'apartment';
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cx('text-teak', className)} role="img" aria-label={kind}>
      {kind === 'apartment' && <g {...p}><rect x="3" y="5" width="26" height="22" /><path d="M3 15h12M15 5v10M15 20h14M21 20v7M9 27v-6" /><path d="M9 21a3 3 0 0 1 3-3" /></g>}
      {kind === 'villa' && <g {...p}><path d="M3 15 16 4l13 11M6 13v14h20V13" /><path d="M13 27v-8h6v8M9 17h3M20 17h3" /></g>}
      {kind === 'office' && <g {...p}><rect x="3" y="5" width="26" height="22" /><path d="M8 10h5v5H8zM19 10h5v5h-5zM8 20h5M19 20h5M13 27v-4h6v4" /></g>}
      {kind === 'clinic' && <g {...p}><rect x="3" y="5" width="26" height="22" /><path d="M16 10v10M11 15h10M3 23h8M21 23h8" /></g>}
      {kind === 'studio' && <g {...p}><rect x="4" y="6" width="24" height="20" /><circle cx="16" cy="16" r="5" /><path d="M16 11v10M11 16h10" /></g>}
    </svg>
  );
}

// ------------------------------------------------------------------ time of day
/** Thin sunrise-to-night gradient with a marker for when a call came in. After-hours calls get a moon. */
export function TimeOfDay({ hour, minute = 0, afterHours }: { hour: number; minute?: number; afterHours?: boolean }) {
  const pct = ((hour * 60 + minute) / 1440) * 100;
  return (
    <div className="flex items-center gap-1.5" title={`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}${afterHours ? ' · after hours' : ''}`}>
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full" style={{ background: 'linear-gradient(90deg,#1F2A44 0%,#3B3A5E 18%,#E8A87C 26%,#F4E3B5 38%,#F8F0D8 50%,#F4E3B5 62%,#E49A6A 76%,#4A3A5A 86%,#1F2A44 100%)' }}>
        <span className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded bg-ink" style={{ left: `${pct}%` }} />
      </div>
      {afterHours && <Moon />}
    </div>
  );
}
export const Moon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" aria-label="after hours" role="img" className="text-indigo"><path d="M12.5 10.2A5.5 5.5 0 0 1 5.8 3.5 5.5 5.5 0 1 0 12.5 10.2Z" fill="currentColor" /></svg>
);

// ------------------------------------------------------------------ marks
export function CourtyardPlan({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="26" height="26" /><rect x="11" y="11" width="10" height="10" strokeDasharray="2 2" /><path d="M3 11h8M21 11h8M3 21h8M21 21h8M11 3v8M21 3v8M11 21v8M21 21v8" opacity=".55" />
    </svg>
  );
}
export const Wordmark = ({ inverse }: { inverse?: boolean }) => (
  <div className={cx('flex items-center gap-2.5', inverse ? 'text-[#FFF6E6]' : 'text-ink')}>
    <span className={cx('flex h-10 w-10 items-center justify-center rounded-xl', inverse ? 'bg-gold/15 text-gold' : 'bg-[#F7E3DA] text-terracotta')}><CourtyardPlan size={24} /></span>
    <div className="leading-none"><div className="display text-2xl font-semibold">Aangan</div><div className={cx('mt-1 text-[10px] font-medium uppercase tracking-[0.22em]', inverse ? 'text-gold/80' : 'text-muted')}>Studio · Pune</div></div>
  </div>
);

/** Empty state: a courtyard with a tulsi planter. */
export function Empty({ line = 'All quiet in the courtyard. Calls will appear here the moment they’re answered.' }: { line?: string }) {
  return (
    <div className="relative overflow-hidden rounded border border-dashed border-clay px-6 py-10 text-center">
      <div className="jaali absolute inset-0" aria-hidden />
      <svg className="relative mx-auto mb-3 text-teak" width="150" height="96" viewBox="0 0 150 96" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" role="img" aria-label="A courtyard with a tulsi planter">
        <path d="M6 90h138M14 90V40l61-26 61 26v50" /><path d="M30 90V54h22v36M98 90V54h22v36" /><path d="M34 62h14M34 70h14M102 62h14M102 70h14" opacity=".5" />
        <path d="M65 90v-9h20v9zM63 81h24" /><path d="M75 81V62M75 70c-6-1-9-4-10-9 6 0 9 3 10 9zM75 66c5-1 8-4 9-8-5-1-8 2-9 8zM75 62c-1-5 1-8 5-10 1 5-1 8-5 10z" stroke="#6F8A6E" /><path d="M75 8v6M70 10l5-2 5 2" opacity=".6" />
      </svg>
      <p className="relative mx-auto max-w-sm text-sm text-muted">{line}</p>
    </div>
  );
}


// ------------------------------------------------------------------ dashboard widgets
/** Circular progress for a percentage (null shows a dash). */
export function Ring({ pct, size = 92, stroke = 9, color = '#B8573A', children }: { pct: number | null; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={pct == null ? 'no data' : `${Math.round(v)} percent`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EFE4D3" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray .8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** Tiny area sparkline. */
export function Spark({ values, color = '#D9B45B', height = 44, width = 180 }: { values: number[]; color?: string; height?: number; width?: number }) {
  const max = Math.max(1, ...values), n = Math.max(values.length, 2);
  const pts = values.map((v, i) => [(i / (n - 1)) * width, height - 4 - (v / max) * (height - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const gid = `sp${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".45" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {pts.length > 1 && <><path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${gid})`} /><path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></>}
    </svg>
  );
}

/** Small icon in a tinted tile. */
const TILE_ICON: Record<string, string> = {
  phone: 'M3.5 2.5h2.2l1 3-1.4 1c.7 1.5 1.9 2.7 3.4 3.4l1-1.4 3 1v2.2c0 .6-.5 1-1 1C7 12.7 3.3 9 3 3.5c0-.6.4-1 .5-1z',
  check: 'M3 8.5l3.2 3L13 4.5',
  clock: 'M8 3.5v4.5l3 1.8M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
  moon: 'M12.5 10.2A5.5 5.5 0 0 1 5.8 3.5 5.5 5.5 0 1 0 12.5 10.2Z',
  star: 'M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.2 4.3 13.3l.8-4.1L2 6.3l4.2-.5z',
  users: 'M5.5 7a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM1.5 13c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6M11 7.2a1.9 1.9 0 1 0 0-3.8M11.5 9.6c1.7.2 3 1.4 3 3.4',
  alert: 'M8 2.5l6 10.5H2zM8 7v3M8 11.8h.01',
  cal: 'M3 4.5h10v8.5H3zM3 7.5h10M5.5 2.5v3M10.5 2.5v3',
  rupee: 'M4.5 3h7M4.5 6h7M4.5 3c3.5 0 4.5 1.2 4.5 3s-1.5 3-4.5 3L10 13',
  mail: 'M2.5 4h11v8h-11zM2.5 4.5 8 9l5.5-4.5',
};
export function IconTile({ icon, tone = 'terracotta', size = 34 }: { icon: keyof typeof TILE_ICON | string; tone?: 'terracotta' | 'sage' | 'indigo' | 'brass' | 'alert'; size?: number }) {
  const t = { terracotta: 'bg-[#F7E3DA] text-terracotta-deep', sage: 'bg-[#E3ECE2] text-sage-deep', indigo: 'bg-[#E2E8F0] text-indigo', brass: 'bg-[#F5EBD2] text-brass-deep', alert: 'bg-[#F6DDD8] text-alert' }[tone];
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-xl', t)} style={{ width: size, height: size }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={TILE_ICON[icon] ?? TILE_ICON.star} /></svg>
    </span>
  );
}

/** Compact KPI tile: icon, label, big figure, one quiet line. */
export function Stat({ icon, tone, label, value, note, flag }: { icon: string; tone?: 'terracotta' | 'sage' | 'indigo' | 'brass' | 'alert'; label: string; value: ReactNode; note?: string; flag?: 'warn' | 'alert' }) {
  return (
    <div className={cx('sheet lift p-4', flag === 'alert' && '!border-alert/60', flag === 'warn' && '!border-brass/60')}>
      <div className="flex items-center gap-2.5"><IconTile icon={icon} tone={tone} size={30} /><span className="text-[13px] font-medium text-muted">{label}</span></div>
      <div className={cx('figure mt-3 text-4xl font-semibold leading-none', flag === 'alert' ? 'text-alert' : 'text-ink')}>{value}</div>
      {note && <p className="mt-2 text-xs leading-snug text-muted">{note}</p>}
    </div>
  );
}
