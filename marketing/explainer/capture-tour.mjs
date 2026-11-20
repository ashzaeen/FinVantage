/**
 * Full-window stills of every page of the live app (as a guest demo visitor), for the dashboard
 * tour and the Advisor scene. Writes out/captures/tour-<page>.png at 1600x1000, scale 1.5.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./browser.mjs";

const WEB = process.env.WEB_URL || "https://finvantage-web-ten.vercel.app";
const PAGES = ["app", "accounts", "transactions", "spending", "goals", "life-events", "portfolio", "reports", "copilot", "credit", "income"];
const out = (name) => fileURLToPath(new URL(`./out/captures/${name}`, import.meta.url));
mkdirSync(fileURLToPath(new URL("./out/captures/", import.meta.url)), { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
for (const p of PAGES) {
  await page.goto(`${WEB}/${p}`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(3000); // charts animate in
  await page.screenshot({ path: out(`tour-${p}.png`) });
  console.log(`captured tour-${p}.png`);
}
await browser.close();
