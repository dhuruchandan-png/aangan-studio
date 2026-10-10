'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CourtyardPlan, Wordmark } from './ui';

const ICON: Record<string, string> = {
  home: 'M2.5 8 8 3l5.5 5M4 7v6h8V7M6.5 13v-3.5h3V13',
  door: 'M4 13V3h8v10M4 13h8M9.5 8h.01M2 13h12',
  book: 'M3.5 3h6a2 2 0 0 1 2 2v8h-6a2 2 0 0 1-2-2zM11.5 5h1v8M5.5 6h4',
  team: 'M5.5 7a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM1.5 13c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6M11 7.2a1.9 1.9 0 1 0 0-3.8M11.5 9.6c1.7.2 3 1.4 3 3.4',
  roster: 'M3 3.5h10v9H3zM3 6.5h10M6 3.5v9',
  rules: 'M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4zM5.8 8l1.6 1.6L10.5 6.5',
  mail: 'M2.5 4h11v8h-11zM2.5 4.5 8 9l5.5-4.5',
  flask: 'M6.5 2.5h3M7 2.5v4L3.5 12.5a1 1 0 0 0 .9 1.5h7.2a1 1 0 0 0 .9-1.5L9 6.5v-4M5 10h6',
};
const ITEMS = [
  { href: '/', icon: 'home', label: 'The Courtyard', plain: 'Overview & cost', match: (p: string) => p === '/' },
  { href: '/front-door', icon: 'door', label: 'Front Door', plain: 'Live calls', match: (p: string) => p.startsWith('/front-door') },
  { href: '/brief', icon: 'book', label: 'Brief Book', plain: 'One enquiry in detail', match: (p: string) => p.startsWith('/brief') },
  { href: '/mail', icon: 'mail', label: 'Email Trail', plain: 'Sent and acted on', match: (p: string) => p.startsWith('/mail') },
  { href: '/team', icon: 'team', label: 'Team', plain: 'Who has what', match: (p: string) => p.startsWith('/team') },
  { href: '/roster', icon: 'roster', label: 'Studio Roster', plain: 'Designers & rota', match: (p: string) => p.startsWith('/roster') },
  { href: '/house-rules', icon: 'rules', label: 'House Rules', plain: 'Script & sign-off', match: (p: string) => p.startsWith('/house-rules') },
];

const Ico = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

export function Rail({ briefHref }: { briefHref: string }) {
  const path = usePathname() ?? '/';
  return (
    <>
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between bg-gradient-to-b from-espresso to-espresso-2 px-4 py-6 md:flex">
        <div>
          <Link href="/" className="block px-2"><Wordmark inverse /></Link>
          <nav className="mt-9 space-y-1" aria-label="Screens">
            {ITEMS.map((i) => {
              const active = i.match(path);
              return (
                <Link key={i.href} href={i.href === '/brief' ? briefHref : i.href} aria-current={active ? 'page' : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${active ? 'bg-gold/15 text-[#FFF6E6]' : 'text-[#CDBFAA] hover:bg-white/5 hover:text-[#FFF6E6]'}`}>
                  {active && <span className="absolute -left-4 top-2 h-8 w-1 rounded-r bg-gold" />}
                  <span className={active ? 'text-gold' : 'text-[#9C8C76] group-hover:text-gold'}><Ico d={ICON[i.icon]} /></span>
                  <span className="min-w-0">
                    <span className={`block text-[15px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>{i.label}</span>
                    <span className="block truncate text-[11px] opacity-60">{i.plain}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-[#CDBFAA]">
            <div className="flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-sage" /></span><span className="font-medium text-[#FFF6E6]">Assistant online</span></div>
            <div className="mt-1 opacity-70">Answering every call, day and night.</div>
          </div>
          <Link href="/enter" className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2.5 text-sm font-medium text-[#FFF6E6] transition-colors hover:bg-gold/20"><Ico d={ICON.team} />Designer sign-in</Link>
        </div>
      </aside>

      {/* mobile top bar + tab strip */}
      <div className="sticky top-0 z-20 bg-espresso text-[#FFF6E6] md:hidden">
        <div className="flex items-center justify-between px-4 py-2.5"><Link href="/" className="flex items-center gap-2"><CourtyardPlan className="text-gold" size={22} /><span className="display text-xl font-semibold">Aangan</span></Link></div>
        <nav className="flex gap-1.5 overflow-x-auto px-3 pb-2.5" aria-label="Screens">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href === '/brief' ? briefHref : i.href} aria-current={i.match(path) ? 'page' : undefined}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${i.match(path) ? 'bg-gold font-semibold text-espresso' : 'bg-white/10 text-[#E8D9C2]'}`}><Ico d={ICON[i.icon]} />{i.label}</Link>
          ))}
          <Link href="/enter" className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gold/50 px-3 py-1.5 text-sm text-gold"><Ico d={ICON.team} />Designer sign-in</Link>
        </nav>
      </div>
    </>
  );
}
