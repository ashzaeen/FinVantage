/**
 * Stitches the full MavPitch video: the new trailer, the founders' "Lights On" segment, and the
 * explainer, into out/finvantage-full.mp4 (1080p60) with out/finvantage-full.srt.
 *
 * Sources (out/ is gitignored, so they stay local):
 *   out/new trailer/FinVantage-trailer.mp4
 *   out/Our part/*  the founders' clips, script: FinVantage_Founders_Segment.pdf
 *   out/finvantage-explainer.mp4 (from render.mjs)
 *
 * Founders segment ("Lights On"): each founder in a dark, cool-graded room says one line and clicks
 * a lamp on; the light floods warm. After Yao's click, a warm flash into a cream-paper split screen
 * of three Polaroids ("Here's how it works"), then a flash to cream into the explainer's paper.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";
import { launchBrowser } from "./browser.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const OUT = here("./out/");
const TMP = here("./out/assemble/");
mkdirSync(TMP, { recursive: true });
const src = {
  trailer: here("./out/new trailer/FinVantage-trailer.mp4"),
  aram: here("./out/Our part/IMG_8063.mov"),
  ash: here("./out/Our part/PXL_20261120_001527545~3-1080p.mp4"), // 1080p copy of the 4K phone clip (the original stays out of git),
  ashHow: here("./out/Our part/PXL_20261120_002221490.mp4"),
  yao: here("./out/Our part/WIN_20261119_23_43_35_Pro.mp4"),
  explainer: here("./out/finvantage-explainer.mp4"),
};
const ff = (args) => execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const ENC = ["-c:v", "h264_nvenc", "-preset", "p6", "-rc", "vbr", "-cq", "17", "-b:v", "0", "-pix_fmt", "yuv420p", "-r", "60", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"];
const CREAM = "0xf3ead8";

// ---------- overlays, drawn in the explainer's paper style ----------
const TRAILER_CUT = 3.0; // skip the student-at-laptop opening, which Aram's dark room echoes
const FOUNDERS = [
  { key: "aram", name: "Aram Salman", role: "Simulator, Copilot & Chrome Extension" },
  { key: "ash", name: "Ashzaeen Fatmi Khan", role: "Product, Dashboard & AI Advisor" },
  { key: "yao", name: "Zheng Yao Wong", role: "Platform, Auth & Bank Data" },
];
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@800;900&family=Caveat:wght@700&family=Inter:wght@500;600&display=swap" rel="stylesheet">`;
// Polaroid windows for the split screen (16:9 photos).
const CARDS = [0, 1, 2].map((i) => ({ x: 90 + i * 600, y: 380, w: 540, photo: { x: 110 + i * 600, y: 400, w: 500, h: 281 } }));

async function renderOverlays() {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const shot = async (html, file, transparent = true) => {
    await page.setContent(`<!doctype html><html><head>${FONTS}<style>html,body{margin:0;background:transparent}</style></head><body>${html}</body></html>`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file, omitBackground: transparent });
  };
  for (const f of FOUNDERS) {
    await shot(`<div style="position:absolute;left:80px;bottom:90px;background:#fffaf0;border-radius:12px;padding:18px 28px 18px 24px;box-shadow:0 14px 34px rgba(0,0,0,.35);border-left:10px solid #f4a261">
      <div style="font-family:Archivo;font-weight:900;font-size:40px;color:#1f1d1a;letter-spacing:-.5px">${f.name}</div>
      <div style="font-family:Inter;font-weight:600;font-size:22px;color:#4b463e;margin-top:2px">${f.role}</div></div>`, `${TMP}card-${f.key}.png`);
  }
  // Split screen: cream paper underneath, Polaroid frames (with see-through photo windows) on top.
  const grain = `<canvas id="c" width="1920" height="1080" style="position:absolute;inset:0"></canvas><script>
    const x=document.getElementById('c').getContext('2d');x.fillStyle='#f3ead8';x.fillRect(0,0,1920,1080);
    const d=x.getImageData(0,0,1920,1080);let s=77;const r=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296};
    for(let i=0;i<d.data.length;i+=4){const n=(r()-.5)*14;d.data[i]+=n;d.data[i+1]+=n;d.data[i+2]+=n*.8}x.putImageData(d,0,0);
    const v=x.createRadialGradient(960,540,400,960,540,1150);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(90,60,20,.18)');x.fillStyle=v;x.fillRect(0,0,1920,1080);</script>`;
  await shot(grain, `${TMP}paper.png`, false);
  const frames = CARDS.map((c, i) => `<div style="position:absolute;left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${281 + 120}px;background:#fffdf8;box-shadow:0 22px 44px rgba(70,50,20,.28);
      -webkit-mask: linear-gradient(#000 0 0) , linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
      -webkit-mask-position: 0 0, 20px 20px; -webkit-mask-size: 100% 100%, 500px 281px; -webkit-mask-repeat: no-repeat;"></div>
    <div style="position:absolute;left:${c.x}px;top:${c.y + 281 + 34}px;width:${c.w}px;text-align:center;font-family:Caveat;font-weight:700;font-size:52px;color:#1f1d1a">${["Aram", "Ashzaeen", "Yao"][i]}</div>`).join("");
  await shot(`${frames}<div style="position:absolute;left:0;right:0;top:230px;text-align:center;font-family:Archivo;font-weight:900;font-size:72px;letter-spacing:-1.5px;color:#1f1d1a">Here's How It Works.</div>`, `${TMP}polaroids.png`);
  await browser.close();
}

// ---------- grades ----------
// Dark beats: cooler, desaturated, shadows lifted just enough to see faces, vignette. After the lamp
// clicks, a touch of warmth. The switch happens on the click, under the light flooding in.
const dark = (until, lift) => `eq=gamma=${lift}:contrast=1.1:saturation=0.82:enable='lt(t,${until})',colorbalance=rs=-0.06:bs=0.10:rm=-0.03:bm=0.05:enable='lt(t,${until})',vignette=angle=PI/4.6:enable='lt(t,${until})',colorbalance=rm=0.05:bm=-0.04:enable='gte(t,${until})'`;
const FIT = "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1,fps=60";
const VOICE = "highpass=f=90,afftdn=nf=-28,loudnorm=I=-16:TP=-2:LRA=11";
// A clear, soft lamp click layered on each click (the phone mics barely caught them).
const click = (at) => `aevalsrc='0.5*sin(2*PI*2600*t)*exp(-t*90)+0.3*(random(0)-0.5)*exp(-t*140)':s=48000:d=0.12,adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)},aformat=channel_layouts=stereo`;

function founder(key, inSrc, start, end, clickAt, extra = "") {
  const len = end - start;
  ff(["-ss", String(start), "-t", String(len), "-i", inSrc, "-loop", "1", "-t", String(len), "-i", `${TMP}card-${key}.png`,
    "-filter_complex",
    `[0:v]${FIT},${dark(clickAt - start, key === "yao" ? 1.75 : key === "ash" ? 1.4 : 1.0)}${extra}[v];` +
    `[1:v]format=rgba,fade=t=in:st=0.5:d=0.35:alpha=1,fade=t=out:st=3.4:d=0.4:alpha=1[card];[v][card]overlay=0:0:format=auto[vo];` +
    `[0:a]${VOICE},aresample=48000,aformat=channel_layouts=stereo[va];${click(clickAt - start)}[ck];[va][ck]amix=inputs=2:normalize=0:duration=first[a]`,
    "-map", "[vo]", "-map", "[a]", "-t", String(len), ...ENC, `${TMP}${key}.mp4`]);
  return len;
}

await renderOverlays();
console.log("overlays rendered");

// 1. Trailer, from 3 s in; dips to black at the end while its music fades out.
const trailerLen = 27.95 - TRAILER_CUT;
ff(["-ss", String(TRAILER_CUT), "-i", src.trailer, "-vf", `${FIT},fade=t=out:st=${trailerLen - 0.45}:d=0.45`, "-af", `afade=t=out:st=${trailerLen - 1.4}:d=1.4`, "-t", String(trailerLen), ...ENC, `${TMP}trailer.mp4`]);

// 2. Founders. Aram fades up from black; Yao's long pause before the lamp is shortened.
const aramLen = founder("aram", src.aram, 0, 8.9, 7.95, ",fade=t=in:st=0:d=0.35");
const ashLen = founder("ash", src.ash, 0, 10.1, 9.1);
// Yao: 6.25–12.3 (the line) + 14.25–15.75 (the click), joined with a short cross-fade in the dark.
ff(["-ss", "6.25", "-t", "6.05", "-i", src.yao, "-ss", "14.25", "-t", "1.5", "-i", src.yao, "-filter_complex",
  `[0:v]settb=AVTB,fps=60[a];[1:v]settb=AVTB,fps=60[b];[a][b]xfade=transition=fade:duration=0.15:offset=5.9[v];[0:a][1:a]acrossfade=d=0.15[au]`,
  "-map", "[v]", "-map", "[au]", ...ENC, `${TMP}yao-raw.mp4`]);
const yaoClick = 5.9 + (14.65 - 14.25);
// Yao's segment ends 0.4 s after his click, while the light floods in and before he smiles.
const yaoEnd = yaoClick + 0.4;
const yaoLen = founder("yao", `${TMP}yao-raw.mp4`, 0, yaoEnd, yaoClick, `,fade=t=out:st=${(yaoEnd - 0.22).toFixed(2)}:d=0.22:color=${CREAM}`);

// 3. Split screen on cream paper: all three say "Here's how it works" together. Each take is
// decoded whole (seeking is unreliable for audio in these files), the words are found from the
// loudness envelope, and each take is stretched a little (picture and voice together) so all three
// start and finish on the same frame.
const SPLIT = 3.2;
const LEAD = 0.3; // the line starts this far into the split
const findHow = (name) => { const dir = here("./out/Our part/"); const f = readdirSync(dir).find((x) => x.toLowerCase().startsWith(`${name}-how.`)); return f ? dir + f : null; };
const takes = [
  { name: "Aram", file: findHow("aram") ?? here("./out/Our part/IMG_8066 (1).mov"), from: 0, len: 1.97 },
  { name: "Ash", file: src.ashHow, from: 0, len: 2.06 },
  // Yao's second take; warm his cool webcam white balance to sit with the other two.
  { name: "Yao", file: findHow("yao") ?? here("./out/Our part/WIN_20261119_23_45_23_Pro.mp4"), from: findHow("yao") ? 0 : 4.3, len: 2.4, grade: "colorbalance=rs=0.06:bs=-0.08:rm=0.04:bm=-0.05,eq=contrast=1.05:saturation=1.05" },
];
// Where the words start and end: 10 ms loudness frames above 35% of the way from the room-noise
// floor to the peak, ignoring blips under 80 ms (clicks) and bridging gaps under 250 ms.
function speechSpan(t) {
  const pcm = execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", t.file, "-vn", "-af", `atrim=start=${t.from}:duration=${t.len},asetpts=PTS-STARTPTS,highpass=f=120,lowpass=f=5000`, "-ar", "16000", "-ac", "1", "-f", "s16le", "-"], { maxBuffer: 1 << 26 });
  const x = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1);
  const e = [];
  for (let i = 0; i + 160 <= x.length; i += 160) { let s = 0; for (let j = i; j < i + 160; j++) s += (x[j] / 32768) ** 2; e.push(10 * Math.log10(s / 160 + 1e-12)); }
  const sorted = [...e].sort((a, b) => a - b); const floor = sorted[Math.floor(e.length * 0.1)], peak = sorted[e.length - 1];
  const on = e.map((v) => v > floor + 0.35 * (peak - floor));
  const runs = []; let k = 0;
  while (k < on.length) { if (!on[k]) { k++; continue; } let j = k; while (j < on.length && on[j]) j++; runs.push([k, j]); k = j; }
  const merged = []; for (const r of runs) { const last = merged.at(-1); if (last && r[0] - last[1] < 25) last[1] = r[1]; else merged.push([...r]); }
  const best = merged.filter((r) => r[1] - r[0] >= 8).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
  return { on: best[0] / 100, off: best[1] / 100 };
}
for (const t of takes) Object.assign(t, speechSpan(t));
const target = takes.reduce((s, t) => s + (t.off - t.on), 0) / takes.length;
for (const t of takes) {
  t.k = Math.min(1.3, Math.max(0.77, target / (t.off - t.on))); // >1 slows the take down
  t.start = t.from + t.on - LEAD / t.k; // source time that lands at the start of the split
  t.pad = Math.max(0, -t.start * t.k); t.start = Math.max(0, t.start);
}
console.log("Here's how it works:", takes.map((t) => `${t.name} ${(t.off - t.on).toFixed(2)}s ×${t.k.toFixed(2)}`).join(", "), `→ ${target.toFixed(2)}s each`);
const splitIn = ["-loop", "1", "-t", String(SPLIT), "-i", `${TMP}paper.png`, ...takes.flatMap((t) => ["-i", t.file]), "-loop", "1", "-t", String(SPLIT), "-i", `${TMP}polaroids.png`];
const tileV = takes.map((t, i) => `[${i + 1}:v]trim=start=${t.start.toFixed(3)},setpts=(PTS-STARTPTS)*${t.k.toFixed(4)},scale=500:281:force_original_aspect_ratio=increase,crop=500:281,setsar=1,${t.grade ?? "colorbalance=rm=0.05:bm=-0.04"},fps=60` +
  `${t.pad ? `,tpad=start_mode=clone:start_duration=${t.pad.toFixed(3)}` : ""},tpad=stop_mode=clone:stop_duration=${SPLIT},trim=duration=${SPLIT}[p${i}]`).join(";");
const tileA = takes.map((t, i) => { const d = Math.round(t.pad * 1000); return `[${i + 1}:a]atrim=start=${t.start.toFixed(3)},asetpts=PTS-STARTPTS,atempo=${(1 / t.k).toFixed(4)},highpass=f=90,afftdn=nf=-28,loudnorm=I=-18:TP=-3,aresample=48000,aformat=channel_layouts=stereo,adelay=${d}|${d}[h${i}]`; }).join(";");
ff([...splitIn, "-filter_complex",
  `[0:v]fps=60,format=yuv420p[bg];${tileV};` +
  `[bg][p0]overlay=${CARDS[0].photo.x}:${CARDS[0].photo.y}[s1];[s1][p1]overlay=${CARDS[1].photo.x}:${CARDS[1].photo.y}[s2];[s2][p2]overlay=${CARDS[2].photo.x}:${CARDS[2].photo.y}[s3];` +
  `[4:v]format=rgba[fr];[s3][fr]overlay=0:0,fade=t=in:st=0:d=0.2:color=${CREAM},fade=t=out:st=${SPLIT - 0.3}:d=0.3:color=${CREAM},trim=duration=${SPLIT}[v];` +
  `${tileA};[h0][h1][h2]amix=inputs=3:normalize=0:duration=longest,loudnorm=I=-16:TP=-2,aresample=48000,apad=whole_dur=${SPLIT}[a]`,
  "-map", "[v]", "-map", "[a]", "-t", String(SPLIT), ...ENC, `${TMP}split.mp4`]);

// 4. Everything, in order. The explainer opens on the same cream paper, in the quiet.
const parts = ["trailer", "aram", "ash", "yao", "split"].map((k) => `${TMP}${k}.mp4`).concat(src.explainer);
const inputs = parts.flatMap((p) => ["-i", p]);
const chain = parts.map((_, i) => `[${i}:v]fps=60,format=yuv420p,setsar=1[v${i}];[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`).join(";");
const cat = parts.map((_, i) => `[v${i}][a${i}]`).join("");
ff([...inputs, "-filter_complex", `${chain};${cat}concat=n=${parts.length}:v=1:a=1[v][a]`, "-map", "[v]", "-map", "[a]", ...ENC, "-movflags", "+faststart", `${OUT}finvantage-full.mp4`]);

// 5. Captions for the whole video: the founders' lines, then the explainer's captions, shifted.
const stamp = (s) => { const ms = Math.round(s * 1000); const p = (n, w = 2) => String(n).padStart(w, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
let t0 = trailerLen;
const cues = [
  [t0 + 0.0, t0 + 6.9, "I'm Aram. 1 a.m. I almost bought a $2,500 MacBook, and nobody was there to stop me."],
  [t0 + aramLen + 0.0, t0 + aramLen + 7.6, "I'm Ash. People say, just ask ChatGPT. But nobody asks at 1 a.m. when the buy button is right there."],
  [t0 + aramLen + ashLen + 0.35, t0 + aramLen + ashLen + 5.6, "I'm Yao. We're three college students who built something we wish had spoken up."],
  [t0 + aramLen + ashLen + yaoLen + 0.0, t0 + aramLen + ashLen + yaoLen + 1.2, "Here's how it works."],
];
const offset = trailerLen + aramLen + ashLen + yaoLen + SPLIT;
const explainerCues = readFileSync(here("./out/finvantage-explainer.srt"), "utf8").trim().split(/\r?\n\r?\n/).map((block) => {
  const [, times, ...text] = block.split(/\r?\n/);
  const [a, b] = times.split(" --> ").map((x) => { const [h, m, rest] = x.split(":"); const [sec, ms] = rest.split(","); return +h * 3600 + +m * 60 + +sec + +ms / 1000; });
  return [a + offset, b + offset, text.join(" ")];
});
writeFileSync(`${OUT}finvantage-full.srt`, [...cues, ...explainerCues].map(([a, b, text], i) => `${i + 1}\n${stamp(a)} --> ${stamp(b)}\n${text}\n`).join("\n"));
console.log(`Trailer ${trailerLen.toFixed(1)} s + founders ${(aramLen + ashLen + yaoLen + SPLIT).toFixed(1)} s + explainer → out/finvantage-full.mp4`);
