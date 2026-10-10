// Pure mapping from an Aangan enquiry to HubSpot shapes. No network, no database: fully unit-tested.
export type StageKey = 'unsure' | 'routed' | 'accepted' | 'called_back' | 'consult_booked' | 'lost';

/** Which deal stage an enquiry belongs in. "Deal Won" is never automatic: only a person can decide that. */
export function stageKeyFor(e: { verdict: string | null; status: string }): StageKey {
  if (e.verdict === 'not_a_fit' || e.status === 'not_proceeding') return 'lost';
  if (e.status === 'consult_booked') return 'consult_booked';
  if (e.status === 'called_back') return 'called_back';
  if (e.status === 'accepted') return 'accepted';
  if (e.verdict === 'unsure') return 'unsure';
  return 'routed';
}

/** Labels of the stages in the account's existing pipeline that each key maps to (resolved to ids at setup). */
export const DEFAULT_STAGE_LABELS: Record<StageKey, string> = {
  unsure: 'Visitor Engaged', routed: 'Lead Captured', accepted: 'Lead Nurtured',
  called_back: 'Lead Nurtured', consult_booked: 'Demo delivered', lost: 'Deal Lost',
};

export const splitName = (name?: string | null): { first: string; last: string } => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
};

/** HubSpot matches phones on area code + local number, so compare the last 10 digits. */
export const last10 = (phone?: string | null): string | null => {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
};

export interface CrmLead {
  kind: 'lead' | 'existing_client';
  ref: string; name: string | null; phone: string | null; locality: string | null;
  propertyType: string | null; bhk: string | null; carpetSqft: number | null; scope: string | null;
  timeline: string | null; source: string | null; referral: string | null;
  verdict: string | null; status: string; priority: boolean; priorityReason: string | null;
  note: string; stillUnknown: string[]; designerName: string | null; designerEmail: string | null;
  dashboardUrl: string; callAtIso: string; sample?: boolean;
}

const clip = (s: string | null | undefined, n: number): string => (s ?? '').slice(0, n);

export const dealName = (l: CrmLead): string => [l.ref, l.name ?? 'Caller', l.locality].filter(Boolean).join(' · ');

export function dealProperties(l: CrmLead): Record<string, string | number> {
  const p: Record<string, string | number | null> = {
    dealname: dealName(l), aangan_ref: l.ref, aangan_verdict: l.verdict, aangan_status: l.status,
    aangan_handoff_note: clip(l.note, 8000), aangan_property_type: l.propertyType, aangan_locality: l.locality,
    aangan_carpet_sqft: l.carpetSqft, aangan_timeline: l.timeline, aangan_source: l.source, aangan_referral: l.referral,
    aangan_priority: l.priority ? `Yes: ${l.priorityReason ?? ''}`.trim() : 'No', aangan_dashboard_link: l.dashboardUrl,
  };
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined && v !== '')) as Record<string, string | number>;
}

export function contactProperties(l: CrmLead, o: { creating: boolean; existing?: { firstname?: string; lastname?: string } }): Record<string, string> {
  const { first, last } = splitName(l.name);
  const p: Record<string, string> = { aangan_last_ref: l.ref };
  if (l.locality) p.city = l.locality;
  if (l.source) p.aangan_source = l.source;
  if (l.referral) p.aangan_referral = l.referral;
  // never overwrite what a human already typed in HubSpot
  if (o.creating) { p.firstname = first || 'Caller'; if (last) p.lastname = last; if (l.phone) p.phone = l.phone; }
  else { if (first && !o.existing?.firstname) p.firstname = first; if (last && !o.existing?.lastname) p.lastname = last; }
  return p;
}

const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The note that lands on the deal (and contact): the same brief the designer got. */
export function summaryNoteHtml(l: CrmLead): string {
  const rows: [string, string | null][] = [
    ['Verdict', l.verdict], ['Where', [l.locality, l.propertyType, l.bhk].filter(Boolean).join(' · ') || null],
    ['Size', l.carpetSqft ? `~${l.carpetSqft.toLocaleString('en-IN')} sq ft carpet` : null], ['Scope', l.scope],
    ['Timeline', l.timeline], ['Source', l.referral ? `Referral: ${l.referral}` : l.source], ['Assigned to', l.designerName],
  ];
  return `<p><b>Aangan phone enquiry ${esc(l.ref)}</b>${l.priority ? ` &nbsp;⭐ PRIORITY: ${esc(l.priorityReason)}` : ''}</p>` +
    `<p>${rows.filter(([, v]) => v).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join('<br>')}</p>` +
    `<p><b>Handoff note</b><br>${esc(l.note).replace(/\n/g, '<br>')}</p>` +
    (l.stillUnknown.length ? `<p><b>Still to find out:</b> ${esc(l.stillUnknown.join('; '))}</p>` : '') +
    `<p><a href="${esc(l.dashboardUrl)}">Open in the Aangan dashboard</a></p>`;
}

const EVENT_TEXT: Record<string, string> = {
  accept: 'accepted the lead', called_back: 'called the client back', book: 'booked a consultation', not_proceeding: 'marked the lead not proceeding',
  pass: 'passed the lead on', reassign: 'reassigned the lead', assign: 'was assigned the lead', fd_called: 'front desk called the client', ack: 'took ownership of the escalation',
};
export const eventNoteHtml = (event: string, who: string | null, detail?: string): string | null =>
  EVENT_TEXT[event] ? `<p><b>Aangan:</b> ${esc(who ?? 'The studio')} ${esc(EVENT_TEXT[event])}${detail ? ` (${esc(detail)})` : ''}.</p>` : null;

/** Custom properties the integration needs. Created once by `npm run hubspot:setup`. */
export const CUSTOM_PROPERTIES: { object: 'deals' | 'contacts'; name: string; label: string; type: 'string' | 'number'; fieldType: 'text' | 'textarea' | 'number' }[] = [
  { object: 'deals', name: 'aangan_ref', label: 'Aangan enquiry ref', type: 'string', fieldType: 'text' },
  { object: 'deals', name: 'aangan_verdict', label: 'Aangan verdict', type: 'string', fieldType: 'text' },
  { object: 'deals', name: 'aangan_status', label: 'Aangan status', type: 'string', fieldType: 'text' },
  { object: 'deals', name: 'aangan_handoff_note', label: 'Aangan handoff note', type: 'string', fieldType: 'textarea' },
  { object: 'deals', name: 'aangan_property_type', label: 'Property type', type: 'string', fieldType: 'text' },
  { object: 'deals', name: 'aangan_locality', label: 'Locality', type: 'string', fieldType: 'text' },
  { object: 'deals', name: 'aangan_carpet_sqft', label: 'Carpet area (sq ft)', type: 'number', fieldType: 'number' },
  { object: 'deals', name: 'aangan_timeline', label: 'Timeline wanted', type: 'string', fieldType: 'text' },
  { object: 'deals', name: 'aangan_source', label: 'How they heard of us', type: 'string', fieldType: 'text' },
  { object: 'deals', name: 'aangan_referral', label: 'Referred by', type: 'string', fieldType: 'text' },
  { object: 'deals', name: 'aangan_priority', label: 'Priority caller', type: 'string', fieldType: 'text' },
  { object: 'deals', name: 'aangan_dashboard_link', label: 'Aangan dashboard link', type: 'string', fieldType: 'text' },
  { object: 'contacts', name: 'aangan_last_ref', label: 'Latest Aangan enquiry', type: 'string', fieldType: 'text' },
  { object: 'contacts', name: 'aangan_source', label: 'How they heard of Aangan', type: 'string', fieldType: 'text' },
  { object: 'contacts', name: 'aangan_referral', label: 'Referred to Aangan by', type: 'string', fieldType: 'text' },
];
