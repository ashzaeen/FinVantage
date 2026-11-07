/** `tier` and `prd` are scaffolding so people can see what a page is for. Remove before the demo. */
export function PageHeader({ title, tier, prd }: { title: string; tier: string; prd: string }) {
  return (
    <header className="mb-6 flex items-baseline justify-between gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <span className="shrink-0 text-xs text-muted">
        {tier} · PRD {prd}
      </span>
    </header>
  );
}
