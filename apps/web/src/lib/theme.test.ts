import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { THEME_KEY, isThemedPath, parsePreference, resolveTheme, themeScript } from "./theme";

const base = { preference: "system", systemDark: false, pathname: "/app", enabled: true } as const;

test("system follows the device", () => {
  assert.equal(resolveTheme({ ...base, systemDark: true }), "dark");
  assert.equal(resolveTheme({ ...base, systemDark: false }), "light");
});

test("an explicit choice beats the device", () => {
  assert.equal(resolveTheme({ ...base, preference: "light", systemDark: true }), "light");
  assert.equal(resolveTheme({ ...base, preference: "dark", systemDark: false }), "dark");
});

test("with the flag off everyone gets light, whatever is stored", () => {
  assert.equal(resolveTheme({ ...base, enabled: false, preference: "dark", systemDark: true }), "light");
});

test("a path listed as unconverted stays light, and every real page is themed", () => {
  const unthemed = ["/", "/login"];
  assert.equal(isThemedPath("/", unthemed), false);
  assert.equal(isThemedPath("/login", unthemed), false);
  assert.equal(isThemedPath("/login/reset", unthemed), false);
  // "/" must not swallow every path, and "/login" must not match "/loginx".
  assert.equal(isThemedPath("/goals", unthemed), true);
  assert.equal(isThemedPath("/loginx", unthemed), true);
  // Nothing is left unconverted now, so the landing page, login and the legal pages follow the theme.
  for (const pathname of ["/", "/login", "/privacy", "/terms", "/app"]) {
    assert.equal(resolveTheme({ ...base, pathname, preference: "dark" }), "dark", pathname);
  }
});

test("unknown stored values fall back to system", () => {
  assert.equal(parsePreference("purple"), "system");
  assert.equal(parsePreference(null), "system");
  assert.equal(parsePreference("dark"), "dark");
});

/** Runs the pre-paint script against a stand-in browser and returns what it did to <html>. */
function runScript(opts: { enabled: boolean; stored?: string | null; systemDark?: boolean; path?: string; storageThrows?: boolean }) {
  const attrs: Record<string, string> = {};
  const style: { colorScheme?: string } = {};
  const sandbox = {
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v), style } },
    location: { pathname: opts.path ?? "/app" },
    localStorage: {
      getItem: (key: string) => {
        if (opts.storageThrows) throw new Error("blocked");
        return key === THEME_KEY ? (opts.stored ?? null) : null;
      },
    },
    window: { matchMedia: () => ({ matches: opts.systemDark ?? false }) },
  };
  runInNewContext(themeScript(opts.enabled), sandbox);
  return { theme: attrs["data-theme"], colorScheme: style.colorScheme };
}

test("script: dark when the device is dark and nothing is stored", () => {
  assert.deepEqual(runScript({ enabled: true, systemDark: true }), { theme: "dark", colorScheme: "dark" });
});

test("script: a stored light choice beats a dark device", () => {
  assert.equal(runScript({ enabled: true, stored: "light", systemDark: true }).theme, "light");
});

test("script: a stored dark choice beats a light device", () => {
  assert.equal(runScript({ enabled: true, stored: "dark", systemDark: false }).theme, "dark");
});

test("script: flag off forces light", () => {
  assert.equal(runScript({ enabled: false, stored: "dark", systemDark: true }).theme, "light");
});

test("script: landing and login follow the theme", () => {
  assert.equal(runScript({ enabled: true, stored: "dark", path: "/" }).theme, "dark");
  assert.equal(runScript({ enabled: true, stored: "dark", path: "/login" }).theme, "dark");
});

test("script: blocked storage does not throw and follows the device", () => {
  assert.equal(runScript({ enabled: true, storageThrows: true, systemDark: true }).theme, "dark");
});

test("script agrees with resolveTheme", () => {
  for (const preference of ["system", "light", "dark"] as const) {
    for (const systemDark of [false, true]) {
      for (const pathname of ["/app", "/", "/login", "/goals"]) {
        const fromScript = runScript({ enabled: true, stored: preference, systemDark, path: pathname }).theme;
        assert.equal(fromScript, resolveTheme({ preference, systemDark, pathname, enabled: true }), `${preference} ${systemDark} ${pathname}`);
      }
    }
  }
});
