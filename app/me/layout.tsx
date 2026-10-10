import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { MeHeader } from '@/components/me/MeHeader';
import { TickPing } from '@/components/TickPing';
import { InkFilter } from '@/components/ui';
import { demoOpen } from '@/lib/demo';
import { listDesigners } from '@/lib/leads';
import { sessionFromCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const demo = demoOpen();
  const s = await sessionFromCookieHeader((await headers()).get('cookie'));
  if (s?.r !== 'designer' || !s.d) redirect(demo ? '/enter' : '/login');
  let name = s.n ?? '';
  let options: { id: string; name: string }[] = [];
  if (demo) {
    try {
      const all = await listDesigners();
      options = all.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name }));
      name = all.find((d) => d.id === s.d)?.name ?? name;
    } catch { /* the page body shows the database error */ }
  }
  const first = name.trim().split(/\s+/)[0] || 'there';
  return (
    <div className="min-h-screen">
      <InkFilter />
      <TickPing />
      <MeHeader firstName={first} demo={demo} designers={options} currentId={s.d} />
      <main className="mx-auto max-w-3xl">{children}</main>
    </div>
  );
}
