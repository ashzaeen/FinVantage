"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { ThemeCycleButton } from "./ThemeCycleButton";
import { useTheme } from "./ThemeProvider";

const OPTIONS: Record<ThemePreference, { label: string; icon: ReactNode }> = {
  system: { label: "System", icon: <Monitor size={16} aria-hidden="true" /> },
  light: { label: "Light", icon: <Sun size={16} aria-hidden="true" /> },
  dark: { label: "Dark", icon: <Moon size={16} aria-hidden="true" /> },
};

const CHROME_FOCUS = "focus-visible:outline-white"; // theme-ok: the chrome is dark in both themes

/**
 * A three-way choice: System, Light or Dark. Arrow keys move between the options, as a radio group does.
 * `chrome` is the compact, icon-only version for the sidebar and the phone drawer, drawn in white on the chrome.
 */
export function ThemeToggle({ variant = "surface" }: { variant?: "surface" | "chrome" }) {
  const chrome = variant === "chrome";
  const { preference, setPreference } = useTheme();

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const at = THEME_PREFERENCES.indexOf(preference);
    const next = THEME_PREFERENCES[(at + step + THEME_PREFERENCES.length) % THEME_PREFERENCES.length];
    setPreference(next);
    event.currentTarget.querySelector<HTMLElement>(`[data-theme-option="${next}"]`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={onKeyDown}
      className={chrome ? "flex w-full gap-1 rounded-xl bg-white/12 p-1" : "inline-flex max-w-full gap-1 rounded-xl border border-line bg-inset p-1"} // theme-ok: white on the chrome
    >
      {THEME_PREFERENCES.map((value) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-theme-option={value}
            onClick={() => setPreference(value)}
            aria-label={chrome ? OPTIONS[value].label : undefined}
            title={chrome ? OPTIONS[value].label : undefined}
            className={
              chrome
                ? `flex min-h-9 flex-1 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${CHROME_FOCUS} ${
                    selected ? "bg-[color:var(--chrome-active-bg)] text-[color:var(--chrome-active-ink)]" : "text-white/70 hover:text-white"
                  }`
                : `flex min-h-9 items-center gap-2 rounded-lg px-3.5 font-roboto text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
                    selected ? "bg-raised font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
                  }`
            }
          >
            {OPTIONS[value].icon}
            {!chrome && OPTIONS[value].label}
          </button>
        );
      })}
    </div>
  );
}

/** The Settings card. It renders nothing while dark mode is behind its flag. */
export function AppearanceCard() {
  const { enabled } = useTheme();
  if (!enabled) return null;
  return (
    <Card lift={false} title="Appearance">
      <p className="mb-3 text-sm text-muted">
        Choose a light or dark look. System follows your device and switches with it.
      </p>
      <ThemeToggle />
    </Card>
  );
}

/** The one-button theme switch beside Settings in the sidebar and the phone drawer. Renders nothing while the flag is off. */
export function SidebarTheme() {
  return <ThemeCycleButton tone="chrome" />;
}
