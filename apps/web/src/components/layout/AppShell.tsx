"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_ITEMS } from "@/lib/nav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen md:flex">
      <nav
        aria-label="Main"
        className="flex gap-1 overflow-x-auto border-b border-line p-3 md:w-52 md:shrink-0 md:flex-col md:border-r md:border-b-0"
      >
        <span className="mr-3 self-center font-semibold md:mr-0 md:mb-4 md:self-start md:px-2">
          FinVantage
        </span>
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded px-2 py-1 text-sm ${
                active ? "bg-raised font-medium text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
