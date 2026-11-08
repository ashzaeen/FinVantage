# apps/extension: Omnipresent Copilot

Chrome Manifest V3, bundled with esbuild. Read the root `AGENTS.md` first. Brief: `docs/workstreams/extension.md`.

## Flow

```
page -> content/detect.ts -> content/index.ts -> background.ts -> API
                                  |                  (only the service worker calls the API)
                                  v
                          content/overlay.ts (Shadow DOM card)
```

## Layout

| Path | Holds |
| --- | --- |
| `manifest.json` | Permissions and host list |
| `src/background.ts` | Service worker: API calls, snooze, dismiss, on/off state |
| `src/messages.ts` | Message types between content script and worker |
| `src/content/sites.ts` | **Site rules**: where to look for a price |
| `src/content/detect.ts` | Builds the `CopilotContext` |
| `src/content/price.ts` | USD parsing |
| `src/content/overlay.ts` | Badge and card |
| `src/content/index.ts` | Runs detection on load and again whenever the price element changes |
| `src/popup.ts`, `popup.html` | On/off toggle |
| `mock-pages/` | Demo pages. The demo runs on these: `index.html` (start page), `shop.html` and `product.html?id=` (store, catalog in `store.js`), `checkout.html?id=`, `rental.html`, `car-quote.html`, `card-payment.html`, plus edge cases |
| `scripts/build.mjs` | Build, watch, and the port 4100 demo server |

## Rules

- `extractContext` builds the only thing that leaves the browser. Read only the rule's price element.
- If the price is missing, unclear, or not USD, return null and show nothing. Never guess.
- Interface labels use Title Case, as in `apps/web/AGENTS.md`. The card's Impact, Trade-off and Smart Move text stays as sentences.
- Set card text with `textContent`, never `innerHTML`. Keep all styles inside the Shadow DOM.
- Never click, fill, or change anything on the host page.
- Keep the overlay keyboard-navigable with readable contrast.
- Keep `host_permissions` and `matches` to the listed domains. Add production URLs only when deployed.
- Everything baked into the bundle is public, so no real secrets.

## Working on it

```bash
npm run dev:api
npm run dev:ext
```

Load `apps/extension/dist` unpacked once from `chrome://extensions`. After a change, click the reload icon there and refresh the demo page. To check `manifest.json` changes, restart `dev:ext`, because it is copied only at startup.

The mock rental page has hostile CSS on purpose, to prove styles do not leak into the card. Mock pages also carry decoy prices, so a rule that grabs the wrong price shows up right away.

## Known gaps

- Live-site selectors are unwritten. Those domains are in the manifest but do nothing until `sites.ts` has a rule.
- On/off and snooze live in `chrome.storage`, and are not synced with `User.extensionSettings` in the API.
- The context carries no loan term, so the vehicle scenario assumes 60 months. See `docs/DECISIONS.md`.
