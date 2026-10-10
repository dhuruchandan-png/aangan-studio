import Link from 'next/link';
import { LeadActions } from '@/components/me/LeadActions';
import { Badge, Label, StatusChip, cx } from '@/components/ui';

export interface LeadCardData {
  ref: string;
  headline: string;
  status: string;
  /** e.g. "Call back by 11:00" (already formatted in IST) */
  dueLabel: string | null;
  overdue?: boolean;
  priority?: boolean;
  referral?: string | null;
  simulated?: boolean;
  phone?: string | null;
  noteLines: string[];
  stillUnknown: string[];
  priceAsked?: boolean;
  /** minutes of working time this lead has waited for acceptance (routed only) */
  waitedMin?: number | null;
  /** consultation line, for the Consultations section */
  consult?: string | null;
  readOnly?: boolean;
}

/** One lead on the designer's dashboard. Server markup; the buttons are a client island. */
export function LeadCard({ lead }: { lead: LeadCardData }) {
  const routed = lead.status === 'routed';
  const tel = lead.phone ? lead.phone.replace(/[^\d+]/g, '') : '';
  return (
    <li className={cx('sheet animate-settle p-4 sm:p-5', lead.overdue && '!border-terracotta', routed && !lead.overdue && '!border-brass')}>
      <i className="reg tl" /><i className="reg tr" /><i className="reg bl" /><i className="reg br" />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="num text-xs font-medium text-muted">{lead.ref}</span>
        <StatusChip status={lead.status} />
        {lead.priority && <Badge tone="terracotta">Priority</Badge>}
        {lead.referral && <Badge tone="brass">Referral · {lead.referral}</Badge>}
        {lead.simulated && <Badge tone="indigo">Simulated</Badge>}
      </div>

      <h3 className="display mt-2 text-xl font-semibold leading-snug text-ink">{lead.headline}</h3>

      {lead.dueLabel && (
        <p className={cx('num mt-1 text-2xl font-semibold leading-tight', lead.overdue ? 'text-terracotta-deep' : 'text-ink')}>
          {lead.dueLabel}{lead.overdue && <span className="ml-2 align-middle text-xs font-semibold uppercase tracking-wider">overdue</span>}
        </p>
      )}
      {lead.consult && <p className="num mt-1 text-lg font-semibold text-ink">{lead.consult}</p>}

      {lead.phone && (
        <a href={`tel:${tel}`} className="num mt-2 inline-flex min-h-[48px] items-center gap-2 rounded border border-clay bg-plaster/60 px-3 text-base font-medium text-indigo underline-offset-2 hover:underline">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3.5 2.5h2.2l1 3-1.4 1c.7 1.5 1.9 2.7 3.4 3.4l1-1.4 3 1v2.2c0 .6-.5 1-1 1C7 12.7 3.3 9 3 3.5c0-.6.4-1 .5-1z" /></svg>
          <span className="sr-only">Call </span>{lead.phone}
        </a>
      )}

      {routed && lead.waitedMin != null && (
        <div className="mt-3 rounded border border-brass/50 bg-[#F5EBD2] px-3 py-2 text-sm text-brass-deep">
          Waiting <b className="num">{Math.max(0, Math.round(lead.waitedMin))} min</b>. It moves to the next designer after 15 minutes of working time.
        </div>
      )}
      {lead.priceAsked && (
        <div className="mt-3 rounded border border-brass/50 bg-[#F5EBD2] px-3 py-2 text-sm text-brass-deep"><b>Asked about price.</b> No figure was quoted; be ready to speak to it.</div>
      )}

      {lead.noteLines.length > 0 && (
        <div className="mt-3 rounded border border-clay bg-plaster/50 p-3 text-sm leading-relaxed">
          {lead.noteLines.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}
      {lead.stillUnknown.length > 0 && (
        <div className="mt-3">
          <Label>Still unknown</Label>
          <p className="mt-0.5 text-sm text-muted">{lead.stillUnknown.join(' · ')}</p>
        </div>
      )}

      <div className="mt-4">
        <Link href={`/me/lead/${encodeURIComponent(lead.ref)}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-indigo underline underline-offset-2">Open full brief →</Link>
      </div>

      {!lead.readOnly && (
        <div className="mt-2 border-t border-clay pt-3">
          <LeadActions refCode={lead.ref} status={lead.status} compact />
        </div>
      )}
    </li>
  );
}
