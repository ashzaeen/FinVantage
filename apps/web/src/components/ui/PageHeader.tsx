import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
  showSearch = false,
}: {
  title: string;
  /** One sentence under the title. Put it here rather than in a second heading inside the page. */
  subtitle?: string;
  action?: ReactNode;
  showSearch?: boolean;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:mb-8">
      <div className="min-w-0">
        <h1 className="font-poppins text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>

      <div className="flex min-w-0 max-w-full items-center gap-3">
        {showSearch && (
          <div className="relative w-full min-w-0 sm:min-w-[260px]">
            <input
              type="search"
              placeholder="Search for anything...."
              className="w-full rounded-2xl border border-line bg-raised py-2.5 pl-4 pr-10 font-roboto text-xs font-normal text-ink placeholder-muted outline-none shadow-sm focus:border-accent-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            />
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
        )}
        {action}
      </div>
    </header>
  );
}
