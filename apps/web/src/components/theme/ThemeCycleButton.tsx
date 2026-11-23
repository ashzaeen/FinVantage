"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

const PAGE_BUTTON = "text-lp-text-2 hover:bg-lp-tint-50 hover:text-lp-ink focus-visible:outline-lp-primary";
const CHROME_BUTTON = "text-white/90 hover:bg-white/15 focus-visible:outline-white"; // theme-ok: white on the chrome

/**
 * One button that flips the page between light and dark, for places with no room for the three-way control:
 * the sidebar, the phone drawer and the landing header. It always changes what you see, so its first tap is
 * never a silent switch from System to the same look. It shows the current look, and Settings still offers
 * System. It renders nothing if dark mode is switched off (`NEXT_PUBLIC_DARK_MODE=0`).
 */
export function ThemeCycleButton({ className = "", tone = "page" }: { className?: string; tone?: "page" | "chrome" }) {
  const { resolved, setPreference, enabled } = useTheme();
  if (!enabled) return null;
  const next = resolved === "dark" ? "light" : "dark";
  const Icon = resolved === "dark" ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={`Theme: ${resolved === "dark" ? "Dark" : "Light"}. Switch to ${next === "dark" ? "Dark" : "Light"}`}
      title={`Theme: ${resolved === "dark" ? "Dark" : "Light"}. Click for ${next === "dark" ? "Dark" : "Light"}`}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${tone === "chrome" ? CHROME_BUTTON : PAGE_BUTTON} ${className}`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
