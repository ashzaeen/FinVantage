/**
 * Builds out/timeline.json and out/finvantage-explainer.srt from lines.json and the voice takes.
 *
 * Each beat lasts as long as the script's slot, or longer if its take needs it (lead-in + take +
 * a short breath). So a slower human take stretches only its own beat; everything after it moves
 * along, and the scenes, which animate in beat time, stay in sync.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const LEAD = 0.25; // voice starts this long after its scene
const BREATH = 0.25; // and the scene holds this long after the voice ends
const END_HOLD = 1.2; // the end card stays up after the last line

function duration(file) {
  let text = "";
  try {
    execFileSync(ffmpeg, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (error) {
    text = String(error.stderr);
  }
  const m = text.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error(`Can't read the length of ${file}. Run voice.mjs first.`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

const { beats } = JSON.parse(readFileSync(here("./lines.json"), "utf8"));
// Word timings from align.py (seconds from each take's start), so reveals hit the spoken word.
const words = existsSync(here("./out/words.json")) ? JSON.parse(readFileSync(here("./out/words.json"), "utf8")) : {};
let t = 0;
// A little extra room before each chapter change, for the page wipe and its music hit.
const CHAPTER_GAP = 0.45;
const chapterEnds = new Set((JSON.parse(readFileSync(here("./lines.json"), "utf8")).chapters ?? []).slice(0, -1).map((c) => c.beats[c.beats.length - 1]));
const timeline = beats.map((beat, i) => {
  const voice = duration(here(`./out/voice/${beat.id}.wav`));
  let length = Math.max(beat.slot, LEAD + voice + BREATH) + (chapterEnds.has(beat.id) ? CHAPTER_GAP : 0);
  if (i === beats.length - 1) length = Math.max(length, LEAD + voice + END_HOLD);
  const entry = { id: beat.id, scene: beat.scene, text: beat.text, start: +t.toFixed(3), length: +length.toFixed(3), voiceStart: +(t + LEAD).toFixed(3), voiceLength: +voice.toFixed(3), words: words[beat.id] ?? [] };
  t += length;
  return entry;
});
const total = +t.toFixed(3);
writeFileSync(here("./out/timeline.json"), JSON.stringify({ total, fps: 30, beats: timeline }, null, 2));

const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
writeFileSync(here("./out/finvantage-explainer.srt"), timeline.map((b, i) => `${i + 1}\n${stamp(b.voiceStart)} --> ${stamp(b.voiceStart + b.voiceLength)}\n${b.text}\n`).join("\n"));

const over = timeline.filter((b, i) => b.length > beats[i].slot + 0.01).map((b) => b.id);
const aligned = timeline.filter((b) => b.words.length).length;
console.log(`Words aligned for ${aligned} of ${timeline.length} beats.`);
console.log(`Timeline: ${Math.floor(total / 60)}:${(total % 60).toFixed(1).padStart(4, "0")} across ${timeline.length} beats${over.length ? `; stretched to fit the voice: ${over.join(", ")}` : ""}.`);
