import { Sheet, Label, Wordmark } from '@/components/ui';
import { verifyToken } from '@/lib/notify/links';

export const dynamic = 'force-dynamic';

/** Landing page for the emailed sign-in link. It only shows a button: nothing happens on GET (scanners prefetch links). */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const t = sp.t ?? '';
  let valid = false;
  let name = '';
  try { const p = verifyToken(t); valid = !!p && p.a === 'login'; name = p?.n ?? ''; } catch { valid = false; }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-8">
      <div className="flex justify-center"><Wordmark /></div>
      <Sheet>
        {valid ? (
          <>
            <Label>Sign in</Label>
            <h1 className="display mt-1 text-2xl font-semibold">Welcome{name && !name.includes('@') ? `, ${name.split(' ')[0]}` : ''}.</h1>
            <p className="mt-2 text-sm text-muted">Tap the button to open your dashboard on this device.</p>
            <form method="post" action="/api/auth/verify" className="mt-5">
              <input type="hidden" name="t" value={t} />
              <input type="hidden" name="next" value={sp.next ?? ''} />
              <button className="btn btn-primary min-h-[52px] w-full justify-center text-base">Open my dashboard</button>
            </form>
          </>
        ) : (
          <>
            <h1 className="display text-2xl font-semibold">This link isn&apos;t valid any more</h1>
            <p className="mt-2 text-sm text-muted">Sign-in links work once and expire after 20 minutes. Ask for a fresh one.</p>
            <a href="/login" className="btn btn-primary mt-4 min-h-[48px] w-full justify-center">Back to sign in</a>
          </>
        )}
      </Sheet>
    </main>
  );
}
