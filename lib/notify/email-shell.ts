// Branded HTML email: lime-plaster background, Georgia (Fraunces fallback) headings, terracotta buttons.
// Mobile-first single column, readable without images. Always paired with a plain-text version.
export const C = {
  plaster: '#F4EEE4', paper: '#FBF8F2', ink: '#2B2620', terracotta: '#B8573A', teak: '#7A4E2D', sage: '#4F6A4E',
  indigo: '#2F4A6D', brass: '#8A6B22', clay: '#E7D8C6', muted: '#6B6157', alert: '#A83A2C',
};
export const he = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const button = (label: string, href: string, kind: 'primary' | 'ghost' = 'primary'): string =>
  kind === 'primary'
    ? `<a href="${he(href)}" style="display:inline-block;background:${C.terracotta};color:#FFFFFF;text-decoration:none;font:600 15px/1 Helvetica,Arial,sans-serif;padding:13px 20px;border-radius:6px;margin:4px 8px 4px 0">${he(label)}</a>`
    : `<a href="${he(href)}" style="display:inline-block;color:${C.indigo};text-decoration:none;font:600 14px/1 Helvetica,Arial,sans-serif;padding:12px 4px;margin:4px 8px 4px 0;border-bottom:1px solid ${C.indigo}">${he(label)}</a>`;

export const label = (s: string): string =>
  `<div style="font:11px/1.2 'Courier New',monospace;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};margin:0 0 6px">${he(s)}</div>`;

export const card = (inner: string, accent: string = C.clay): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};border:1px solid ${accent};border-radius:6px;margin:0 0 14px"><tr><td style="padding:16px 18px;font:15px/1.5 Helvetica,Arial,sans-serif;color:${C.ink}">${inner}</td></tr></table>`;

export function emailShell(o: { preheader: string; heading: string; body: string; footer?: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${he(o.heading)}</title></head>
<body style="margin:0;background:${C.plaster};padding:0">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${he(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.plaster}"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 2px 14px"><span style="font:600 22px Georgia,'Times New Roman',serif;color:${C.ink}">&#9707; Aangan</span> <span style="font:11px 'Courier New',monospace;letter-spacing:.14em;color:${C.muted};text-transform:uppercase">&nbsp;Studio · Pune</span></td></tr>
<tr><td style="border-top:2px solid ${C.terracotta};padding:18px 2px 6px"><h1 style="margin:0;font:600 24px/1.25 Georgia,'Times New Roman',serif;color:${C.ink}">${he(o.heading)}</h1></td></tr>
<tr><td style="padding:10px 0 0">${o.body}</td></tr>
<tr><td style="padding:14px 2px 0;font:12px/1.5 Helvetica,Arial,sans-serif;color:${C.muted}">${o.footer ?? 'Sent by the Aangan phone assistant. Prices are only ever given by a designer, after seeing the site.'}</td></tr>
</table></td></tr></table></body></html>`;
}
