import { simScope } from '@/lib/demo';
import Link from 'next/link';
import { Rail } from '@/components/nav';
import { TickPing } from '@/components/TickPing';
import { InkFilter } from '@/components/ui';
import { db } from '@/lib/db';
import { liveRules } from '@/lib/rules/store';
import { openRuleBreaks } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let briefHref = '/front-door';
  let approved: boolean | null = null;
  let breaks = 0;
  let setupError: string | null = null;
  try {
    const { data } = await db().from('enquiries').select('ref').in('simulated', simScope()).order('first_contact_at', { ascending: false }).limit(1);
    if (data?.[0]) briefHref = `/brief/${data[0].ref}`;
    approved = !!(await liveRules());
    breaks = await openRuleBreaks();
  } catch (e) {
    setupError = (e as Error).message;
  }
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <InkFilter />
      <TickPing />
      <Rail briefHref={briefHref} />
      <div className="min-w-0 flex-1">
        {setupError && (
          <div role="alert" className="border-b border-brass/50 bg-[#F5EBD2] px-4 py-1.5 text-xs text-brass-deep md:px-8">
            The database is not connected yet ({setupError}). Fill in <code className="num">DATABASE_URL</code> in <code className="num">.env.local</code> and run <code className="num">npm run db:setup</code>.
          </div>
        )}
        {breaks > 0 && (
          <div role="alert" className="border-b border-alert bg-[#F6DDD8] px-4 py-1.5 text-xs font-medium text-alert md:px-8">
            🟥 {breaks} House Rule breach{breaks > 1 ? 'es' : ''} to review: the agent said something the never-say list forbids. <Link href="/front-door?rule=1" className="underline">See which calls →</Link>
          </div>
        )}
        <main>{children}</main>
      </div>
    </div>
  );
}
