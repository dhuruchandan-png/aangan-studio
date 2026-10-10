// DEMO_OPEN=true: the dashboard needs no sign-in (for reviewers), anyone can "view as" any employee, and the
// sample data (stored as simulated rows, so it never mixes with real numbers) is included in every view.
// Set DEMO_OPEN=false (or remove it) at go-live: sign-in is enforced again, and sample rows drop out of the figures.
export const demoOpen = (): boolean => process.env.DEMO_OPEN === 'true';
/** For `.in('simulated', …)` filters: real rows only, or real + sample rows in demo mode. */
export const simScope = (): boolean[] => (demoOpen() ? [true, false] : [false]);
export const AS_COOKIE = 'aangan_as';
