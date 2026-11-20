/**
 * Writes out/audio.wav: the voice takes placed on the timeline, over a light Vox-style music bed
 * (marimba plucks, soft kick, shaker, warm pad) that ducks under the voice, plus a paper swish at
 * each scene change. 48 kHz stereo. render.mjs levels the final mix to -16 LUFS.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const timeline = JSON.parse(readFileSync(here("./out/timeline.json"), "utf8"));
const RATE = 48_000;
const N = Math.ceil(timeline.total * RATE);
const TAU = Math.PI * 2;
const voice = new Float32Array(N), musL = new Float32Array(N), musR = new Float32Array(N), fxL = new Float32Array(N), fxR = new Float32Array(N);

function readWav(file) {
  const b = readFileSync(file);
  let off = 12, fmt = null, data = null;
  while (off < b.length) {
    const id = b.toString("ascii", off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { channels: b.readUInt16LE(off + 10), bits: b.readUInt16LE(off + 22) };
    if (id === "data") data = b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  const step = fmt.bits / 8 * fmt.channels, out = new Float32Array(data.length / step);
  for (let i = 0; i < out.length; i++) out[i] = fmt.bits === 16 ? data.readInt16LE(i * step) / 32768 : data.readFloatLE(i * step);
  return out;
}

// Voice, on the timeline.
for (const b of timeline.beats) {
  const take = readWav(here(`./out/voice/${b.id}.wav`));
  const start = Math.round(b.voiceStart * RATE);
  for (let i = 0; i < take.length && start + i < N; i++) voice[start + i] += take[i];
}

// ---------- music ----------
let seed = 5;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const BPM = 100, BEAT = 60 / BPM, BAR = BEAT * 4;
const CHORDS = [ // C, G, Am, F: hopeful, plain
  { pad: [60, 64, 67], bass: 36, arp: [72, 76, 79, 76] },
  { pad: [59, 62, 67], bass: 43, arp: [71, 74, 79, 74] },
  { pad: [57, 60, 64], bass: 45, arp: [69, 72, 76, 72] },
  { pad: [57, 60, 65], bass: 41, arp: [69, 72, 77, 72] },
];
const add = (buf, i, v) => { if (i >= 0 && i < N) buf[i] += v; };
// Build-up: lighter during the product beats, fuller in the business beats, a lift at the ask.
const askStart = timeline.beats.find((b) => b.scene === "ask").start;
const energy = (t) => (t < 4 ? 0.6 + 0.1 * t : t < askStart ? 1 : 1.15);

const bars = Math.ceil(timeline.total / BAR) + 1;
for (let bar = 0; bar < bars; bar++) {
  const chord = CHORDS[bar % 4];
  const t0 = bar * BAR;
  // Pad: soft sine stack with slow attack.
  for (let i = 0; i < BAR * RATE; i++) {
    const t = t0 + i / RATE, idx = Math.round(t * RATE);
    if (idx >= N) break;
    const env = Math.min(1, i / (0.5 * RATE)) * Math.min(1, (BAR * RATE - i) / (0.3 * RATE));
    let l = 0, r = 0;
    for (const m of chord.pad) { const f = midi(m); l += Math.sin(TAU * f * 1.002 * t) + 0.3 * Math.sin(TAU * f * 2 * t); r += Math.sin(TAU * f * 0.998 * t + 1) + 0.3 * Math.sin(TAU * f * 2 * t + 1); }
    add(musL, idx, l * 0.012 * env); add(musR, idx, r * 0.012 * env);
  }
  for (let s = 0; s < 8; s++) {
    const t = t0 + s * BEAT / 2, start = Math.round(t * RATE), e = energy(t);
    // Marimba: sine with a fast-decaying overtone, alternating sides.
    const note = chord.arp[s % 4] + (s >= 4 ? 0 : 0), f = midi(note), pan = s % 2 ? 0.35 : -0.35;
    for (let i = 0; i < 0.5 * RATE; i++) { const u = i / RATE; const v = (Math.sin(TAU * f * u) + 0.5 * Math.sin(TAU * f * 4 * u) * Math.exp(-u * 30)) * Math.exp(-u / 0.18) * 0.05 * e; add(musL, start + i, v * (1 - pan)); add(musR, start + i, v * (1 + pan)); }
    // Shaker on every eighth.
    for (let i = 0; i < 0.06 * RATE; i++) { const u = i / RATE; const v = noise() * Math.exp(-u / 0.018) * 0.018 * e * (s % 2 ? 1 : 0.6); add(musL, start + i, v * 0.8); add(musR, start + i, v * 1.2); }
    // Soft kick on beats 1 and 3, bass on every beat.
    if (s % 4 === 0) { let ph = 0; for (let i = 0; i < 0.3 * RATE; i++) { const u = i / RATE; ph += TAU * (50 + 70 * Math.exp(-u * 30)) / RATE; const v = Math.sin(ph) * Math.exp(-u / 0.12) * 0.16 * e; add(musL, start + i, v); add(musR, start + i, v); } }
    if (s % 2 === 0) { const fb = midi(chord.bass); for (let i = 0; i < 0.4 * RATE; i++) { const u = i / RATE; let v = 0; for (let h = 1; h <= 4; h++) v += Math.sin(TAU * fb * h * u) / (h * h); v *= Math.min(1, u / 0.01) * Math.exp(-u / 0.22) * 0.06 * e; add(musL, start + i, v); add(musR, start + i, v); } }
  }
}
// Music fades in over 1.5 s and out over the last 2 s.
const MUSIC_GAIN = 1.8; // about +5 dB: present in the pauses, still well under the voice
for (let i = 0; i < N; i++) { const t = i / RATE; const g = MUSIC_GAIN * Math.min(1, t / 1.5) * Math.min(1, (timeline.total - t) / 2); musL[i] *= g; musR[i] *= g; }

// ---------- duck the music under the voice ----------
let envV = 0;
const atk = Math.exp(-1 / (0.03 * RATE)), rel = Math.exp(-1 / (0.45 * RATE));
for (let i = 0; i < N; i++) {
  const x = Math.abs(voice[i]);
  envV = x > envV ? atk * envV + (1 - atk) * x : rel * envV + (1 - rel) * x;
  const duck = 1 - 0.72 * Math.min(1, envV / 0.06); // about -11 dB while talking
  musL[i] *= duck; musR[i] *= duck;
}

// ---------- sound design, from out/cues.json (cues.mjs) ----------
const cues = JSON.parse(readFileSync(here("./out/cues.json"), "utf8"));
const at = (t) => Math.round(t * RATE);
// Paper moving: a soft filtered-noise swish, panned with the motion. Longer and fuller for wipes.
function swish(t, len, gain, leftToRight = true) {
  let lp = 0; const start = at(t - len / 2), n = len * RATE;
  for (let i = 0; i < n; i++) { const p = i / n; lp += (0.06 + 0.45 * Math.sin(Math.PI * p)) * (noise() - lp); const v = lp * Math.sin(Math.PI * p) ** 2 * gain; add(fxL, start + i, v * (leftToRight ? 1 - p : p)); add(fxR, start + i, v * (leftToRight ? p : 1 - p)); }
}
for (const c of cues.cuts) {
  if (c.kind === "wipe") swish(c.t, 0.9, 0.16, false);
  else swish(c.t, 0.45, 0.07, c.kind !== "panUp");
}
// Reveals: a tiny paper tick for each card or chip, a soft thump for stamps, pencil for drawings.
for (const e of cues.events) {
  const s0 = at(e.t);
  if (e.kind === "pop") {
    let lp = 0;
    for (let i = 0; i < 0.06 * RATE; i++) { const u = i / RATE; lp += 0.35 * (noise() - lp); const v = ((noise() - lp) * 0.6 + Math.sin(TAU * 1900 * u) * 0.25) * Math.exp(-u / 0.012) * 0.05; add(fxL, s0 + i, v); add(fxR, s0 + i, v); }
  } else if (e.kind === "slam") {
    let ph = 0;
    for (let i = 0; i < 0.35 * RATE; i++) { const u = i / RATE; ph += TAU * (70 + 90 * Math.exp(-u * 25)) / RATE; const v = (Math.sin(ph) * Math.exp(-u / 0.09) + noise() * Math.exp(-u / 0.02) * 0.3) * 0.14; add(fxL, s0 + i, v); add(fxR, s0 + i, v); }
  } else if (e.kind === "ink") {
    // Pencil: bandpassed noise with a scribbling tremolo, about half a second.
    let lp1 = 0, lp2 = 0; const n = 0.55 * RATE;
    for (let i = 0; i < n; i++) { const u = i / RATE, p = i / n; const x = noise(); lp1 += 0.5 * (x - lp1); lp2 += 0.08 * (lp1 - lp2); const band = lp1 - lp2; const trem = 0.55 + 0.45 * Math.sin(TAU * 11 * u + Math.sin(TAU * 3 * u)); const v = band * trem * Math.sin(Math.PI * p) * 0.05; add(fxL, s0 + i, v * 0.8); add(fxR, s0 + i, v * 1.1); }
  }
}
// Chapter hits: a short rise into each wipe, then a warm low hit with a bell on top.
for (const c of cues.cuts.filter((x) => x.kind === "wipe")) {
  const s0 = at(c.t);
  for (let i = -0.8 * RATE; i < 0; i++) { const p = 1 + i / (0.8 * RATE); const v = noise() * p * p * 0.03; add(fxL, s0 + i, v); add(fxR, s0 + i, v); }
  let ph = 0;
  for (let i = 0; i < 1.6 * RATE; i++) {
    const u = i / RATE; ph += TAU * (55 + 40 * Math.exp(-u * 12)) / RATE;
    const v = Math.sin(ph) * Math.exp(-u / 0.45) * 0.2 + (Math.sin(TAU * 880 * u) + 0.5 * Math.sin(TAU * 1320 * u)) * Math.exp(-u / 0.6) * 0.03;
    add(fxL, s0 + i, v); add(fxR, s0 + i, v);
  }
}

// ---------- mix ----------
const data = Buffer.alloc(N * 4);
let peak = 0;
const L = new Float32Array(N), R = new Float32Array(N);
for (let i = 0; i < N; i++) { L[i] = voice[i] + musL[i] + fxL[i]; R[i] = voice[i] + musR[i] + fxR[i]; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const g = peak > 0.95 ? 0.95 / peak : 1;
for (let i = 0; i < N; i++) { data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), i * 4); data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), i * 4 + 2); }
const h = Buffer.alloc(44);
h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
writeFileSync(here("./out/audio.wav"), Buffer.concat([h, data]));
console.log(`Wrote out/audio.wav: ${timeline.total.toFixed(1)} s, ${timeline.beats.length} voice takes, music ducked under the voice.`);
