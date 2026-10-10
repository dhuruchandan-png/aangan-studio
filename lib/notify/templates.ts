// Email templates (the only channel). Branded HTML, mobile-first, readable without images, always with a plain-text twin.
// Every email has ONE clear action per item; action links open a confirm page, so email scanners can't trigger them.
import { button, C, card, emailShell, he, label } from './email-shell';
import { fmtDayDateTime, fmtTime, istDayKey } from '../time';
import { RULE_LABEL } from '../pipeline/compliance';
import type { LeadCtx } from '../leads';

const nIN = (x: number) => x.toLocaleString('en-IN');
const DM_WORD: Record<string, string> = { yes: 'yes', authorised: 'authorised', unclear: 'not confirmed', no: 'no' };

/** "11:00" if today, "tomorrow 11:00", else "Mon 12 Oct · 11:00". */
export function whenWords(due: Date | null | undefined, now: Date = new Date()): string {
  if (!due) return '—';
  const k = istDayKey(due), today = istDayKey(now), tomorrow = istDayKey(new Date(now.getTime() + 86_400_000));
  if (k === today) return fmtTime(due);
  if (k === tomorrow) return `tomorrow ${fmtTime(due)}`;
  return fmtDayDateTime(due);
}

export function headline(l: LeadCtx): string {
  const f = l.fields;
  return [l.callerName ?? f?.name ?? 'Caller', f?.locality, f?.size_bhk ?? f?.property_type].filter(Boolean).join(' · ');
}

const whoLine = (l: LeadCtx) => {
  const f = l.fields;
  const parts = [l.callerName ?? f?.name ?? 'Caller', f?.locality, f?.size_bhk, f?.size_bhk ? null : f?.property_type, f?.carpet_sqft ? `~${nIN(f.carpet_sqft)} sq ft carpet` : null];
  return parts.filter(Boolean).join(' · ');
};
const scopeLine = (l: LeadCtx) => {
  const f = l.fields;
  if (!f) return null;
  const rooms = f.rooms?.length && !(f.scope ?? '').toLowerCase().includes(f.rooms[0].toLowerCase()) ? ` — ${f.rooms.join(', ')}` : '';
  const s = [f.scope ? f.scope + rooms : f.rooms?.join(', '), f.current_state].filter(Boolean).join(' · ');
  return s ? `Scope: ${s}` : null;
};
const sourceLine = (l: LeadCtx) => {
  if (l.referral) return `Source: referral — ${l.referral}${l.fields?.source && !/referr/i.test(l.fields.source) ? ` (${l.fields.source})` : ''}`;
  return `Source: ${l.fields?.source ?? 'not asked'}`;
};

export interface Item { ref: string; headline: string; sub?: string; due?: Date | null; briefUrl: string; number?: string | null }
export interface DaySection { title: string; items: Item[] }
export interface StatRow { label: string; value: string; prev?: string; note?: string }

const mono = (s: string) => `<div style="font:13px 'Courier New',monospace;color:${C.teak};margin:4px 0 8px">${s}</div>`;
const tel = (n: string | null | undefined) => (n ? `<a href="tel:${he(n.replace(/\s/g, ''))}" style="color:${C.indigo};text-decoration:none">${he(n)}</a>` : 'number not captured');

// ------------------------------------------------------------------ the handoff (T+0 and the T+10 nudge)
const factRows = (l: LeadCtx): [string, string][] => {
  const f = l.fields;
  return [
    ['Who', whoLine(l)], ['Scope', (scopeLine(l) ?? '').replace('Scope: ', '')], ['Timeline', f?.timeline_text ?? 'not discussed'],
    ['Decision-maker', DM_WORD[f?.decision_maker ?? 'unclear']], ['Source', sourceLine(l).replace('Source: ', '')],
    ['Call back', `by ${whenWords(l.callbackDue)} → ${l.callerNumber ?? 'number not captured'}`],
  ].filter((r) => r[1]) as [string, string][];
};

export function emailHandoff(l: LeadCtx, o: { openUrl: string; reminder?: boolean; sim?: boolean }): { subject: string; html: string; text: string } {
  const subject = `${o.reminder ? 'Still waiting · ' : ''}${l.priority ? '⭐ ' : ''}New enquiry · ${headline(l)} · call back by ${whenWords(l.callbackDue)}`;
  const rows = factRows(l).map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:${C.muted};font:11px 'Courier New',monospace;letter-spacing:.1em;text-transform:uppercase;vertical-align:top">${he(k)}</td><td style="padding:3px 0">${k === 'Call back' && l.callerNumber ? `by ${he(whenWords(l.callbackDue))} → ${tel(l.callerNumber)}` : he(v)}</td></tr>`).join('');
  const body =
    (o.reminder ? card(`<b>Nobody has accepted this yet.</b> Open it and tap <i>Accept</i>, or <i>Pass</i> if you can't take it. After 15 minutes it moves to the next designer.`, C.brass) : '') +
    (l.priority ? card(`<b style="color:${C.terracotta}">⭐ PRIORITY</b> — ${he(l.priorityReason ?? 'handle with care')}`, C.terracotta) : '') +
    card(`${label(`Ref ${l.ref} · call ${fmtTime(l.callAt)}${l.afterHours ? ' · after hours' : ''}`)}<table role="presentation" cellpadding="0" cellspacing="0" style="font:15px/1.5 Helvetica,Arial,sans-serif">${rows}</table>`) +
    card(`${label('Handoff note')}<div style="white-space:pre-line">${he(l.note)}</div>${l.stillUnknown.length ? `<p style="margin:10px 0 0;color:${C.muted}">Still unknown: ${he(l.stillUnknown.join('; '))}</p>` : ''}${(l.notes ?? []).length ? `<p style="margin:10px 0 0;color:${C.muted}">${l.notes.map((n) => 'ℹ️ ' + he(n)).join('<br>')}</p>` : ''}${l.priceAsked ? `<p style="margin:10px 0 0">⚠️ Asked about price — told the designer will cover it.</p>` : ''}`) +
    `<div style="padding:4px 0 8px">${button('Open the lead and accept', o.openUrl)}</div><p style="font:13px/1.5 Helvetica,Arial,sans-serif;color:${C.muted}">The recording, transcript and every button are on your dashboard.</p>`;
  const text = `${subject}\n\n${factRows(l).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${l.note}\n\nOpen the lead and accept: ${o.openUrl}\n`;
  return { subject: (o.sim ? '🧪 ' : '') + subject, html: emailShell({ preheader: `${headline(l)} · call back by ${whenWords(l.callbackDue)}`, heading: o.reminder ? 'Still waiting on you' : 'A new enquiry for you', body }), text };
}

export const emailMoved = (l: LeadCtx, to: string): { subject: string; html: string; text: string } => ({
  subject: `Moved to ${to} · ${headline(l)} · no action needed`,
  html: emailShell({ preheader: 'No action needed.', heading: 'Moved on, no action needed', body: card(`<b>${he(headline(l))}</b> (#${he(l.ref)}) wasn't accepted in time, so it moved to <b>${he(to)}</b>. You don't need to do anything.`) }),
  text: `${headline(l)} (#${l.ref}) was not accepted in time and moved to ${to}. No action needed.`,
});

export function emailUnassigned(l: LeadCtx, why: string, dashUrl: string): { subject: string; html: string; text: string } {
  const subject = `Needs a designer · ${l.priority ? '⭐ ' : ''}${headline(l)}`;
  const body = card(`<b>${he(headline(l))}</b> · #${he(l.ref)}<div style="margin:6px 0">${he(why)}</div>${mono(`${tel(l.callerNumber)} · call back by ${he(whenWords(l.callbackDue))}`)}${l.priority ? `<div style="color:${C.terracotta}"><b>⭐ PRIORITY</b> — ${he(l.priorityReason ?? '')}</div>` : ''}<div style="padding-top:8px">${button('Open and assign', dashUrl)}</div>`);
  return { subject, html: emailShell({ preheader: why, heading: 'Needs a designer', body }), text: `${subject}\n${why}\n${l.callerNumber ?? ''}\nOpen and assign: ${dashUrl}` };
}

/** Callback reminders / overdue nudges, batched: ONE email per designer, never five. */
export function emailBatch(title: string, items: Item[], now: Date): { subject: string; html: string; text: string } {
  const subject = `${title} · ${items.map((i) => i.headline.split(' · ')[0]).join(', ')}`;
  const body = items.map((i) => card(`<b>${he(i.headline)}</b>${mono(`#${he(i.ref)} · due ${he(whenWords(i.due, now))}${i.number ? ' · ' + tel(i.number) : ''}`)}${button('Open the lead', i.briefUrl)}`)).join('');
  return { subject, html: emailShell({ preheader: subject, heading: title, body }), text: `${title}\n` + items.map((i) => `- ${i.headline} (#${i.ref}) due ${whenWords(i.due, now)} ${i.briefUrl}`).join('\n') };
}

export function emailEscalation(l: LeadCtx, o: { briefUrl: string; repeat: number }): { subject: string; html: string; text: string } {
  const subject = `🚨 URGENT · existing client · ${l.callerName ?? l.fields?.name ?? 'caller'}${o.repeat ? ` (reminder ${o.repeat})` : ''}`;
  const body = card(`<b>An existing client needs a senior call within 15 minutes.</b>${mono(`#${he(l.ref)} · ${tel(l.callerNumber)} · call back by ${he(fmtTime(l.callbackDue))}`)}${l.existingClient?.designer_name ? `<div>Designer on the project: ${he(l.existingClient.designer_name)}</div>` : ''}${l.existingClient?.project ? `<div>Project: ${he(l.existingClient.project)}</div>` : ''}<div style="white-space:pre-line;margin-top:8px">${he(l.note)}</div><div style="padding-top:10px">${button('Open and take ownership', o.briefUrl)}</div>`, C.terracotta) +
    `<p style="font:13px/1.5 Helvetica,Arial,sans-serif;color:${C.muted}">This repeats every 10 minutes until someone opens it and taps “I've got it”.</p>`;
  return { subject, html: emailShell({ preheader: 'Existing client, senior callback needed', heading: 'Existing client: urgent', body }), text: `${subject}\n${l.note}\n${l.callerNumber ?? ''}\nOpen and take ownership: ${o.briefUrl}` };
}

export function emailCompliance(ref: string, hits: { rule: string; excerpt: string }[], briefUrl: string): { subject: string; html: string; text: string } {
  const subject = `🟥 HOUSE RULE BROKEN · #${ref}`;
  const body = card(`<b style="color:${C.alert}">The voice agent said something the never-say list forbids.</b>` + hits.slice(0, 5).map((h) => `<div style="margin:8px 0"><b>${he(RULE_LABEL[h.rule] ?? h.rule)}</b><div style="color:${C.muted}">“${he(h.excerpt)}”</div></div>`).join('') + `<div style="padding-top:6px">${button('Open brief', briefUrl)}</div>`, C.alert);
  return { subject, html: emailShell({ preheader: 'The agent broke a House Rule', heading: 'House Rule broken', body }), text: `${subject}\n` + hits.map((h) => `- ${RULE_LABEL[h.rule] ?? h.rule}: "${h.excerpt}"`).join('\n') + `\n${briefUrl}` };
}

// ------------------------------------------------------------------ Digests
export function emailDay(name: string, sections: DaySection[], now: Date, deskUrl: string): { subject: string; html: string; text: string } {
  const all = sections.flatMap((s) => s.items);
  const dueToday = sections.find((s) => /callback/i.test(s.title))?.items ?? [];
  const first = [...dueToday].sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0))[0];
  const subject = dueToday.length
    ? `${dueToday.length} callback${dueToday.length > 1 ? 's' : ''} due today · ${first.headline.split(' · ')[0]} by ${fmtTime(first.due)}`
    : `${all.length} thing${all.length > 1 ? 's' : ''} for your day`;
  const body = sections.filter((s) => s.items.length).map((s) =>
    `${label(s.title)}` + s.items.map((i) => card(`<b>${he(i.headline)}</b>${i.sub ? `<div style="color:${C.muted}">${he(i.sub)}</div>` : ''}${mono(`#${he(i.ref)}${i.due ? ' · due ' + he(whenWords(i.due, now)) : ''}${i.number ? ' · ' + tel(i.number) : ''}`)}${button('Open the lead', i.briefUrl)}`)).join('')).join('') +
    `<div style="padding:4px 0">${button('Open my dashboard', deskUrl, 'ghost')}</div>`;
  const text = `Your day, ${name}\n\n` + sections.filter((s) => s.items.length).map((s) => `${s.title}\n` + s.items.map((i) => `- ${i.headline}${i.due ? ' — ' + whenWords(i.due, now) : ''} (#${i.ref}) ${i.briefUrl}`).join('\n')).join('\n\n') + `\n\nMy dashboard: ${deskUrl}\n`;
  return { subject, html: emailShell({ preheader: subject, heading: `Good morning, ${name.split(' ')[0]}`, body }), text };
}

export function emailFrontDesk(sections: DaySection[], dashUrl: string): { subject: string; html: string; text: string } {
  const n = sections.reduce((a, s) => a + s.items.length, 0);
  const subject = `Front desk · ${n} to follow up this morning`;
  const body = sections.filter((s) => s.items.length).map((s) => label(s.title) + s.items.map((i) => card(`<b>${he(i.headline)}</b>${i.sub ? `<div style="color:${C.muted}">${he(i.sub)}</div>` : ''}${mono(`#${he(i.ref)}${i.number ? ' · ' + tel(i.number) : ''}`)}<div>${button('Open brief', i.briefUrl)}</div>`)).join('')).join('') + button('Open the dashboard', dashUrl, 'ghost');
  const text = sections.filter((s) => s.items.length).map((s) => `${s.title}\n` + s.items.map((i) => `- ${i.headline} (#${i.ref}) ${i.number ?? ''} ${i.sub ?? ''} ${i.briefUrl}`).join('\n')).join('\n\n');
  return { subject, html: emailShell({ preheader: subject, heading: 'Front-desk digest', body }), text };
}

// ------------------------------------------------------------------ Reports (Nikhil + designers)
export function emailReport(o: { subject: string; heading: string; intro: string; rows: StatRow[]; extra?: string; ctaLabel?: string; ctaUrl?: string; compare?: boolean }): { subject: string; html: string; text: string } {
  const th = (s: string) => `<td style="padding:6px 8px;font:11px 'Courier New',monospace;letter-spacing:.1em;text-transform:uppercase;color:${C.muted};border-bottom:1px solid ${C.clay}">${s}</td>`;
  const rows = o.rows.map((r) => `<tr><td style="padding:8px;border-bottom:1px solid ${C.clay}">${he(r.label)}${r.note ? `<div style="font-size:12px;color:${C.muted}">${he(r.note)}</div>` : ''}</td><td align="right" style="padding:8px;border-bottom:1px solid ${C.clay};font:600 17px 'Courier New',monospace;color:${C.ink}">${he(r.value)}</td>${o.compare ? `<td align="right" style="padding:8px;border-bottom:1px solid ${C.clay};font:13px 'Courier New',monospace;color:${C.muted}">${he(r.prev ?? '—')}</td>` : ''}</tr>`).join('');
  const body = `<p style="margin:0 0 14px;font:16px/1.5 Georgia,serif;color:${C.ink}">${he(o.intro)}</p>` +
    card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${th('')}${th('Now')}${o.compare ? th('Before') : ''}</tr>${rows}</table>`) + (o.extra ?? '') +
    (o.ctaUrl ? `<div style="padding:4px 0">${button(o.ctaLabel ?? 'Open', o.ctaUrl)}</div>` : '');
  const text = `${o.heading}\n\n${o.intro}\n\n` + o.rows.map((r) => `${r.label}: ${r.value}${o.compare && r.prev ? ` (before: ${r.prev})` : ''}`).join('\n') + (o.ctaUrl ? `\n\n${o.ctaUrl}` : '');
  return { subject: o.subject, html: emailShell({ preheader: o.intro, heading: o.heading, body }), text };
}

export function emailConsultation(o: { headline: string; ref: string; when: Date; location: string; number: string | null; note: string }): { subject: string; html: string; text: string } {
  const subject = `Consultation booked · ${o.headline} · ${fmtDayDateTime(o.when)}`;
  const body = card(`${label(`Ref ${o.ref}`)}<b>${he(o.headline)}</b><div>${he(fmtDayDateTime(o.when))} · ${he(o.location)}</div><div style="font:13px 'Courier New',monospace;margin-top:4px">${he(o.number ?? '')}</div>`) +
    card(`${label('Handoff note')}<div style="white-space:pre-line">${he(o.note)}</div>`) +
    `<p style="font:13px/1.5 Helvetica,Arial,sans-serif;color:${C.muted}">The calendar invite is attached (.ics). Open it to add this to your calendar.</p>`;
  return { subject, html: emailShell({ preheader: subject, heading: 'Consultation on your calendar', body }), text: `${subject}\n\n${o.note}\n` };
}
