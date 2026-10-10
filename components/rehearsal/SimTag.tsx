export function SimTag({ text = 'Simulated' }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-indigo/50 bg-[#E2E8F0] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 2h4M7 2v4L3 13a1 1 0 0 0 .9 1.5h8.2A1 1 0 0 0 13 13L9 6V2" /></svg>{text}
    </span>
  );
}
