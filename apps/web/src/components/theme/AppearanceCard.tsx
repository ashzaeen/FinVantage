"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { ThemeCycleButton } from "./ThemeCycleButton";
import { useTheme } from "./ThemeProvider";

const OPTIONS: Record<ThemePreference, { label: string; icon: ReactNode }> = {
  system: { label: "System", icon: <Monitor size={16} aria-hidden="true" /> },
  light: { label: "Light", icon: <Sun size={16} aria-hidden="true" /> },
  dark: { label: "Dark", icon: <Moon size={16} aria-hidden="true" /> },
};

/** A three-way choice: System, Light or Dark. Arrow keys move between the options, as a radio group does. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const at = THEME_PREFERENCES.indexOf(preference);
    const next = THEME_PREFERENCES[(at + step + THEME_PREFERENCES.length) % THEME_PREFERENCES.length];
    setPreference(next);
    event.currentTarget.querySelector<HTMLElement>(`[data-theme-option="${next}"]`)?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Theme" onKeyDown={onKeyDown} className="inline-flex max-w-full gap-1 rounded-xl border border-line bg-inset p-1">
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
            className={`flex min-h-9 items-center gap-2 rounded-lg px-3.5 font-roboto text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
              selected ? "bg-raised font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {OPTIONS[value].icon}
            {OPTIONS[value].label}
          </button>
        );
      })}
    </div>
  );
}

/** The Settings card. It renders nothing if dark mode is switched off (`NEXT_PUBLIC_DARK_MODE=0`). */
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

/** The one-button theme switch beside Settings in the sidebar and the phone drawer. Renders nothing if dark mode is switched off. */
export function SidebarTheme() {
  return <ThemeCycleButton tone="chrome" />;
}
