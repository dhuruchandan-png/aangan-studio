// Plain-data props shared by the Rehearsal Room tabs (all JSON-serialisable, safe to pass from a server page).
export interface FixtureOption { id: string; label: string; date: string; expected: string[]; missed: boolean; priority: boolean }
export interface DesignerOption { id: string; name: string }
export interface EnquiryRow { ref: string; caller_number: string | null; caller_name: string | null; locality: string | null; verdict: string | null; status: string; first_contact_at: string; simulated: boolean }
export interface WaitingRow { ref: string; designer: string | null; sentAt: string }

export const SIM = 'Simulated';
