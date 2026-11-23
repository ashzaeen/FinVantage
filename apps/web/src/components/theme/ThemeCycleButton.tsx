"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { useTheme } from "./ThemeProvider";

const PAGE_BUTTON = "text-lp-text-2 hover:bg-lp-tint-50 hover:text-lp-ink focus-visible:outline-lp-primary";
const CHROME_BUTTON = "text-white/90 hover:bg-white/15 focus-visible:outline-white"; // theme-ok: white on the chrome

const LABEL: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };

/**
 * One button that steps System, Light, Dark for pages with no room for a three-way control, such as the
 * landing page header. It shows the current choice, and renders nothing while dark mode is behind its flag.
 */
export function ThemeCycleButton({ className = "", tone = "page" }: { className?: string; tone?: "page" | "chrome" }) {
  const { preference, setPreference, enabled } = useTheme();
  if (!enabled) return null;
  const next = THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(preference) + 1) % THEME_PREFERENCES.length];
  const Icon = preference === "dark" ? Moon : preference === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={`Theme: ${LABEL[preference]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[preference]}`}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${tone === "chrome" ? CHROME_BUTTON : PAGE_BUTTON} ${className}`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
