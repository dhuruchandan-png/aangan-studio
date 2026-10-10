// Hand-drawn SVG charts: thin strokes, terracotta and sage on lime plaster, no gridline clutter,
// direct labels instead of legends. Server-safe.
const C = { terracotta: '#B8573A', sage: '#6F8A6E', clay: '#E7D8C6', ink: '#2B2620', muted: '#6B6157', indigo: '#2F4A6D', brass: '#B8913F' };

/** Calls by hour of day, with the 10am–7pm band shaded so the after-hours share is obvious. */
export function HourChart({ byHour, bandStart = 10, bandEnd = 19 }: { byHour: { hour: number; calls: number }[]; bandStart?: number; bandEnd?: number }) {
  const W = 640, H = 190, L = 8, R = 8, T = 22, B = 30;
  const max = Math.max(1, ...byHour.map((h) => h.calls));
  const bw = (W - L - R) / 24;
  const x = (h: number) => L + h * bw;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Calls by hour of day; front-desk hours 10am to 7pm shaded">
      <rect x={x(bandStart)} y={T - 8} width={x(bandEnd) - x(bandStart)} height={H - T - B + 8} fill={C.clay} opacity=".55" rx="2" />
      <text x={(x(bandStart) + x(bandEnd)) / 2} y={T} textAnchor="middle" fontSize="11" fill={C.muted} style={{ letterSpacing: '.08em' }}>FRONT DESK HOURS</text>
      {byHour.map((h) => {
        const bh = (h.calls / max) * (H - T - B - 14);
        const after = h.hour < bandStart || h.hour >= bandEnd;
        return (
          <g key={h.hour}>
            <rect x={x(h.hour) + 3} y={H - B - bh} width={bw - 6} height={Math.max(bh, h.calls ? 2 : 0)} fill={after ? C.terracotta : C.sage} rx="1.5"><title>{`${h.hour}:00 · ${h.calls} calls`}</title></rect>
            {h.calls > 0 && <text x={x(h.hour) + bw / 2} y={H - B - bh - 4} textAnchor="middle" fontSize="10" fill={C.ink} className="num">{h.calls}</text>}
            {h.hour % 3 === 0 && <text x={x(h.hour) + bw / 2} y={H - B + 14} textAnchor="middle" fontSize="10" fill={C.muted} className="num">{String(h.hour).padStart(2, '0')}</text>}
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={C.ink} strokeWidth="1" opacity=".5" />
      <text x={L} y={H - 4} fontSize="10" fill={C.terracotta}>● outside front-desk hours</text>
      <text x={L + 150} y={H - 4} fontSize="10" fill={C.sage}>● front-desk hours</text>
    </svg>
  );
}

/** One stacked bar, direct labels. */
export function SplitBar({ parts }: { parts: { label: string; n: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0) || 1;
  let acc = 0;
  return (
    <svg viewBox="0 0 640 74" className="w-full" role="img" aria-label="Verdict split">
      {parts.filter((p) => p.n > 0).map((p) => {
        const w = (p.n / total) * 624, x = 8 + acc; acc += w;
        return (
          <g key={p.label}>
            <rect x={x} y="26" width={Math.max(w - 2, 2)} height="18" fill={p.color} rx="2"><title>{`${p.label}: ${p.n}`}</title></rect>
            {w > 54 && <text x={x + 4} y="39" fontSize="11" fill="#fff" fontWeight="600" className="num">{p.n}</text>}
            <text x={x + 1} y="18" fontSize="11" fill={C.ink}>{p.label}</text>
            {w <= 54 && <text x={x + 1} y="60" fontSize="11" fill={C.ink} className="num">{p.n}</text>}
          </g>
        );
      })}
      {total === 1 && parts.every((p) => p.n === 0) && <text x="8" y="40" fontSize="12" fill={C.muted}>No enquiries yet this month.</text>}
    </svg>
  );
}

/** Horizontal bars with direct labels (time-to-callback distribution). */
export function Bars({ rows, color = C.terracotta }: { rows: { label: string; n: number }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const H = rows.length * 30 + 8;
  return (
    <svg viewBox={`0 0 640 ${H}`} className="w-full" role="img" aria-label="Distribution">
      {rows.map((r, i) => (
        <g key={r.label} transform={`translate(0 ${i * 30 + 4})`}>
          <text x="8" y="17" fontSize="12" fill={C.ink}>{r.label}</text>
          <rect x="130" y="4" width={Math.max((r.n / max) * 440, r.n ? 3 : 0)} height="16" fill={color} rx="2" />
          <text x={136 + (r.n / max) * 440} y="17" fontSize="12" fill={C.ink} className="num">{r.n}</text>
        </g>
      ))}
    </svg>
  );
}

/** Two thin lines (this month vs last) plus Nikhil's baseline drawn as a reference line. */
export function LineCompare({ thisMonth, lastMonth, baseline, baselineLabel, unit = '%' }: { thisMonth: (number | null)[]; lastMonth: (number | null)[]; baseline: number; baselineLabel: string; unit?: string }) {
  const W = 640, H = 200, L = 36, R = 90, T = 14, B = 26;
  const n = Math.max(thisMonth.length, lastMonth.length, 2);
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const path = (xs: (number | null)[]) => xs.map((v, i) => (v == null ? null : `${i === 0 || xs[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
  const lastVal = (xs: (number | null)[]) => { for (let i = xs.length - 1; i >= 0; i--) if (xs[i] != null) return { i, v: xs[i] as number }; return null; };
  const a = lastVal(thisMonth), b = lastVal(lastMonth);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Answered percentage, this month against last month, with the 48% unanswered baseline">
      {[0, 50, 100].map((g) => <text key={g} x={L - 6} y={y(g) + 4} textAnchor="end" fontSize="10" fill={C.muted} className="num">{g}{unit}</text>)}
      <line x1={L} x2={W - R} y1={y(baseline)} y2={y(baseline)} stroke={C.brass} strokeWidth="1.2" strokeDasharray="5 4" />
      <text x={W - R + 6} y={y(baseline) - 2} fontSize="10" fill="#7F6320">{baselineLabel}</text>
      <path d={path(lastMonth)} fill="none" stroke={C.muted} strokeWidth="1.4" opacity=".7" />
      <path d={path(thisMonth)} fill="none" stroke={C.terracotta} strokeWidth="2" />
      {a && <><circle cx={x(a.i)} cy={y(a.v)} r="3" fill={C.terracotta} /><text x={x(a.i) + 7} y={y(a.v) + 4} fontSize="11" fill={C.terracotta} fontWeight="600">This month</text></>}
      {b && <text x={x(b.i) + 7} y={y(b.v) + (a && Math.abs(y(a.v) - y(b.v)) < 14 ? 16 : 4)} fontSize="11" fill={C.muted}>Last month</text>}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={C.ink} strokeWidth="1" opacity=".4" />
      <text x={L} y={H - 8} fontSize="10" fill={C.muted}>day 1</text>
      <text x={W - R} y={H - 8} textAnchor="end" fontSize="10" fill={C.muted}>day {n}</text>
    </svg>
  );
}
