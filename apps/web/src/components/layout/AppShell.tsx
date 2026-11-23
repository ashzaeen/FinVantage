"use client";

// theme-ok-file: white text and tints on the chrome, which is dark in both themes.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NAV_GROUPS, NAV_ITEMS, OVERVIEW_ITEM, SETTINGS_ITEM, type NavItem } from "@/lib/nav";
import { BrandMark } from "@/components/ui/BrandMark";
import { ArrowDownToLine, ArrowLeftRight, CalendarCheck, ChartColumn, CreditCard, DollarSign, FileText, LayoutGrid, Menu, MessageSquare, Repeat, Settings, Target, Wallet, X, Zap, type LucideIcon } from "lucide-react";
import { SidebarTheme } from "@/components/theme/AppearanceCard";
import { AccountCard } from "./AccountCard";

/* One icon set for the whole app: Lucide, drawn at the same size and stroke as the rest of the dashboard. */
const NAV_ICONS: Record<string, LucideIcon> = {
  "/app": LayoutGrid,
  "/accounts": Wallet,
  "/transactions": ArrowLeftRight,
  "/goals": Target,
  "/life-events": CalendarCheck,
  "/copilot": Zap,
  "/advisor": MessageSquare,
  "/income": ArrowDownToLine,
  "/spending": DollarSign,
  "/portfolio": ChartColumn,
  "/credit": CreditCard,
  "/subscriptions": Repeat,
  "/reports": FileText,
  "/settings": Settings,
};

function getNavIcon(href: string) {
  const Icon = NAV_ICONS[href] ?? LayoutGrid;
  return <Icon size={18} strokeWidth={2.2} aria-hidden="true" />;
}

/** The hint under an Intelligence link: white at 86%, which is 4.5:1 or better on the indigo and on the dark navy. */
const HINT_COLOR = "rgba(255, 255, 255, 0.86)"; // theme-ok

/** One row in the sidebar. Intelligence rows are taller and carry a hint under the label.
 *  Below `lg` the same rows live in the phone drawer, so they keep a 44px tap height there. */
function SidebarLink({ item, pathname, hero = false }: { item: NavItem; pathname: string; hero?: boolean }) {
  const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-2xl px-3.5 font-roboto text-sm transition-all duration-150 max-lg:min-h-11 ${hero ? "py-2" : "py-2"}`}
      style={{
        backgroundColor: active ? "var(--chrome-active-bg)" : "transparent",
        color: active ? "var(--chrome-active-ink)" : "rgba(255, 255, 255, 0.92)", // theme-ok: text on the chrome (4.5:1 or better on the indigo)
        boxShadow: active ? "0 4px 14px 0 rgba(0, 0, 0, 0.08)" : "none", // theme-ok
        fontWeight: active ? 600 : 400,
      }}
    >
      <span
        className={`flex shrink-0 items-center justify-center ${hero ? "h-8 w-8 rounded-xl" : ""}`}
        style={hero ? { backgroundColor: active ? "var(--chrome-active-chip)" : "rgba(255, 255, 255, 0.14)" } : undefined} // theme-ok
      >
        {getNavIcon(item.href)}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{item.label}</span>
        {hero && item.hint && (
          <span className="block truncate text-xs font-normal" style={active ? undefined : { color: HINT_COLOR }}>{item.hint}</span>
        )}
      </span>
    </Link>
  );
}

/** Brand, navigation and account card. The desktop sidebar and the phone drawer both render this.
 *  The brand and the footer (Settings, theme, account) stay put; only the links scroll, with a shadow
 *  that shows there is more above or below. */
function SidebarContent({ pathname }: { pathname: string }) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Logo / Brand Header */}
        <Link href="/app" className="mb-2 flex min-h-11 shrink-0 items-center gap-3 px-3">
          <BrandMark size={40} tone="onBrand" />
          <div className="flex items-baseline">
            <span className="font-poppins text-2xl font-bold tracking-tight text-white">
              FinVantage
            </span>
          </div>
        </Link>

        {/* Dashboard navigation: Overview, then Intelligence, then Finances */}
        <div className="nav-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar pr-0.5">
          <nav aria-label="Main Navigation" className="flex flex-col gap-1">
            <SidebarLink item={OVERVIEW_ITEM} pathname={pathname} />
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mt-3 flex flex-col gap-1">
                <p className="px-3.5 pb-1 font-roboto text-xs font-semibold uppercase tracking-[0.14em] text-white/85">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <SidebarLink key={item.href} item={item} pathname={pathname} hero={group.label === "Intelligence"} />
                ))}
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* Pinned: Settings is never below the fold. The theme switch (hidden while dark mode is behind its flag) shares the row. */}
      <div className="mt-2 flex shrink-0 items-center gap-1 border-t border-white/10 pt-2">
        <nav aria-label="Account Navigation" className="min-w-0 flex-1">
          <SidebarLink item={SETTINGS_ITEM} pathname={pathname} />
        </nav>
        <SidebarTheme />
      </div>

      {/* User Profile Card at Bottom: who is signed in, with sign-in and sign-out */}
      <AccountCard />
    </>
  );
}

function MenuIcon() {
  return <Menu size={22} strokeWidth={2.2} aria-hidden="true" />;
}

function CloseIcon() {
  return <X size={22} strokeWidth={2.2} aria-hidden="true" />;
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
      {/* The first Tab stop on every page: jump past the sidebar to the content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-xl focus:bg-raised focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-ink focus:[box-shadow:var(--shadow-float)] focus:outline-2 focus:outline-offset-2 focus:outline-accent-ink"
      >
        Skip to Main Content
      </a>
      {/* ── Sidebar (Desktop, from 1024px) ───────────────────────────── */}
      <aside
        className="hidden lg:flex lg:w-[260px] lg:flex-col lg:shrink-0 justify-between select-none"
        style={{
          backgroundColor: "var(--chrome)",
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
          backgroundColor: "var(--chrome)",
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
        <Link href="/app" className="flex min-h-11 items-center gap-2 font-poppins text-lg font-bold text-white">
          <BrandMark size={28} tone="onBrand" />
          FinVantage
        </Link>
        {current && (
          <span className="ml-auto min-w-0 truncate pr-2 font-roboto text-sm font-medium text-white/90" aria-hidden="true">
            {current.label}
          </span>
        )}
      </div>

      {/* ── Navigation Drawer (phones and tablets) ───────────────────── */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div
            className="nav-backdrop absolute inset-0 bg-[color:var(--scrim)]"
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
              backgroundColor: "var(--chrome)",
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
        id="main-content"
        tabIndex={-1}
        inert={menuOpen}
        className={`flex-1 min-w-0 outline-none lg:pt-0 max-lg:pt-[calc(56px+env(safe-area-inset-top))] ${pathname === "/advisor" ? "h-dvh min-h-0 overflow-hidden" : ""}`}
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
