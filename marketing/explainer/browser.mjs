/**
 * Starts headless Chromium for rendering. Uses Playwright's own browser when its download is
 * complete; otherwise the newest complete Chromium that another Playwright version left on this
 * machine (downloads sometimes stall). Set CHROMIUM_PATH to choose one yourself.
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

function installedChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
    || (process.platform === "win32" ? join(process.env.LOCALAPPDATA ?? homedir(), "ms-playwright")
      : process.platform === "darwin" ? join(homedir(), "Library", "Caches", "ms-playwright")
      : join(homedir(), ".cache", "ms-playwright"));
  if (!existsSync(root)) return null;
  const candidates = readdirSync(root)
    .filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d) && existsSync(join(root, d, "INSTALLATION_COMPLETE")))
    .sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()));
  for (const dir of candidates) {
    for (const exe of [
      "chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-win64/chrome.exe", "chrome-win/chrome.exe",
      "chrome-headless-shell-linux64/chrome-headless-shell", "chrome-linux/chrome",
      "chrome-headless-shell-mac-arm64/chrome-headless-shell", "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    ]) {
      if (existsSync(join(root, dir, exe))) return join(root, dir, exe);
    }
  }
  return null;
}

export async function launchBrowser(args = []) {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args });
  try {
    return await chromium.launch({ args });
  } catch (error) {
    const fallback = installedChromium();
    if (!fallback) throw error;
    console.log(`Playwright's Chromium isn't ready; using ${fallback}`);
    return chromium.launch({ executablePath: fallback, args });
  }
}
