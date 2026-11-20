# Editing the FinVantage pitch video

This folder builds the MavPitch video (about 3:06, 1080p60) in three parts:

| Part | Length | Source | Built by |
| --- | --- | --- | --- |
| Trailer | 0:00–0:25 | `out/new trailer/FinVantage-trailer.mp4` (the team's edit, music only), from 3.0 s in | `assemble.mjs` |
| Founders, "Lights On" | 0:25–0:54 | `out/Our part/*`; the script is `out/Our part/FinVantage_Founders_Segment.pdf` | `assemble.mjs` |
| Explainer | 0:54–3:06 | `explainer.html` + `lines.json`, rendered to `out/finvantage-explainer.mp4` | `npm run render` |

The final files are `out/finvantage-full.mp4` and `out/finvantage-full.srt` (captions for the whole video).

## Setup (once)

```bash
cd marketing/explainer
npm install --ignore-scripts && node node_modules/ffmpeg-static/install.js
npx playwright install chromium   # browser.mjs also finds any complete Chromium Playwright left behind
```

The full pipeline encodes with NVENC (`h264_nvenc`), so it needs an NVIDIA GPU. Without one, change
`h264_nvenc` with `-preset p6 -rc vbr -cq 17` to `libx264 -preset medium -crf 18` in `assemble.mjs`
and `render.mjs`. It renders much slower.

## Common edits

| To change | Edit | Then run |
| --- | --- | --- |
| On-screen visuals, labels, animation, transitions in the explainer | `explainer.html` (scenes are drawn from time alone in `renderAt(t)`; `TRANS` sets the cut into each scene) | `node render.mjs`, then `node assemble.mjs` |
| A narration line | `lines.json` (`text` is captioned; optional `say` is spelled for the voice) | `npm run render`, then `node assemble.mjs`. This re-voices the changed chapter on the paid Gemini key, so read **Voice** first. |
| Founders segment timing, grade, name cards, split screen, captions | `assemble.mjs` (constants at the top: `TRAILER_CUT`, `FOUNDERS`; each founder's cut and lamp-click time; `SPLIT`; caption text near the end) | `node assemble.mjs` (about 2 minutes) |
| Where the trailer starts | `TRAILER_CUT` in `assemble.mjs` | `node assemble.mjs` |
| A quick look at every explainer beat | nothing | `node preview.mjs` writes `out/preview.png` |

Full explainer render: `node render.mjs` takes about 12–15 minutes at 60 fps. For a quick draft,
run `FPS=30 SUB=1 node render.mjs`, but don't ship a draft render.

## How the founders segment works (`assemble.mjs`)

Each founder speaks one line in a dark room, then clicks a lamp on. Before the click the shot is graded
cool and dark; after it, warm. A soft synthesized click is added on each lamp, because the mics barely
caught the real ones.
- **Aram:** `IMG_8063.mov`, 0–8.9 s, lamp click at 7.95 s.
- **Ash:** `PXL_20261120_001527545~3-1080p.mp4`, 0–10.1 s, lamp click at 9.1 s. It's a 1080p copy of a 4K phone clip; the 4K original isn't in git.
- **Yao:** `WIN_20261119_23_43_35_Pro.mp4`. The line (6.25–12.3 s) and the click (14.25–15.75 s) are joined by a 0.15 s cross-fade. The segment ends 0.4 s after the click with a flash to cream, deliberately before Yao smiles. Keep that cut.
- **Split screen (`SPLIT`, 3.2 s):** three Polaroids on cream paper. All three say "Here's how it works" together:
  - **Takes:** `IMG_8066 (1).mov` (Aram), `PXL_20261120_002221490.mp4` (Ash), and the second take in `WIN_20261119_23_45_23_Pro.mp4` from 4.3 s (Yao).
  - **Alignment:** `speechSpan()` finds each take's words from the loudness envelope, and each take is stretched (×0.77–1.3, picture and voice together) so all three start and end on the same frame.
  - **Don't seek to align these takes.** Don't use `-ss` before `-i`, and don't use `silencedetect` to find the words: seeking lands Yao's webcam audio off-time, and silencedetect picks up clicks and breaths. Both put the takes out of sync before.
  - **Replacing a take:** a file named `aram-how.*` or `yao-how.*` in `out/Our part/` replaces that founder's take automatically.
- The explainer opens on the same cream paper, in the quiet, so the cut from the split screen is a flash to cream.
- Name cards are drawn with Playwright in the explainer's paper style (Archivo and Inter on `#fffaf0`).

## Voice (paid; don't regenerate casually)

The narration is Gemini TTS (`gemini-2.5-pro-preview-tts`, voice Charon, `tempo` 1.12). Each chapter
in `lines.json` is read as one continuous take; `split.py` cuts it back into beats.
- **Cache:** the takes are cached in `voice/ai/`, which is committed, keyed by the exact text, voice and direction. `voice.mjs` only calls the API when one of those changes. Changing one word re-voices that whole chapter.
- **Key:** `GEMINI_API_KEY`, read from the environment or from `../../.env.vercel.api`. That file isn't in git; ask Yao for the key. Never print it or commit it.
- **Your own recording** of a beat goes in `voice/human/NN.wav` and wins over the AI take.

## Sync

- **Word timings:** the explainer's reveals are cued from real word times in `out/words.json`, which is committed. `python align.py` regenerates it with faster-whisper on the GPU after a line or take changes: `pip install faster-whisper nvidia-cublas-cu12 nvidia-cudnn-cu12`.
- **Cue matching:** `wordAt()` in `explainer.html` matches a phrase against those words, with digits spelled out through the `SPOKEN` map.
- **Sound effects:** `cues.mjs` turns the reveals into `out/cues.json`, and `audio.mjs` puts sound effects on them.

## House style (keep it)

- **Look:** Vox-style explainer on cream paper, with hand-drawn marks, real app screenshots (`out/captures/`) and paper wipes at chapter changes.
- **Titles and labels** are in Title Case; long explanatory sentences stay in sentence case.
- **Sound:** the final mix sits at −16 LUFS (`render.mjs` and `assemble.mjs` loudnorm to it), with true peak under −1 dBTP.
- **Product facts must match the live app** (demo profile "Maya"):
  - the Copilot card on a $1,999 MacBook Pro keeps the House down payment at risk, 55–83% → 34–71%;
  - the Advisor answers from the demo data.
  Don't invent numbers.
- **Who's presenting:** Aram, Ashzaeen and Yao. Samyog is not presenting; leave him out.

## Check your work before you hand it back

1. **Length and format:** `ffmpeg -i out/finvantage-full.mp4` shows about 3:06, 1920x1080, 60 fps.
2. **Loudness:** `ffmpeg -i out/finvantage-full.mp4 -af loudnorm=print_format=summary -f null -` shows about −16 LUFS.
3. **Look:** pull frames from every part you touched into a contact sheet, using `ffmpeg -ss T -i … -frames:v 1` and then `tile`. Look for overlaps, empty moments, text clipped off screen and flashes.
4. **Sync:** for audio sync, measure the loudness envelope of the rendered segment; Whisper's word times run about 0.3–0.4 s early.

## Files: what's in git and what isn't

- **Committed:**
  - the code
  - `voice/ai/` (cached Gemini takes)
  - `out/captures/` (app and Amazon screenshots)
  - `out/words.json`
  - `out/Our part/` (the founders' footage and script)
  - `out/new trailer/`
- **Not committed:** everything else in `out/`. Renders, `audio.wav`, scratch frames and `out/assemble/` are all rebuilt by the scripts.
- **Never delete or overwrite the footage** in `out/Our part/` or `out/new trailer/`. Write new versions under a new name.
- **The repo is public.** Don't commit keys, `.env*` files, or screenshots showing anyone's signed-in account.
