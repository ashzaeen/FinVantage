# FinVantage MavPitch explainer

**Full pitch video:** `node assemble.mjs` stitches the team's trailer, the founders' "Lights On" segment and this explainer into `out/finvantage-full.mp4` (about 3:06). How to edit any part, and the rules to keep, are in [CLAUDE.md](CLAUDE.md).

The 2-minute, Vox-style investor explainer: a rewrite of the explainer segment of
`../trailer/script_v4.md` in the style of Vox's "Your money, explained" (a hook, one person,
Maya, through the product, then v4's business beats and numbers), 15 beats. Narration is an AI voice for now; any line can be replaced
with a real recording and the video re-times itself.

```bash
cd marketing/explainer
npm install --ignore-scripts && node node_modules/ffmpeg-static/install.js   # once
python -m pip install --user edge-tts                                         # once, for the AI voice
python -m pip install --user faster-whisper nvidia-cublas-cu12 nvidia-cudnn-cu12   # once, for word sync
npm run all      # voice, word sync, timeline, app captures, sound, render -> out/finvantage-explainer.mp4
npm run render   # the same without re-capturing the app (use after changing lines or recordings)
node preview.mjs # one frame per beat in out/preview.png, to check the look quickly
```

Outputs: `out/finvantage-explainer.mp4` (1080p30), `out/finvantage-explainer.srt` (captions).
Encoding uses an NVIDIA GPU (NVENC) when available.

## Swapping in your own voice

1. Record each line in `lines.json` as its own file, named by its beat id: `voice/human/01.wav`, `02.wav`, ... (`.mp3` and `.m4a` work too). Any you skip stay AI.
2. Record in a quiet room, phone close, one clean take per file. A second of silence at either end is fine: it's trimmed.
3. Run `npm run render`. Each recording is cleaned (rumble cut, light noise gate, silence trimmed), levelled to match the others, and its beat stretches if the take runs longer than the script's slot.

Keep the lines word for word if you can: the on-screen reveals are timed to where words fall in each line.

## What's in each file

| File | Does |
| --- | --- |
| `lines.json` | The 15 narration lines, the AI voice and its speed |
| `voice.mjs` | Makes `out/voice/NN.wav` per beat: your recording, or the AI voice (edge-tts) |
| `timeline.mjs` | Beat lengths from the takes, written to `out/timeline.json`, plus the captions |
| `capture.mjs` | Stills of the live app (Overview, Accounts, Goals, an Advisor answer) as a demo guest |
| `explainer.html` | Every scene, drawn from time alone; open it in a browser to watch it silently |
| `audio.mjs` | Voice on the timeline, a music bed that ducks under it, paper swishes |
| `render.mjs` | Frames from 4 pages at once into ffmpeg, sound levelled to -16 LUFS |

## Where the script changed to match the real app

v4 asks for the real card text, range and Advisor answer. With the demo profile:
- The Copilot card for the $3,299 laptop moves the **House down payment** from "at risk" to "unlikely" (55–83% to 15–47%), and its smarter move is paying off the 22.99% card first, so beat 02 says that instead of "Japan trip" and "waiting or something cheaper".
- The demo data has no Amazon purchases in October, so the Advisor shot shows "How much did I spend on groceries in October?" (real answer: $473.57, four trips to Green Grocer).
- The end card lists Ashzaeen, Aram and Yao (Samyog isn't presenting), and the ask no longer shows a co-founder split.

## Voice, sync and the Amazon shot

- **Voice:** `lines.json` sets `"engine": "gemini"` (Google Gemini TTS on the paid key in `../../.env.vercel.api`, voice `Charon`, a short delivery direction, and `tempo` 1.08 to fit 2:00). `"engine": "edge"` switches back to the free Microsoft voice. Try other Gemini voices with `node voice.mjs --sample 01 Charon,Algieba,Puck`.
- **Sync:** `python align.py` times every spoken word with faster-whisper (GPU), into `out/words.json`. Each reveal is cued from the real word, so recorded human lines stay in sync too. It also lists any take whose words don't match its line.
- **Amazon:** `node capture-amazon.mjs <amazon product URL>` drives a real Chrome window (Amazon blocks automated browsers). Build the extension for the live API first: `EXTENSION_API_URL=https://finvantage-api.vercel.app EXTENSION_WEB_URL=https://finvantage-web-ten.vercel.app npm run build -w @finvantage/extension`, then load `apps/extension/dist` in that window (chrome://extensions, Developer mode, Load unpacked). The script opens the dashboard first so the extension uses a guest demo session, then saves the page, the card and the card's text.

## Flow

- **Narration in chapters:** `lines.json` groups beats into four `chapters`. Each chapter is read as one continuous Gemini take (so the intonation flows), and `split.py` cuts it back into beats just before each beat's first words.
- **Transitions:** `TRANS` in `explainer.html` sets how the video cuts into each scene: camera pans, a paper wipe at the three chapter changes, and three carries (Maya's price tag into the Amazon page, the card's odds onto the House jar, the positioning map sliding into the next scene). Each chapter change gets 0.45 s of extra room.
- **Sound design:** `cues.mjs` records when every card, stamp and hand-drawn mark appears, into `out/cues.json`. `audio.mjs` puts a paper tick, a thump or a pencil scratch on each, a swish on each cut, and a music hit at each chapter.
- **60 fps with motion blur:** `render.mjs` captures two sub-frames per output frame and blends them (`FPS`, `SUB` and `WORKERS` can be set as environment variables). Expect about 12 to 15 minutes; `FPS=30 SUB=1` renders a quick 3-minute draft.
