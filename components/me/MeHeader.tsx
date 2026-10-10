import Link from 'next/link';
import { Wordmark } from '@/components/ui';

export interface SwitchOption { id: string; name: string }

/** Slim sticky header for the designer shell. In demo mode it carries the "view as employee" switcher instead of sign-out. */
export function MeHeader({ firstName, demo, designers, currentId }: { firstName: string; demo?: boolean; designers?: SwitchOption[]; currentId?: string }) {
  return (
    <header className="sticky top-0 z-20 bg-espresso text-[#FFF6E6] shadow-lg">
      <div className="mx-auto flex min-h-[60px] max-w-3xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1">
        <Link href="/me" aria-label="Aangan Studio, my dashboard" className="flex min-h-[48px] items-center"><Wordmark inverse /></Link>
        {demo ? (
          <form method="post" action="/api/demo/as" className="flex flex-wrap items-center gap-2">
            <label htmlFor="who" className="text-[11px] font-medium uppercase tracking-[0.18em] text-gold">Profile</label>
            <select id="who" name="designer" defaultValue={currentId} className="field !w-auto !min-h-[44px] !py-1.5 text-sm font-medium">
              {(designers ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button type="submit" className="btn btn-ghost !min-h-[44px] text-sm">Switch</button>
            <button type="submit" name="designer" value="studio" className="btn !min-h-[44px] border border-white/20 bg-white/5 px-3 text-sm text-[#E8D9C2] hover:bg-white/10">Studio dashboard</button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#E8D9C2]">Hi <b className="font-semibold text-white">{firstName}</b></span>
            <form method="post" action="/api/auth/logout">
              <button type="submit" className="btn min-h-[48px] border border-white/20 bg-white/5 px-3 text-sm text-[#E8D9C2]">Sign out</button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
