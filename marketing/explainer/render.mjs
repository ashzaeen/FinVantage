/**
 * Renders explainer.html to out/finvantage-explainer.mp4: 1920x1080, 30 fps, with out/audio.wav
 * levelled to -16 LUFS. Frames are drawn by renderAt(seconds) on several pages at once and piped to
 * ffmpeg in order. Encodes on an NVIDIA GPU (NVENC) when there is one, otherwise with libx264.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpeg from "ffmpeg-static";
import { launchBrowser } from "./browser.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const audio = here("./out/audio.wav");
const out = here("./out/finvantage-explainer.mp4");
if (!existsSync(audio)) throw new Error("out/audio.wav is missing. Run audio.mjs first.");
const timeline = JSON.parse(readFileSync(here("./out/timeline.json"), "utf8"));
// 60 fps, each frame the blend of SUB sub-frames (motion blur), so fast moves read smoothly.
const FPS = Number(process.env.FPS ?? 60), SUB = Number(process.env.SUB ?? 2), RATE_IN = FPS * SUB;
const frames = Math.round(timeline.total * RATE_IN), WORKERS = Number(process.env.WORKERS ?? 6);

// NVENC if the GPU and driver can do it, checked with a one-frame test encode.
const nvenc = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=1920x1080:d=0.1", "-c:v", "h264_nvenc", "-f", "null", "-"]).status === 0;
const video = nvenc
  ? ["-c:v", "h264_nvenc", "-preset", "p7", "-tune", "hq", "-rc", "vbr", "-cq", "19", "-b:v", "0", "-profile:v", "high"]
  : ["-c:v", "libx264", "-preset", "slow", "-crf", "17"];
console.log(`Encoding with ${nvenc ? "the GPU (h264_nvenc)" : "the CPU (libx264)"}; ${FPS} fps with ${SUB}x motion blur: ${frames} sub-frames on ${WORKERS} pages.`);

const browser = await launchBrowser(["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-gpu-rasterization"]);
const pages = await Promise.all(Array.from({ length: WORKERS }, async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${pathToFileURL(here("./explainer.html")).href}?render`, { waitUntil: "networkidle" });
  await page.evaluate((tl) => window.setTimeline(tl), timeline);
  await page.evaluate(() => window.explainerReady);
  return page;
}));

const encoder = spawn(ffmpeg, [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(RATE_IN), "-c:v", "mjpeg", "-i", "-",
  "-i", audio,
  ...(SUB > 1 ? ["-vf", `tmix=frames=${SUB},fps=${FPS}`] : []), ...video, "-pix_fmt", "yuv420p", "-r", String(FPS),
  "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  "-t", String(timeline.total), "-movflags", "+faststart", out,
], { stdio: ["pipe", "inherit", "inherit"] });
const finished = new Promise((resolve, reject) => { encoder.on("error", reject); encoder.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${c}`)))); });

const started = Date.now();
for (let f = 0; f < frames; f += WORKERS) {
  const batch = await Promise.all(pages.map(async (page, w) => {
    const k = f + w;
    if (k >= frames) return null;
    await page.evaluate((t) => window.renderAt(t), k / RATE_IN);
    return page.screenshot({ type: "jpeg", quality: 94, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  }));
  for (const jpeg of batch) if (jpeg && !encoder.stdin.write(jpeg)) await new Promise((r) => encoder.stdin.once("drain", r));
  if (f % 1200 < WORKERS) console.log(`frame ${f}/${frames} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
}
encoder.stdin.end();
await finished;
await browser.close();
console.log(`Wrote ${out} in ${((Date.now() - started) / 1000).toFixed(0)} s.`);
