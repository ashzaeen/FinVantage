"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
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

function SubscriptionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
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
    case "/subscriptions":
      return <SubscriptionsIcon />;
    case "/reports":
      return <ReportsIcon />;
    case "/settings":
      return <SettingsIcon />;
    default:
      return <OverviewIcon active={active} />;
  }
}

/** One row in the sidebar. Intelligence rows are taller and carry a hint under the label.
 *  Below `lg` the same rows live in the phone drawer, so they keep a 44px tap height there. */
function SidebarLink({ item, pathname, hero = false }: { item: NavItem; pathname: string; hero?: boolean }) {
  const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-2xl px-3.5 font-roboto text-sm transition-all duration-150 max-lg:min-h-11 ${hero ? "py-2" : "py-2.5"}`}
      style={{
        backgroundColor: active ? "#ffffff" : "transparent",
        color: active ? "var(--accent)" : "rgba(255, 255, 255, 0.72)",
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
          <span className="block truncate text-[11px] font-normal max-lg:text-xs" style={{ opacity: active ? 0.7 : 0.55 }}>{item.hint}</span>
        )}
      </span>
    </Link>
  );
}

/** Brand, navigation and account card. The desktop sidebar and the phone drawer both render this. */
function SidebarContent({ pathname }: { pathname: string }) {
  return (
    <>
      <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar pr-0.5">
        {/* Logo / Brand Header */}
        <Link href="/app" className="flex min-h-11 items-center gap-3 px-3 mb-6">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm shrink-0"
            style={{ background: "rgba(255, 255, 255, 0.22)" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2C8.5 6 6 9.5 6 13.5a6 6 0 0 0 12 0c0-4-2.5-7.5-6-11.5z"
                fill="white"
              />
              <circle cx="12" cy="14" r="2.5" fill="var(--accent)" />
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
              <p className="px-3.5 pb-1 font-roboto text-xs font-semibold uppercase tracking-[0.14em] text-white/50 lg:text-[11px]">
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
    </>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Opening a page closes the drawer.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // While the drawer is open: lock page scroll, close on Escape, keep Tab inside it, and put
  // focus back on the menu button when it closes. Reaching `lg` (a rotated tablet) closes it too.
  useEffect(() => {
    if (!menuOpen) return;
    const button = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const items = drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      // Move focus ourselves, wrapping at both ends. Leaving it to the browser let Tab jump from
      // the drawer straight to the page behind it (found in a Chromium test).
      const list = Array.from(items);
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (at <= 0 ? list.length - 1 : at - 1) : (at < 0 || at === list.length - 1 ? 0 : at + 1);
      event.preventDefault();
      list[next].focus();
    }
    const desktop = window.matchMedia("(min-width: 1024px)");
    function onDesktop(event: MediaQueryListEvent) {
      if (event.matches) setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onDesktop);
      button?.focus();
    };
  }, [menuOpen]);

  const current = NAV_ITEMS.find((item) => (item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href)));

  return (
    <div className="flex min-h-dvh bg-surface">
      {/* ── Sidebar (Desktop, from 1024px) ───────────────────────────── */}
      <aside
        className="hidden lg:flex lg:w-[260px] lg:flex-col lg:shrink-0 justify-between select-none"
        style={{
          backgroundColor: "var(--accent)",
          position: "sticky",
          top: 0,
          height: "100dvh",
          padding: "24px 14px 20px 14px",
          color: "white",
        }}
      >
        <SidebarContent pathname={pathname} />
      </aside>

      {/* ── Top Bar (phones and tablets): a menu button, the brand, and the current page ── */}
      <div
        inert={menuOpen}
        className="lg:hidden fixed inset-x-0 top-0 z-50 flex items-center gap-1 px-2 text-white"
        style={{
          backgroundColor: "var(--accent)",
          height: "calc(56px + env(safe-area-inset-top))",
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
          paddingRight: "max(0.5rem, env(safe-area-inset-right))",
        }}
      >
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open Menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors active:bg-white/20"
        >
          <MenuIcon />
        </button>
        <Link href="/app" className="flex min-h-11 items-center font-poppins text-lg font-bold text-white">
          FinVantage
        </Link>
        {current && (
          <span className="ml-auto min-w-0 truncate pr-2 font-roboto text-sm font-medium text-white/80" aria-hidden="true">
            {current.label}
          </span>
        )}
      </div>

      {/* ── Navigation Drawer (phones and tablets) ───────────────────── */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div
            className="nav-backdrop absolute inset-0 bg-ink/50"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Main Menu"
            className="nav-drawer absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col justify-between overscroll-contain text-white shadow-2xl select-none"
            style={{
              backgroundColor: "var(--accent)",
              padding:
                "calc(16px + env(safe-area-inset-top)) 14px calc(16px + env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left))",
            }}
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close Menu"
              className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-xl transition-colors active:bg-white/20"
              style={{ top: "calc(8px + env(safe-area-inset-top))" }}
            >
              <CloseIcon />
            </button>
            <SidebarContent pathname={pathname} />
          </div>
        </div>
      )}

      {/* ── Main Content Area ────────────────────────────────────────── */}
      <main
        inert={menuOpen}
        className={`flex-1 min-w-0 lg:pt-0 max-lg:pt-[calc(56px+env(safe-area-inset-top))] ${pathname === "/advisor" ? "h-dvh min-h-0 overflow-hidden" : ""}`}
        style={{
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* The Advisor fills the screen with a tight frame, so the chat and its widgets get the room. */}
        <div className={pathname === "/advisor" ? "flex h-full w-full flex-col px-3 py-3 sm:px-4 lg:px-5 lg:py-4" : "max-w-[1360px] mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-9"}>
          {children}
        </div>
      </main>
    </div>
  );
}
