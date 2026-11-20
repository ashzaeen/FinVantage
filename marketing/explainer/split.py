"""
Cuts each chapter-long narration take (voice/ai/chapter-X.wav) back into one file per beat
(voice/ai/NN.split.wav), at the pause before each beat's first words, found with faster-whisper.

Reading a whole chapter in one take keeps the narrator's intonation flowing from sentence to
sentence; splitting it again keeps the per-beat timeline, captions and word cues working.
  python split.py
"""
import json
import subprocess
import sys
from difflib import SequenceMatcher
from pathlib import Path

from align import FFMPEG, audio, load_model, norm

HERE = Path(__file__).resolve().parent


def base(t: str) -> str:
    # "dashboard's" and "dashboard" are the same word here (narrators contract "is" freely).
    return t.split("'")[0]


NUMBER_WORDS = ("one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "teen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million", "point", "third")


def is_number(t: str) -> bool:
    return any(c.isdigit() for c in t) or t in NUMBER_WORDS or any(t.startswith(w) and len(t) <= len(w) + 4 for w in NUMBER_WORDS[:10])


def first_words(text: str, n: int = 3) -> list[str]:
    return [base(t) for t in norm(text) if not is_number(t)][:n]


def main():
    config = json.loads((HERE / "lines.json").read_text(encoding="utf8"))
    beats = {b["id"]: b for b in config["beats"]}
    model = load_model()
    for chapter in config.get("chapters", []):
        wav = HERE / "voice" / "ai" / f"chapter-{chapter['id']}.wav"
        if not wav.exists():
            sys.exit(f"Missing {wav}; run voice.mjs first.")
        segments, _ = model.transcribe(audio(wav), word_timestamps=True, language="en", beam_size=5)
        words = [w for seg in segments for w in (seg.words or [])]
        tokens = [base(" ".join(norm(w.word))) for w in words]
        starts, cursor = [], 0
        for k, beat_id in enumerate(chapter["beats"]):
            if k == 0:
                starts.append(0)
                continue
            want = first_words(beats[beat_id].get("say", beats[beat_id]["text"]))
            best, best_i = 0.0, None
            for i in range(cursor + 1, len(tokens)):
                window = [t for t in tokens[i:i + len(want) + 3] if t and not is_number(t)][:len(want)]
                # A window that starts on the beat's first word beats one that merely overlaps it.
                score = SequenceMatcher(None, window, want).ratio() + (0.5 if window[:1] == want[:1] else 0)
                if score > best:
                    best, best_i = score, i
                if score >= 1.5:
                    break
            if best_i is None or best < 0.6 + 0.5:
                sys.exit(f"Couldn't find the start of beat {beat_id} in chapter {chapter['id']} (best {best:.2f}).")
            starts.append(best_i)
            cursor = best_i
        total = len(audio(wav)) / 16000
        for k, beat_id in enumerate(chapter["beats"]):
            i = starts[k]
            # Cut just before each beat's first word: Whisper's word end times run early, so a cut in
            # the middle of the pause can clip the end of the previous beat's last word.
            begin = 0.0 if k == 0 else max(words[i - 1].end, words[i].start - 0.06)
            if k + 1 < len(starts):
                j = starts[k + 1]
                end = max(words[j - 1].end, words[j].start - 0.06)
            else:
                end = total
            out = HERE / "voice" / "ai" / f"{beat_id}.split.wav"
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(wav), "-ss", f"{begin:.3f}", "-to", f"{end:.3f}", str(out)], check=True)
        print(f"chapter {chapter['id']}: split into {', '.join(chapter['beats'])}")


if __name__ == "__main__":
    main()
