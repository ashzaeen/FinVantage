/**
 * Renders trailer.html to out/finvantage-trailer.mp4: 1920x1080, 30 fps, H.264 with the sound from
 * out/audio.wav (run audio.mjs first, or `npm run render`, which does both).
 *
 * Each frame is drawn by calling the page's renderAt(seconds) and taking a screenshot, so the video
 * never drops a frame, whatever the machine's speed. Frames go straight into ffmpeg; none are saved.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpeg from "ffmpeg-static";
import { launchBrowser } from "./browser.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const audio = here("./out/audio.wav");
const out = here("./out/finvantage-trailer.mp4");
if (!existsSync(audio)) throw new Error("out/audio.wav is missing. Run `node audio.mjs` first.");

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`${pathToFileURL(here("./trailer.html")).href}?render`, { waitUntil: "networkidle" });
await page.evaluate(() => window.trailerReady);
const { duration, fps } = await page.evaluate(() => window.TRAILER);
const frames = Math.round(duration * fps);

const encoder = spawn(ffmpeg, [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  "-i", audio,
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(fps),
  "-c:a", "aac", "-b:a", "192k",
  "-t", String(duration), "-movflags", "+faststart",
  out,
], { stdio: ["pipe", "inherit", "inherit"] });
const finished = new Promise((resolve, reject) => {
  encoder.on("error", reject);
  encoder.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
});

const started = Date.now();
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.renderAt(t), f / fps);
  const jpeg = await page.screenshot({ type: "jpeg", quality: 95, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  if (!encoder.stdin.write(jpeg)) await new Promise((r) => encoder.stdin.once("drain", r));
  if (f % 90 === 0) console.log(`frame ${f}/${frames} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
}
encoder.stdin.end();
await finished;
await browser.close();
console.log(`Wrote ${out} in ${((Date.now() - started) / 1000).toFixed(0)} s.`);
