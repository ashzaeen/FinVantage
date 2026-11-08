"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_GROUPS, NAV_ITEMS, OVERVIEW_ITEM, SETTINGS_ITEM, type NavItem } from "@/lib/nav";
import { AccountCard } from "./AccountCard";

/* ─── Navigation SVG Icons (Clean, Consistent 20x20 Stroke) ─────────────────── */
function OverviewIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function AccountsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="15" rx="3" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <circle cx="16" cy="15" r="1.5" fill="currentColor" />
    </svg>
  );
}

function TransactionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="4" x2="7" y2="20" />
      <polyline points="3 8 7 4 11 8" />
      <line x1="17" y1="20" x2="17" y2="4" />
      <polyline points="13 16 17 20 21 16" />
    </svg>
  );
}

function GoalsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function LifeEventsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  );
}

function CopilotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function AdvisorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="12" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

function SpendingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IncomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <polyline points="7 10 12 15 17 10" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function PortfolioIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function CreditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="3" ry="3" />
      <line x1="1" y1="10" x2="23" y2="10" />
      <line x1="5" y1="15" x2="9" y2="15" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function getNavIcon(href: string, active: boolean) {
  switch (href) {
    case "/app":
      return <OverviewIcon active={active} />;
    case "/accounts":
      return <AccountsIcon />;
    case "/transactions":
      return <TransactionsIcon />;
    case "/goals":
      return <GoalsIcon />;
    case "/life-events":
      return <LifeEventsIcon />;
    case "/copilot":
      return <CopilotIcon />;
    case "/advisor":
      return <AdvisorIcon />;
    case "/income":
      return <IncomeIcon />;
    case "/spending":
      return <SpendingIcon />;
    case "/portfolio":
      return <PortfolioIcon />;
    case "/credit":
      return <CreditIcon />;
    case "/reports":
      return <ReportsIcon />;
    case "/settings":
      return <SettingsIcon />;
    default:
      return <OverviewIcon active={active} />;
  }
}

/** One row in the sidebar. Intelligence rows are taller and carry a hint under the label. */
function SidebarLink({ item, pathname, hero = false }: { item: NavItem; pathname: string; hero?: boolean }) {
  const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-2xl px-3.5 font-roboto text-sm transition-all duration-150 ${hero ? "py-2" : "py-2.5"}`}
      style={{
        backgroundColor: active ? "#ffffff" : "transparent",
        color: active ? "#544af7" : "rgba(255, 255, 255, 0.72)",
        boxShadow: active ? "0 4px 14px 0 rgba(0, 0, 0, 0.08)" : "none",
        fontWeight: active ? 600 : 400,
      }}
    >
      <span
        className={`flex shrink-0 items-center justify-center ${hero ? "h-8 w-8 rounded-xl" : ""}`}
        style={hero ? { backgroundColor: active ? "rgba(84, 74, 247, 0.12)" : "rgba(255, 255, 255, 0.14)" } : undefined}
      >
        {getNavIcon(item.href, active)}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{item.label}</span>
        {hero && item.hint && (
          <span className="block truncate text-[11px] font-normal" style={{ opacity: active ? 0.7 : 0.55 }}>{item.hint}</span>
        )}
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[#f8f9fe]">
      {/* ── Sidebar (Desktop) ────────────────────────────────────────── */}
      <aside
        className="hidden md:flex md:w-[260px] md:flex-col md:shrink-0 justify-between select-none"
        style={{
          backgroundColor: "#544af7",
          position: "sticky",
          top: 0,
          height: "100vh",
          padding: "24px 14px 20px 14px",
          color: "white",
        }}
      >
        <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar pr-0.5">
          {/* Logo / Brand Header */}
          <Link href="/app" className="flex items-center gap-3 px-3 mb-6">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm shrink-0"
              style={{ background: "rgba(255, 255, 255, 0.22)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2C8.5 6 6 9.5 6 13.5a6 6 0 0 0 12 0c0-4-2.5-7.5-6-11.5z"
                  fill="white"
                />
                <circle cx="12" cy="14" r="2.5" fill="#544af7" />
              </svg>
            </span>
            <div className="flex items-baseline">
              <span className="font-poppins text-2xl font-bold tracking-tight text-white">
                FinVantage
              </span>
            </div>
          </Link>

          {/* Dashboard navigation: Overview, then Intelligence, then Finances, with Settings last */}
          <nav aria-label="Main Navigation" className="flex flex-col gap-1">
            <SidebarLink item={OVERVIEW_ITEM} pathname={pathname} />
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mt-4 flex flex-col gap-1">
                <p className="px-3.5 pb-1 font-roboto text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <SidebarLink key={item.href} item={item} pathname={pathname} hero={group.label === "Intelligence"} />
                ))}
              </div>
            ))}
            <div className="mt-4 border-t border-white/10 pt-3">
              <SidebarLink item={SETTINGS_ITEM} pathname={pathname} />
            </div>
          </nav>

        </div>

        {/* User Profile Card at Bottom: who is signed in, with sign-in and sign-out */}
        <AccountCard />
      </aside>

      {/* ── Mobile Header ─────────────────────────────────────────────── */}
      <div
        className="md:hidden fixed inset-x-0 top-0 z-50 flex flex-col justify-center px-4"
        style={{ height: "64px", backgroundColor: "#544af7", color: "white" }}
      >
        <div className="flex items-center justify-between">
          <Link href="/app" className="font-poppins text-lg font-bold text-white">
            FinVantage
          </Link>
          <nav className="flex gap-1.5 overflow-x-auto max-w-[75vw] py-1 font-roboto no-scrollbar">
            {NAV_ITEMS.map((item) => {
              const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="shrink-0 px-2.5 py-1 rounded-xl text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: active ? "#ffffff" : "rgba(255, 255, 255, 0.12)",
                    color: active ? "#544af7" : "#ffffff",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ── Main Content Area ────────────────────────────────────────── */}
      <main className={`flex-1 min-w-0 md:pt-0 pt-16 ${pathname === "/advisor" ? "h-dvh min-h-0 overflow-hidden" : ""}`}>
        {/* The Advisor fills the screen with a tight frame, so the chat and its widgets get the room. */}
        <div className={pathname === "/advisor" ? "flex h-full w-full flex-col px-3 py-3 sm:px-4 md:px-5 md:py-4" : "max-w-[1360px] mx-auto px-6 py-8 md:px-10 md:py-9"}>
          {children}
        </div>
      </main>
    </div>
  );
}
