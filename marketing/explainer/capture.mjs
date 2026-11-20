/**
 * Captures stills of the live app for the explainer, as a signed-out visitor (who gets a private
 * guest copy of the demo profile). Writes out/captures/*.png, used by explainer.html.
 *
 *   dashboard.png  the Overview page (net worth)
 *   accounts.png   the Accounts page, full length, scrolled in the scene
 *   goals.png      the Goals page with probability ranges
 *   advisor.png    the Advisor answering "How much did I spend on groceries in October?" (one Gemini call)
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./browser.mjs";

const WEB = process.env.WEB_URL || "https://finvantage-web-ten.vercel.app";
const out = (name) => fileURLToPath(new URL(`./out/captures/${name}`, import.meta.url));
mkdirSync(fileURLToPath(new URL("./out/captures/", import.meta.url)), { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });

async function shot(path, name, { fullPage = false, settle = 2500 } = {}) {
  await page.goto(`${WEB}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(settle); // opening animations
  await page.screenshot({ path: out(name), fullPage });
  console.log(`captured ${name}`);
}

if (!process.argv.includes("--advisor-only")) {
  await shot("/app", "dashboard.png");
  await shot("/accounts", "accounts.png", { fullPage: true });
  await shot("/goals", "goals.png", { fullPage: true });
}

await page.goto(`${WEB}/advisor`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1500);
await page.fill('textarea[placeholder="Message your Advisor…"]', "How much did I spend on groceries in October?");
await page.click('button[aria-label="Send"]');
// Wait for the answer to finish: the send button comes back once the reply is in.
await page.waitForFunction(() => {
  const button = document.querySelector('button[aria-label="Send"]');
  return button && !button.disabled && /\$\d/.test(document.querySelector("main")?.innerText.split("groceries in October?").pop() ?? "");
}, null, { timeout: 90_000 }).catch(() => console.log("advisor: answer wait timed out, capturing anyway"));
await page.waitForTimeout(2500);
await page.screenshot({ path: out("advisor.png") });
console.log("captured advisor.png");
console.log(await page.evaluate(() => document.querySelector("main")?.innerText.slice(0, 1500)));

await browser.close();
