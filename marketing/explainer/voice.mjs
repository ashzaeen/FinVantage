/**
 * Makes one narration take per beat, as out/voice/NN.wav (48 kHz mono), ready for the mix.
 *
 * A recording in voice/human/NN.wav (or .mp3/.m4a) wins over the AI take for that beat: it is
 * cleaned up (rumble cut, light noise gate, silence trimmed) and levelled to the AI takes.
 * Otherwise the AI take comes from the engine in lines.json:
 *   "gemini": Google's Gemini TTS, on GEMINI_API_KEY from ../../.env.vercel.api (server-side only)
 *   "edge":   Microsoft's neural voice through edge-tts (pip install edge-tts), free
 * AI takes are cached in voice/ai/ and regenerated only when the line, voice or direction changes.
 *
 *   node voice.mjs                      every beat
 *   node voice.mjs --sample 01 A,B,C    beat 01 in Gemini voices A, B and C, to out/samples/
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const config = JSON.parse(readFileSync(here("./lines.json"), "utf8"));
const { beats } = config;
const engine = config.engine ?? "edge";
for (const d of ["./voice/ai/", "./voice/human/", "./out/voice/", "./out/samples/"]) mkdirSync(here(d), { recursive: true });

const run = (args) => execFileSync(ffmpeg, ["-y", "-loglevel", "error", ...args]);
// Same chain for every take, so AI and human lines sit at one level: trim silence at both ends,
// cut rumble, gate hiss lightly, then level to -16 LUFS.
const clean = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,highpass=f=80,agate=threshold=0.01:ratio=2:release=120,loudnorm=I=-16:TP=-1.5:LRA=7";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function geminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const env = readFileSync(here("../../.env.vercel.api"), "utf8");
  const key = env.match(/^GEMINI_API_KEY=(.*)$/m)?.[1]?.trim();
  if (!key) throw new Error("No GEMINI_API_KEY in .env.vercel.api.");
  return key;
}

/** One Gemini TTS take, written as a 24 kHz mono WAV. The key is sent in a header, never logged. */
async function gemini(text, voiceName, file) {
  const g = config.gemini ?? {};
  const body = {
    contents: [{ parts: [{ text: `${g.direction ?? "Narrate warmly and naturally:"}\n\n${text}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${g.model ?? "gemini-2.5-pro-preview-tts"}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": geminiKey() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const json = res.ok ? await res.json() : null;
    const data = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (data) {
      const pcm = Buffer.from(data, "base64");
      const h = Buffer.alloc(44);
      h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16);
      h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
      h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
      writeFileSync(file, Buffer.concat([h, pcm]));
      return;
    }
    if (attempt >= 5) throw new Error(`Gemini TTS failed (${res.status}): ${JSON.stringify(json ?? (await res.text().catch(() => ""))).slice(0, 200)}`);
    await pause(4000 * attempt);
  }
}

function edge(text, file) {
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync("python", ["-m", "edge_tts", "--voice", config.voice, `--rate=${config.rate ?? "+0%"}`, "--text", text, "--write-media", file], { stdio: "pipe" });
      return;
    } catch (error) {
      if (attempt >= 6) throw error;
      execFileSync("node", ["-e", `setTimeout(() => {}, ${3000 * attempt})`]);
    }
  }
}

if (process.argv[2] === "--sample") {
  const beat = beats.find((b) => b.id === process.argv[3]) ?? beats[0];
  for (const name of (process.argv[4] ?? "Charon,Algieba,Iapetus").split(",")) {
    const raw = here(`./out/samples/${beat.id}-${name}.raw.wav`);
    await gemini(beat.say ?? beat.text, name, raw);
    run(["-i", raw, "-af", clean, "-ar", "48000", "-ac", "1", here(`./out/samples/${beat.id}-${name}.wav`)]);
    console.log(`sample: out/samples/${beat.id}-${name}.wav`);
  }
  process.exit(0);
}

// Chapter mode: each chapter is read as one continuous take, so intonation flows across sentences,
// then split.py cuts it back into beats at the pauses before each beat's first words.
const chapters = engine === "gemini" ? config.chapters ?? [] : [];
if (chapters.length) {
  const g = config.gemini ?? {};
  let changed = false;
  for (const ch of chapters) {
    const text = ch.beats.map((id) => { const b = beats.find((x) => x.id === id); return b.say ?? b.text; }).join(" ");
    const file = here(`./voice/ai/chapter-${ch.id}.wav`), stamp = here(`./voice/ai/chapter-${ch.id}.txt`);
    const key = `gemini|${g.model}|${g.voice}|${g.direction}|${text}`;
    if (!existsSync(file) || !existsSync(stamp) || readFileSync(stamp, "utf8") !== key) {
      await gemini(text, g.voice ?? "Charon", file);
      writeFileSync(stamp, key);
      changed = true;
      console.log(`chapter ${ch.id}: generated`);
    }
  }
  const missing = chapters.some((ch) => ch.beats.some((id) => !existsSync(here(`./voice/ai/${id}.split.wav`))));
  if (changed || missing) execFileSync("python", [here("./split.py")], { stdio: "inherit" });
}
const inChapter = new Set(chapters.flatMap((ch) => ch.beats));

const used = [];
for (const beat of beats) {
  const human = ["wav", "mp3", "m4a"].map((ext) => here(`./voice/human/${beat.id}.${ext}`)).find(existsSync);
  const outWav = here(`./out/voice/${beat.id}.wav`);
  let source = human;
  if (!human && inChapter.has(beat.id)) {
    source = here(`./voice/ai/${beat.id}.split.wav`);
  } else if (!human) {
    const said = beat.say ?? beat.text;
    const g = config.gemini ?? {};
    const file = here(`./voice/ai/${beat.id}.${engine === "gemini" ? "wav" : "mp3"}`);
    const stamp = here(`./voice/ai/${beat.id}.txt`);
    const key = engine === "gemini" ? `gemini|${g.model}|${g.voice}|${g.direction}|${said}` : `edge|${config.voice}|${config.rate}|${said}`;
    if (!existsSync(file) || !existsSync(stamp) || readFileSync(stamp, "utf8") !== key) {
      if (engine === "gemini") await gemini(said, g.voice ?? "Charon", file);
      else edge(said, file);
      writeFileSync(stamp, key);
    }
    source = file;
  }
  // AI takes can be sped up a little (pitch kept) to fit the length; human takes never are.
  const tempo = !human && config.tempo && config.tempo !== 1 ? `atempo=${config.tempo},` : "";
  run(["-i", source, "-af", tempo + clean, "-ar", "48000", "-ac", "1", outWav]);
  used.push(`${beat.id} ${human ? "human" : engine}`);
}
console.log(`Voice takes ready: ${used.join(", ")}`);
