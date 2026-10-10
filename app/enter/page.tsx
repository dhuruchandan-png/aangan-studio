import { redirect } from 'next/navigation';
import { RoomScene } from '@/components/art';
import { CourtyardPlan } from '@/components/ui';
import { db } from '@/lib/db';
import { demoOpen } from '@/lib/demo';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Designer sign-in · Aangan Studio' };

const TINTS = ['#B8573A', '#2F4A6D', '#6F8A6E', '#B8913F', '#7A4E2D', '#8C5A7A'];
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const tint = (n: string) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TINTS[h % TINTS.length]; };

export default async function Enter() {
  if (!demoOpen()) redirect('/login');
  let designers: { id: string; name: string; specialities: string[] | null; on_leave: boolean }[] = [];
  let open = new Map<string, number>();
  try {
    designers = (await db().from('designers').select('id, name, specialities, on_leave').eq('active', true).order('name')).data ?? [];
    const { data } = await db().from('enquiries').select('assigned_designer_id, status').in('status', ['routed', 'accepted']);
    for (const r of (data ?? []) as { assigned_designer_id: string | null }[]) if (r.assigned_designer_id) open.set(r.assigned_designer_id, (open.get(r.assigned_designer_id) ?? 0) + 1);
  } catch { /* the grid simply stays empty */ }

  return (
    <main className="min-h-screen">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[5fr_7fr] lg:py-16">
        <section className="lg:sticky lg:top-12 lg:self-start">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F7E3DA] text-terracotta"><CourtyardPlan size={26} /></span>
            <div className="leading-none"><div className="display text-3xl font-semibold">Aangan</div><div className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted">Studio · Pune</div></div>
          </div>
          <h1 className="display mt-8 text-4xl font-semibold leading-tight md:text-5xl">Welcome back to your desk.</h1>
          <p className="mt-3 max-w-md text-muted">Pick your name to see the leads waiting for you, the callbacks you promised, and how your week is going.</p>
          <RoomScene className="mt-8 w-full max-w-md rounded-3xl shadow-lift" />
          <a href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-indigo underline-offset-2 hover:underline">← Studio dashboard</a>
        </section>

        <section aria-label="Designers">
          <div className="mb-4 flex items-baseline justify-between"><h2 className="display text-2xl font-semibold">Sign in as</h2><span className="text-xs text-muted">{designers.length} designers</span></div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {designers.map((d) => (
              <li key={d.id}>
                <form method="post" action="/api/demo/as">
                  <input type="hidden" name="designer" value={d.id} />
                  <button type="submit" className="sheet lift group flex w-full items-center gap-3.5 p-4 text-left focus-visible:outline-2">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white shadow-card" style={{ background: tint(d.name) }}>{initials(d.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{d.name}</span>
                      <span className="block truncate text-xs text-muted">{(d.specialities ?? []).join(' · ') || 'Designer'}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      {(open.get(d.id) ?? 0) > 0 ? <span className="rounded-full bg-[#F5EBD2] px-2 py-0.5 text-[11px] font-semibold text-brass-deep">{open.get(d.id)} open</span> : <span className="text-[11px] text-muted">{d.on_leave ? 'away' : 'free'}</span>}
                      <span className="text-lg text-terracotta transition-transform group-hover:translate-x-0.5">→</span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
