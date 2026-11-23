"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  CHROME_COLOR,
  DARK_MODE_ENABLED,
  THEME_KEY,
  parsePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  /** What the visitor picked. */
  preference: ThemePreference;
  /** What the page shows right now. */
  resolved: ResolvedTheme;
  /** False while dark mode is behind its flag. The toggle hides itself. */
  enabled: boolean;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/* ── The stored preference, read as an external store so server and first client render agree ── */
const preferenceListeners = new Set<() => void>();

/** Used only when storage is blocked, so the choice still lasts until the page reloads. */
let memoryPreference: ThemePreference = "system";

function readPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(THEME_KEY));
  } catch {
    return memoryPreference;
  }
}

function subscribePreference(onChange: () => void) {
  preferenceListeners.add(onChange);
  // Another tab changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    preferenceListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/* ── The device's own setting ──────────────────────────────────────────────────────────────────── */
const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeSystem(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const readSystemDark = () => window.matchMedia(DARK_QUERY).matches;

/**
 * Owns the theme after the page loads. The inline script in the root layout has already set the first
 * paint; this keeps `<html>` in step when the visitor changes the choice, the device setting flips, or
 * they navigate between a converted page and one that is still light-only.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const preference = useSyncExternalStore(subscribePreference, readPreference, () => "system" as const);
  const systemDark = useSyncExternalStore(subscribeSystem, readSystemDark, () => false);
  const resolved = resolveTheme({ preference, systemDark, pathname, enabled: DARK_MODE_ENABLED });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.style.colorScheme = resolved;
    // The phone's status bar and browser chrome. Next renders this tag on dashboard pages only.
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
      meta.content = CHROME_COLOR[resolved];
    });
  }, [resolved, pathname]);

  const setPreference = useCallback((next: ThemePreference) => {
    memoryPreference = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* Storage is blocked (a private window, say): memoryPreference carries it. */
    }
    preferenceListeners.forEach((listener) => listener());
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, enabled: DARK_MODE_ENABLED, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
