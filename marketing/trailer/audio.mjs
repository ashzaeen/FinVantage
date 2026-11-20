/**
 * Writes out/audio.wav: the trailer's sound, synthesized from the cue list in trailer.html so every
 * hit lands on the frame it belongs to. 48 kHz, stereo, 16-bit, exactly the trailer's length.
 *
 * Layers: the score (music.mjs), then each cue (boom, hit, riser, whoosh, tick, click) on a dry
 * bus and a reverb send. The mix is soft-limited and normalized to -1 dBFS.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mixMusic } from "./music.mjs";

const html = readFileSync(new URL("./trailer.html", import.meta.url), "utf8");
const pick = (name) => html.match(new RegExp(`const ${name} = ([\\s\\S]*?);\\n`))[1];
const DURATION = Number(pick("DURATION"));
const CUES = new Function(`return ${pick("CUES")}`)();

const RATE = 48_000;
const N = Math.round(DURATION * RATE);
const dryL = new Float32Array(N), dryR = new Float32Array(N);
const send = new Float32Array(N);

let seed = 7;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
const TAU = Math.PI * 2;

/** Adds a mono source at time t0 with a pan (-1 left, 1 right) and a reverb send level. */
function add(t0, length, fn, { gain = 1, pan = 0, wet = 0.3 } = {}) {
  const start = Math.round(t0 * RATE), count = Math.round(length * RATE);
  const l = Math.cos(((pan + 1) * Math.PI) / 4), r = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < count && start + i < N; i++) {
    if (start + i < 0) continue;
    const v = fn(i / RATE, i) * gain;
    const panNow = typeof pan === "function" ? pan(i / count) : null;
    const gl = panNow === null ? l : Math.cos(((panNow + 1) * Math.PI) / 4);
    const gr = panNow === null ? r : Math.sin(((panNow + 1) * Math.PI) / 4);
    dryL[start + i] += v * gl;
    dryR[start + i] += v * gr;
    send[start + i] += v * wet;
  }
}

/** A one-pole low-pass whose cutoff can move, for shaping noise. */
function lowpass() {
  let y = 0;
  return (x, cutoff) => {
    const a = 1 - Math.exp((-TAU * cutoff) / RATE);
    y += a * (x - y);
    return y;
  };
}

const sounds = {
  boom({ size = 1 }) {
    const lp = lowpass();
    let phase = 0, phase2 = 0;
    return [3.5, (t) => {
      const f = 32 + 70 * Math.exp(-t * 3.2);
      phase += (TAU * f) / RATE;
      phase2 += (TAU * f * 1.5) / RATE;
      const body = Math.sin(phase) * Math.exp(-t / (0.9 * size + 0.4));
      const fifth = 0.25 * Math.sin(phase2) * Math.exp(-t / 0.6);
      const crack = lp(noise(), 2500 * Math.exp(-t * 6) + 120) * Math.exp(-t / 0.18) * 1.4;
      return (body + fifth + crack) * 0.95 * size;
    }, { wet: 0.55 }];
  },
  hit({ size = 0.7 }) {
    const lp = lowpass();
    let phase = 0;
    const partials = [311, 467, 733, 1046];
    return [1.8, (t) => {
      phase += (TAU * (48 + 90 * Math.exp(-t * 18))) / RATE;
      const thump = Math.sin(phase) * Math.exp(-t / 0.28);
      const snap = lp(noise(), 6000 * Math.exp(-t * 20) + 400) * Math.exp(-t / 0.05) * 1.2;
      const ring = partials.reduce((s, f, k) => s + Math.sin(TAU * f * t) * Math.exp(-t / (0.5 - k * 0.08)), 0) * 0.07;
      return (thump + snap + ring) * size;
    }, { wet: 0.45 }];
  },
  riser({ length = 2 }) {
    const lp = lowpass();
    let phase = 0;
    return [length, (t) => {
      const p = t / length;
      phase += (TAU * (180 + 900 * p * p)) / RATE;
      const swell = Math.pow(p, 2.2);
      const air = lp(noise(), 300 + 7000 * p * p) * 0.6;
      const tone = Math.sin(phase) * 0.18 + Math.sin(phase * 2.01) * 0.08;
      const tail = p > 0.97 ? (1 - p) / 0.03 : 1; // stop cleanly just before the hit
      return (air + tone) * swell * tail * 0.75;
    }, { wet: 0.35 }];
  },
  whoosh({ length = 0.5 }, down = false) {
    const lp = lowpass();
    return [length, (t) => {
      const p = t / length;
      const env = Math.sin(Math.PI * p) ** 2;
      const cutoff = down ? 4000 * (1 - p) + 200 : 400 + 5000 * Math.sin(Math.PI * p);
      return lp(noise(), cutoff) * env * 1.1;
    }, { wet: 0.3, pan: (q) => (down ? 0 : -0.8 + 1.6 * q) }];
  },
  tick() {
    return [0.08, (t) => (Math.sin(TAU * 2200 * t) * 0.5 + noise() * 0.3) * Math.exp(-t / 0.012) * 0.45, { wet: 0.2 }];
  },
  click() {
    const lp = lowpass();
    return [0.05, (t) => (noise() - lp(noise(), 1500)) * Math.exp(-t / 0.006) * 0.6, { wet: 0.1 }];
  },
};

for (const cue of CUES) {
  const [length, fn, opts] = cue.kind === "whooshDown" ? sounds.whoosh(cue, true) : sounds[cue.kind](cue);
  add(cue.t, length, fn, opts);
}

// Music under everything (music.mjs), on the same buffers as the sound effects.
mixMusic((t, l, r, wet) => {
  const i = Math.round(t * RATE);
  if (i < 0 || i >= N) return;
  dryL[i] += l;
  dryR[i] += r;
  send[i] += (l + r) * 0.5 * wet;
}, RATE, N);

// Reverb on the send bus: four combs and two all-passes per side (Schroeder).
function reverb(input, offset) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ buf: new Float32Array(d + offset), i: 0, store: 0 }));
  const alls = [225, 556].map((d) => ({ buf: new Float32Array(d + offset), i: 0 }));
  const out = new Float32Array(input.length);
  for (let n = 0; n < input.length; n++) {
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.store = y * 0.8 + c.store * 0.2;
      c.buf[c.i] = input[n] + c.store * 0.84;
      c.i = (c.i + 1) % c.buf.length;
      s += y;
    }
    for (const a of alls) {
      const b = a.buf[a.i];
      const y = -s + b;
      a.buf[a.i] = s + b * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      s = y;
    }
    out[n] = s * 0.25;
  }
  return out;
}
const wetL = reverb(send, 0), wetR = reverb(send, 23);

// Mix, soft-limit, fade the last 0.6 s, normalize to -1 dBFS.
const mixL = new Float32Array(N), mixR = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (N - i) / (0.6 * RATE));
  mixL[i] = Math.tanh((dryL[i] + wetL[i]) * 1.2) * fade;
  mixR[i] = Math.tanh((dryR[i] + wetR[i]) * 1.2) * fade;
  peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));
}
const norm = (10 ** (-1 / 20)) / (peak || 1);

const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(mixL[i] * norm * 32767), i * 4);
  data.writeInt16LE(Math.round(mixR[i] * norm * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
header.write("data", 36); header.writeUInt32LE(data.length, 40);
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL("./out/audio.wav", import.meta.url), Buffer.concat([header, data]));
console.log(`Wrote out/audio.wav: ${DURATION} s, ${CUES.length} cues, peak normalized to -1 dBFS.`);
