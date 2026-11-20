"""
Word timings for every narration take, so on-screen reveals land on the spoken word.

Runs faster-whisper (GPU if available, else CPU) on out/voice/NN.wav and writes out/words.json:
  { "01": [{"w": "most", "s": 0.12, "e": 0.40}, ...], ... }   times in seconds from the take's start.
It also compares each transcript with the line in lines.json and reports takes that dropped or
added words (TTS does this occasionally), so they can be regenerated.

  python align.py            (pip install faster-whisper nvidia-cublas-cu12 nvidia-cudnn-cu12)
"""
import json
import os
import re
import site
import sys
from difflib import SequenceMatcher
from pathlib import Path

HERE = Path(__file__).resolve().parent

# The CUDA wheels put their DLLs under site-packages/nvidia/*/bin; make them findable on Windows.
for base in [*site.getsitepackages(), site.getusersitepackages()]:
    for sub in ("cublas", "cudnn", "cuda_runtime"):
        d = Path(base) / "nvidia" / sub / "bin"
        if d.is_dir():
            os.add_dll_directory(str(d)) if hasattr(os, "add_dll_directory") else None
            os.environ["PATH"] = str(d) + os.pathsep + os.environ.get("PATH", "")

import subprocess  # noqa: E402

import numpy as np  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402

FFMPEG = str(HERE / "node_modules" / "ffmpeg-static" / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg"))


def audio(path) -> "np.ndarray":
    """16 kHz mono float samples, decoded with ffmpeg (faster-whisper's own decoder needs a PyAV
    version that may not match the installed one)."""
    raw = subprocess.run([FFMPEG, "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def norm(text: str) -> list[str]:
    return re.sub(r"[^a-z0-9' ]+", " ", text.lower().replace("-", " ")).split()


def load_model():
    for device, compute in (("cuda", "float16"), ("cpu", "int8")):
        try:
            model = WhisperModel("small.en", device=device, compute_type=compute)
            # A tiny warm-up proves the device really works (missing DLLs fail here, not at load).
            list(model.transcribe(np.zeros(16000, dtype=np.float32), word_timestamps=False)[0])
            print(f"Aligning on {device}")
            return model
        except Exception as error:  # noqa: BLE001
            print(f"{device} unavailable ({str(error)[:80]}), trying the next option")
    sys.exit("No device could run Whisper.")


def main():
    lines = json.loads((HERE / "lines.json").read_text(encoding="utf8"))
    model = load_model()
    words, problems = {}, []
    for beat in lines["beats"]:
        wav = HERE / "out" / "voice" / f"{beat['id']}.wav"
        segments, _ = model.transcribe(audio(wav), word_timestamps=True, language="en", beam_size=5,
                                       initial_prompt="FinVantage, Copilot, Maya, MacBook, Monarch, Rocket Money, Projection Lab, Boldin, UTA")
        out = []
        for seg in segments:
            for w in seg.words or []:
                out.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)})
        words[beat["id"]] = out
        # Whisper writes numbers as digits, so compare the words only.
        heard = [t for t in norm(" ".join(w["w"] for w in out)) if not t.isdigit()]
        said = [t for t in norm(beat.get("say", beat["text"]).replace("U.T.A.", "UTA")) if not any(n in t for n in ("one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "teen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million", "point", "third"))]
        ratio = SequenceMatcher(None, heard, said).ratio()
        if ratio < 0.85:
            problems.append(f"{beat['id']} ({ratio:.2f}): heard \"{' '.join(heard)}\"")
    (HERE / "out" / "words.json").write_text(json.dumps(words, indent=1), encoding="utf8")
    print(f"Wrote out/words.json for {len(words)} takes.")
    if problems:
        print("Takes that may not match their line (regenerate these):")
        for p in problems:
            print("  " + p)


if __name__ == "__main__":
    main()
