// theme-ok-file: CHROME_COLOR repeats the chrome token for the browser bar.
/**
 * Theme state for the web app: what the visitor picked, what that resolves to, and the tiny script
 * that applies it before first paint so there is no flash of the wrong theme.
 *
 * Dark mode is on for everyone (docs/DECISIONS.md, "Dark mode"), with a kill switch: `NEXT_PUBLIC_DARK_MODE=0`.
 * This is the one place that reads that switch.
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "fv-theme";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

/**
 * On for everyone. Set `NEXT_PUBLIC_DARK_MODE=0` to switch it off again without a code change: every
 * visitor then gets light, whatever is stored. Keep the literal `process.env.NEXT_PUBLIC_DARK_MODE` so Next
 * can inline it into the browser bundle.
 */
export const DARK_MODE_ENABLED = process.env.NEXT_PUBLIC_DARK_MODE !== "0";

/**
 * Surfaces that are not converted yet. They stay light whatever the visitor picked, so nobody sees a
 * half-dark page. It is empty now that every page is converted; add a path here while converting a new one.
 */
export const UNTHEMED_PATHS: readonly string[] = [];

/** Colors for the phone's status bar and browser chrome. Keep in step with `--chrome` in globals.css. */
export const CHROME_COLOR: Record<ResolvedTheme, string> = { light: "#544af7", dark: "#1c1952" };

export function isThemedPath(pathname: string, unthemed: readonly string[] = UNTHEMED_PATHS): boolean {
  return !unthemed.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

export function parsePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

/** The theme a page actually shows. */
export function resolveTheme(input: {
  preference: ThemePreference;
  systemDark: boolean;
  pathname: string;
  enabled: boolean;
}): ResolvedTheme {
  if (!input.enabled || !isThemedPath(input.pathname)) return "light";
  if (input.preference === "system") return input.systemDark ? "dark" : "light";
  return input.preference;
}

/**
 * Inline script for `<head>`. It must run before the body paints, so it is plain ES5 with no imports,
 * and it never throws: if storage or matchMedia is blocked the page simply stays light.
 * Built from the same constants as `resolveTheme`, so the two cannot drift apart.
 */
export function themeScript(enabled: boolean = DARK_MODE_ENABLED): string {
  return `(function(){try{
var root=document.documentElement;
var theme="light";
if(${JSON.stringify(enabled)}){
var path=location.pathname;
var unthemed=${JSON.stringify(UNTHEMED_PATHS)};
var themed=true;
for(var i=0;i<unthemed.length;i++){var p=unthemed[i];if(path===p||(p!=="/"&&path.indexOf(p+"/")===0)){themed=false;}}
var pref=null;
try{pref=localStorage.getItem(${JSON.stringify(THEME_KEY)});}catch(e){}
if(themed&&(pref==="dark"||(pref!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches))){theme="dark";}
}
root.setAttribute("data-theme",theme);
root.style.colorScheme=theme;
}catch(e){}})();`;
}
