/**
 * Renders one frame per beat (at a chosen point in each beat, default 70%) and tiles them into
 * out/preview.png, to review the whole explainer at a glance.  node preview.mjs [fraction]
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpeg from "ffmpeg-static";
import { launchBrowser } from "./browser.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const at = Number(process.argv[2] ?? 0.7);
const timeline = JSON.parse(readFileSync(here("./out/timeline.json"), "utf8"));
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${pathToFileURL(here("./explainer.html")).href}?render`, { waitUntil: "networkidle" });
await page.evaluate((tl) => window.setTimeline(tl), timeline);
await page.evaluate(() => window.explainerReady);
const files = [];
for (const b of timeline.beats) {
  await page.evaluate((t) => window.renderAt(t), b.start + b.length * at);
  const f = here(`./out/pv-${b.id}.jpg`);
  await page.screenshot({ path: f, type: "jpeg", quality: 80 });
  files.push(f);
}
await browser.close();
const inputs = files.flatMap((f) => ["-i", f]);
const scaled = files.map((_, i) => `[${i}]scale=640:360[v${i}]`).join(";");
const cells = files.map((_, i) => `${(i % 3) * 640}_${Math.floor(i / 3) * 360}`).join("|");
execFileSync(ffmpeg, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${scaled};${files.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${files.length}:layout=${cells}:fill=black`, here("./out/preview.png")]);
console.log("Wrote out/preview.png");
