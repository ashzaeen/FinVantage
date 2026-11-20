/**
 * Captures the real Copilot on a real Amazon laptop page, for the explainer's Copilot scenes.
 * Opens a VISIBLE Chromium window with the FinVantage extension loaded (build it for the live API
 * first: see README). If Amazon shows a robot check, clear it in that window; the script waits.
 *
 * Writes out/captures/amazon-page.png (page without the card), amazon-card.png (with the card),
 * and amazon-card.json (product title, URL, detected price, and the card's text).
 *   node capture-amazon.mjs [amazon product URL]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const EXT = here("../../apps/extension/dist");
const out = (name) => here(`./out/captures/${name}`);
mkdirSync(here("./out/captures/"), { recursive: true });
if (!existsSync(join(EXT, "manifest.json"))) throw new Error("Build the extension first (see README).");

// Amazon blocks Playwright's own browser, so drive the real Google Chrome over its debugging port,
// in a throwaway profile with the extension loaded. Reuse one already running on port 9333.
async function connect() {
  try { return await chromium.connectOverCDP("http://127.0.0.1:9333"); } catch {}
  const chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--remote-debugging-port=9333", `--user-data-dir=${mkdtempSync(join(tmpdir(), "fv-chrome-"))}`, `--load-extension=${EXT}`, "--no-first-run", "--no-default-browser-check", "--window-size=1600,1080", "about:blank"], { detached: true, stdio: "ignore" });
  chrome.unref();
  await new Promise((r) => setTimeout(r, 4000));
  return chromium.connectOverCDP("http://127.0.0.1:9333");
}
const browser = await connect();
const context = browser.contexts()[0];
const page = context.pages()[0] ?? (await context.newPage());

async function waitPastRobotCheck() {
  for (let i = 0; i < 300; i++) {
    const blocked = await page.evaluate(() => /validateCaptcha|errors\/|ap\/signin/.test(location.href) || /Enter the characters you see|Type the characters|not a robot/i.test(document.body?.innerText ?? ""));
    if (!blocked) return;
    if (i % 15 === 0) console.log("Amazon is asking for a robot check. Please clear it in the open browser window...");
    await page.waitForTimeout(2000);
  }
  throw new Error("Robot check wasn't cleared within 10 minutes.");
}

let url = process.argv[2];
if (!url) {
  await page.goto("https://www.amazon.com/s?k=macbook+pro+16+inch+laptop", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitPastRobotCheck();
  await page.waitForSelector("[data-component-type='s-search-result']", { timeout: 60_000 });
  const pick = await page.evaluate(() => {
    for (const r of document.querySelectorAll("[data-component-type='s-search-result']")) {
      const price = Number((r.querySelector(".a-price .a-offscreen")?.textContent ?? "").replace(/[^0-9.]/g, ""));
      const link = r.querySelector("a.a-link-normal[href*='/dp/']")?.getAttribute("href");
      const title = r.querySelector("h2")?.textContent?.trim() ?? "";
      if (link && price >= 2400 && price <= 3600 && /laptop|macbook|notebook/i.test(title)) return { link, price, title };
    }
    return null;
  });
  if (!pick) throw new Error("No laptop between $2,400 and $3,600 in the results; pass a product URL instead.");
  url = new URL(pick.link, "https://www.amazon.com").toString();
  console.log(`Picked: ${pick.title.slice(0, 90)} ($${pick.price})`);
}

// Signed out, the extension uses the dashboard's guest session (a private copy of the demo
// profile). Opening the dashboard once creates it.
await page.setViewportSize({ width: 1600, height: 1000 });
await page.goto("https://finvantage-web-ten.vercel.app/app", { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(2000);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await waitPastRobotCheck();
await page.waitForSelector("#productTitle", { timeout: 60_000 });
await page.waitForTimeout(2500);

// The card: wait for the extension's overlay, opening it from the badge if it is collapsed.
await page.waitForFunction(() => !!document.getElementById("finvantage-copilot"), null, { timeout: 45_000 });
await page.waitForTimeout(1500);
const opened = await page.evaluate(() => !!document.getElementById("finvantage-copilot")?.shadowRoot?.querySelector(".card"));
if (!opened) {
  await page.evaluate(() => document.getElementById("finvantage-copilot")?.shadowRoot?.querySelector("button, .badge")?.click());
  await page.waitForFunction(() => !!document.getElementById("finvantage-copilot")?.shadowRoot?.querySelector(".card"), null, { timeout: 20_000 });
}
await page.waitForTimeout(2500); // card animation and the model's wording
// Move the mouse off Amazon's hover pop-ups (not Escape: that closes the card).
await page.mouse.move(700, 900);
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const host = document.getElementById("finvantage-copilot");
  const card = host?.shadowRoot?.querySelector(".card");
  const r = card?.getBoundingClientRect();
  const price = document.querySelector("#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen, #apex-pricetopay-accessibility-label, #corePrice_feature_div .a-offscreen")?.textContent?.trim();
  return { url: location.href, title: document.querySelector("#productTitle")?.textContent?.trim(), price, cardText: card?.innerText ?? "", cardBox: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null };
});
await page.screenshot({ path: out("amazon-card.png") });
await page.evaluate(() => { const h = document.getElementById("finvantage-copilot"); if (h) h.style.display = "none"; });
await page.waitForTimeout(300);
await page.screenshot({ path: out("amazon-page.png") });
writeFileSync(out("amazon-card.json"), JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2));
await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
await browser.close().catch(() => {});
