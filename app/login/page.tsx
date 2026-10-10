import { redirect } from 'next/navigation';
import { Sheet, Wordmark } from '@/components/ui';
import { demoOpen } from '@/lib/demo';

export const dynamic = 'force-dynamic';

type SP = { next?: string; error?: string; sent?: string; expired?: string };

export default async function LoginPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (demoOpen()) redirect('/'); // the dashboard is open in demo mode
  const sp = await searchParams;
  const next = typeof sp.next === 'string' && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '';
  const failed = sp.error === '1';
  const sent = sp.sent === '1';
  const expired = sp.expired === '1';
  return (
    <main className="flex min-h-screen items-center justify-center bg-plaster px-4 py-10">
      <div className="w-full max-w-sm">
        <Sheet className="!p-0 overflow-hidden">
          <div className="relative h-20 overflow-hidden border-b border-clay bg-plaster/70">
            <div className="jaali absolute inset-0" aria-hidden />
            <div className="relative flex h-full items-center justify-center"><Wordmark /></div>
          </div>
          <div className="p-6">
            <h1 className="display text-2xl font-semibold text-ink">Welcome to the courtyard.</h1>
            <p className="mt-1 text-sm text-muted">Designers, your leads are waiting inside.</p>

            {sent && (
              <div role="status" className="mt-4 rounded border border-sage/50 bg-[#E6EEE5] px-3 py-2.5 text-sm text-sage-deep">
                If that address is on the studio roster, a sign-in link is on its way. It works once and lasts 20 minutes. Check spam if it doesn&apos;t arrive in a minute.
              </div>
            )}
            {expired && (
              <div role="alert" className="mt-4 rounded border border-brass/50 bg-[#F5EBD2] px-3 py-2.5 text-sm text-brass-deep">
                That link has expired or was already used. Ask for a new one.
              </div>
            )}

            <form method="post" action="/api/auth/request-link" className="mt-5 space-y-4">
              {next && <input type="hidden" name="next" value={next} />}
              <div>
                <label htmlFor="email" className="annot">Designers: sign in with your email</label>
                <input id="email" name="email" type="email" autoComplete="email" autoFocus required inputMode="email" placeholder="you@aangan.studio" className="field mt-1 min-h-[48px]" />
              </div>
              <button type="submit" className="btn btn-primary min-h-[48px] w-full justify-center">Email me a sign-in link</button>
            </form>

            <details className="mt-6 border-t border-clay pt-4" open={failed || undefined}>
              <summary className="cursor-pointer text-sm font-medium text-indigo">Nikhil / front desk: studio passcode</summary>
              <form method="post" action="/api/auth/login" className="mt-3 space-y-3">
                <input type="hidden" name="next" value={next || '/'} />
                <div>
                  <label htmlFor="passcode" className="annot">Passcode</label>
                  <input id="passcode" name="passcode" type="password" autoComplete="current-password" required className="field mt-1 min-h-[48px]" aria-describedby={failed ? 'login-error' : undefined} aria-invalid={failed || undefined} />
                </div>
                {failed && <p id="login-error" role="alert" className="text-sm font-medium text-alert">That passcode didn&apos;t match. Try again.</p>}
                <button type="submit" className="btn btn-ghost min-h-[48px] w-full justify-center">Come in</button>
              </form>
            </details>
          </div>
        </Sheet>
      </div>
    </main>
  );
}
