/**
 * Steps through the whole explainer (without screenshots) and records when each element first
 * appears: "pop" (cards, chips, text), "slam" (stamps, big numbers), "ink" (hand-drawn circles and
 * arrows). audio.mjs puts a matching sound on each. Writes out/cues.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchBrowser } from "./browser.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const timeline = JSON.parse(readFileSync(here("./out/timeline.json"), "utf8"));
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${pathToFileURL(here("./explainer.html")).href}?render`, { waitUntil: "networkidle" });
await page.evaluate((tl) => window.setTimeline(tl), timeline);
await page.evaluate(() => window.explainerReady);
const events = await page.evaluate((total) => {
  window.__collect = true;
  window.__events.length = 0;
  for (let t = 0; t < total; t += 1 / 60) window.renderAt(t);
  window.__collect = false;
  return window.__events;
}, timeline.total);
const transitions = await page.evaluate(() => window.TRANSITIONS);
await browser.close();
// Chapter changes (wipes) get a music hit; every scene change gets a paper move.
const cuts = timeline.beats.slice(1).map((b) => ({ t: b.start, kind: transitions[b.scene]?.kind ?? "fade" }));
writeFileSync(here("./out/cues.json"), JSON.stringify({ events, cuts }, null, 1));
const count = (k) => events.filter((e) => e.kind === k).length;
console.log(`Cues: ${count("pop")} pops, ${count("slam")} slams, ${count("ink")} ink strokes, ${cuts.filter((c) => c.kind === "wipe").length} chapter wipes.`);
