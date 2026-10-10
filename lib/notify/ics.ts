// Minimal RFC 5545 calendar invite for a booked consultation.
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function buildIcs(o: {
  uid: string; start: Date; durationMin?: number; summary: string; description: string; location: string;
  organizerEmail?: string; attendeeEmail?: string; attendeeName?: string;
}): string {
  const end = new Date(o.start.getTime() + (o.durationMin ?? 60) * 60_000);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aangan Studio//Phone Enquiry Assistant//EN', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT', `UID:${o.uid}@aangan.studio`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(o.start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(o.summary)}`, `DESCRIPTION:${esc(o.description)}`, `LOCATION:${esc(o.location)}`,
    ...(o.organizerEmail ? [`ORGANIZER;CN=Aangan Studio:mailto:${o.organizerEmail}`] : []),
    ...(o.attendeeEmail ? [`ATTENDEE;CN=${esc(o.attendeeName ?? 'Designer')};ROLE=REQ-PARTICIPANT:mailto:${o.attendeeEmail}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Consultation in 30 minutes', 'END:VALARM',
    'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
