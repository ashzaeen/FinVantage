/**
 * The trailer's score, synthesized: an A minor progression on a beat grid whose bars land on the
 * two big moments (the simulation reveal at 16.2 s and the logo at 26.0 s). It builds in layers:
 *
 *   0–3 s     pad alone, under the cold open
 *   3–7 s     + pulsing bass
 *   7–13 s    + kick on the half-time beat and a bell arpeggio
 *   13–16 s   + hats, full kick, a snare roll into the reveal
 *   16–25.5 s everything, with backbeat claps
 *   25.5–26 s drop out for the riser
 *   26–30 s   one big A minor chord, ringing out
 *
 * mixMusic(add, RATE, N) writes into the caller's buffers through add(time, left, right, wet).
 */
const TAU = Math.PI * 2;
export const BEAT = 0.49; // 122.4 BPM: 20 beats from 16.2 s to 26.0 s
export const ANCHOR = 16.2;
const BAR = BEAT * 4;
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

// Pad voicing and bass root for each bar, counted from the anchor (bar 0 starts at 16.2 s).
const CHORDS = {
  Am: { pad: [57, 60, 64, 69], bass: 33 },
  F: { pad: [53, 57, 60, 65], bass: 29 },
  C: { pad: [55, 60, 64, 67], bass: 36 },
  G: { pad: [55, 59, 62, 67], bass: 31 },
  E: { pad: [56, 59, 64, 68], bass: 28 },
};
const PROGRESSION = { "-9": "Am", "-8": "Am", "-7": "F", "-6": "C", "-5": "G", "-4": "Am", "-3": "F", "-2": "C", "-1": "E", 0: "Am", 1: "F", 2: "C", 3: "G", 4: "E" };
const barStart = (k) => ANCHOR + k * BAR;

let seed = 99;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};

/** How loud each layer is at time t, by keyframes. */
function curve(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let k = 1; k < keys.length; k++) {
      const [t1, v1] = keys[k], [t0, v0] = keys[k - 1];
      if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
    }
    return keys[keys.length - 1][1];
  };
}
const padLevel = curve([[0, 0], [1.5, 0.55], [3, 0.45], [7, 0.5], [16.2, 0.85], [25.4, 0.85], [25.9, 0.3], [26, 1], [28.4, 0.75], [30, 0]]);

export function mixMusic(add, RATE, N) {
  const DUR = N / RATE;

  // Pad: each chord a bar long, soft saw tones (four harmonics, slightly detuned) with a slow attack.
  for (let k = -9; k <= 4; k++) {
    const chord = CHORDS[PROGRESSION[k]];
    const t0 = Math.max(0, barStart(k)), t1 = barStart(k + 1);
    if (t1 <= 0) continue;
    const start = Math.round(t0 * RATE), end = Math.min(N, Math.round((t1 + 0.4) * RATE));
    for (let i = start; i < end; i++) {
      const t = i / RATE;
      const env = Math.min(1, (t - t0) / 0.35) * Math.min(1, Math.max(0, (t1 + 0.4 - t) / 0.4));
      let l = 0, r = 0;
      for (const m of chord.pad) {
        const f = midi(m);
        for (let h = 1; h <= 4; h++) {
          l += Math.sin(TAU * f * h * 1.0012 * t) / (h * 1.6);
          r += Math.sin(TAU * f * h * 0.9988 * t + 0.7) / (h * 1.6);
        }
      }
      const g = 0.022 * env * padLevel(t);
      add(t, l * g, r * g, 0.5);
    }
  }

  // Final chord at 26 s: A minor add 9, wide, decaying through the end.
  {
    const notes = [45, 52, 57, 64, 69, 71, 72];
    for (let i = Math.round(26 * RATE); i < N; i++) {
      const t = i / RATE, u = t - 26;
      const env = Math.min(1, u / 0.02) * Math.exp(-u / 2.6) * Math.min(1, (DUR - t) / 0.8);
      let l = 0, r = 0;
      notes.forEach((m, j) => {
        const f = midi(m);
        for (let h = 1; h <= 5; h++) {
          const a = Math.exp(-u * h * 0.25) / (h * 1.4);
          l += Math.sin(TAU * f * h * 1.0015 * t + j) * a;
          r += Math.sin(TAU * f * h * 0.9985 * t + j * 1.3) * a;
        }
      });
      add(t, l * 0.03 * env, r * 0.03 * env, 0.6);
    }
  }

  // Note events on the grid: bass, arpeggio, drums.
  const events = [];
  const firstBeat = Math.ceil((0 - ANCHOR) / BEAT);
  const lastBeat = Math.floor((DUR - ANCHOR) / BEAT);
  for (let b = firstBeat; b <= lastBeat; b++) {
    for (const half of [0, 0.5]) {
      const t = ANCHOR + (b + half) * BEAT;
      if (t < 0 || t >= DUR) continue;
      const bar = Math.floor((b + half) / 4);
      const chord = CHORDS[PROGRESSION[bar]] ?? null;
      const beatInBar = (((b % 4) + 4) % 4);
      const rhythmOn = t < 25.5;
      // Bass: eighth notes from 3 s, root then octave.
      if (chord && t >= 3.0 && rhythmOn) events.push({ t, kind: "bass", note: chord.bass + (half ? 12 : 0) });
      // Arpeggio: eighth notes from 7 s, chord tones an octave up.
      if (chord && t >= 6.85 && rhythmOn) {
        const order = [0, 2, 1, 3, 2, 1, 3, 2];
        const step = (beatInBar * 2 + (half ? 1 : 0)) % 8;
        events.push({ t, kind: "arp", note: chord.pad[order[step]] + 12 });
      }
      if (!half && rhythmOn) {
        // Kick: half time from 7 s, every beat from 13 s.
        if ((t >= 6.85 && t < 13 && beatInBar % 2 === 0) || t >= 13) events.push({ t, kind: "kick" });
        // Claps on the backbeat after the reveal.
        if (t >= 16.2 && (beatInBar === 1 || beatInBar === 3)) events.push({ t, kind: "clap" });
      }
      // Hats on eighths from 13 s.
      if (t >= 13 && rhythmOn) events.push({ t, kind: "hat", open: half === 0.5 });
    }
  }
  // Snare roll into the reveal: sixteenths, then thirty-seconds, rising.
  for (let t = ANCHOR - 2 * BEAT; t < ANCHOR - 0.01; t += t < ANCHOR - BEAT ? BEAT / 4 : BEAT / 8) {
    events.push({ t, kind: "snare", gain: 0.35 + 0.65 * (1 - (ANCHOR - t) / (2 * BEAT)) });
  }
  // Big downbeats.
  events.push({ t: ANCHOR, kind: "kick", big: true }, { t: 26.0, kind: "kick", big: true });

  for (const e of events) {
    const start = Math.round(e.t * RATE);
    if (e.kind === "bass") {
      const f = midi(e.note);
      let y = 0;
      for (let i = 0; i < 0.3 * RATE && start + i < N; i++) {
        const u = i / RATE;
        let v = 0;
        for (let h = 1; h <= 8; h++) v += Math.sin(TAU * f * h * u) / h;
        y += 0.12 * (v - y); // soften the top
        const g = Math.min(1, u / 0.004) * Math.exp(-u / 0.16) * 0.11;
        add(e.t + u, y * g, y * g, 0.05);
      }
    } else if (e.kind === "arp") {
      const f = midi(e.note);
      for (let i = 0; i < 0.45 * RATE && start + i < N; i++) {
        const u = i / RATE;
        const v = Math.sin(TAU * f * u) + 0.3 * Math.sin(TAU * f * 2 * u) * Math.exp(-u * 8) + 0.12 * Math.sin(TAU * f * 3.01 * u) * Math.exp(-u * 14);
        const g = Math.exp(-u / 0.16) * 0.06;
        const pan = Math.sin(e.t * 3.1) * 0.5;
        add(e.t + u, v * g * (1 - pan), v * g * (1 + pan), 0.45);
      }
    } else if (e.kind === "kick") {
      let phase = 0;
      const size = e.big ? 1.4 : 1;
      for (let i = 0; i < 0.4 * RATE && start + i < N; i++) {
        const u = i / RATE;
        phase += (TAU * (44 + 110 * Math.exp(-u * 35))) / RATE;
        const v = Math.sin(phase) * Math.exp(-u / (0.16 * size)) + (u < 0.004 ? noise() * 0.5 : 0);
        add(e.t + u, v * 0.32 * size, v * 0.32 * size, e.big ? 0.4 : 0.08);
      }
    } else if (e.kind === "clap" || e.kind === "snare") {
      let lp = 0;
      const gain = (e.gain ?? 1) * (e.kind === "clap" ? 0.2 : 0.16);
      for (let i = 0; i < 0.2 * RATE && start + i < N; i++) {
        const u = i / RATE;
        const n = noise();
        lp += 0.25 * (n - lp);
        const body = (n - lp) * Math.exp(-u / 0.07) + Math.sin(TAU * 190 * u) * Math.exp(-u / 0.04) * 0.4;
        add(e.t + u, body * gain, body * gain, 0.35);
      }
    } else if (e.kind === "hat") {
      let lp = 0;
      const decay = e.open ? 0.07 : 0.025;
      for (let i = 0; i < 0.12 * RATE && start + i < N; i++) {
        const u = i / RATE;
        const n = noise();
        lp += 0.5 * (n - lp);
        const v = (n - lp) * Math.exp(-u / decay) * 0.07;
        add(e.t + u, v * 0.8, v * 1.2, 0.1);
      }
    }
  }
}
