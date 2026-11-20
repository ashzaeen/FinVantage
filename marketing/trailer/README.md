# FinVantage pitch trailer

A 30-second, 1080p trailer for funding pitches. It shows the intelligence on top of the plain
dashboard: Copilot stepping in at checkout, the 5,000-path simulation, the AI Advisor, the
quarterly report, and the guardrail that checks every number.

```bash
cd marketing/trailer
npm install        # once: Playwright, a headless Chromium (about 150 MB) and ffmpeg
npm run render     # writes out/finvantage-trailer.mp4 (takes a few minutes)
```

Open `trailer.html` in a browser to watch it play live while you edit (no sound there).

## How it works

- `trailer.html` draws every frame from the time alone (`renderAt(seconds)`), so the render never drops a frame.
- `render.mjs` steps through all 900 frames in headless Chromium and pipes them into ffmpeg.
- `audio.mjs` synthesizes the sound (booms, hits, risers, whooshes, a low drone) from the `CUES` list in `trailer.html`, so picture and sound share one timeline.

## Editing

- **Words:** edit the text in `trailer.html`. Each scene is a `<div class="layer">`, commented 1 to 6.
- **Timing:** each scene's fade-in and fade-out times are in `renderAt`. If you move a moment, move its sound in `CUES` too, then re-render.
- **Claims:** keep them true to the product: 5,000 simulated paths and about 0.6 s per Copilot check (`packages/simulator`, `docs/workstreams/copilot-status.md`), and the guardrail that rejects invented numbers (`packages/llm/src/guardrails.ts`).
