import type { ReactNode } from "react";

export function PageHeader({
  title,
  tier: _tier,
  prd: _prd,
  action,
  showSearch = false,
}: {
  title: string;
  tier?: string;
  prd?: string;
  action?: ReactNode;
  showSearch?: boolean;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <h1 className="font-poppins text-3xl font-bold tracking-tight text-[#16192c]">
        {title}
      </h1>

      <div className="flex items-center gap-3">
        {showSearch && (
          <div className="relative min-w-[260px]">
            <input
              type="search"
              placeholder="Search for anything...."
              className="w-full rounded-2xl border border-[#edf0f7] bg-white py-2.5 pl-4 pr-10 font-roboto text-xs font-normal text-[#16192c] placeholder-[#8d94a8] outline-none shadow-sm focus:border-[#544af7]"
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
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8d94a8]"
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
