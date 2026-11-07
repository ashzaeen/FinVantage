# Infrastructure

| Piece | Where | Deploys |
| --- | --- | --- |
| Web app | Vercel project, root directory `apps/web` | On every push to `main`. A preview for each PR |
| API | Vercel project, root directory `apps/api` | Same as the web app |
| Relational data, auth, live updates | SpacetimeDB Maincloud | Planned. See `SPRINTS.md`, Sprints 3 to 6 |
| Documents | MongoDB Atlas | Planned. See `SPRINTS.md`, Sprint 7 |
| CI | GitHub Actions, `.github/workflows/ci.yml` | Typecheck, test, and build on every PR and push |
| Smoke test | GitHub Actions, `.github/workflows/smoke.yml` | After each successful production deploy, checks the API's `/health` and the web app's `/` |
| LLM | Gemini API | Server-side key only |

Tiger Data and Vultr are no longer used. See `docs/DECISIONS.md`.

## How the API runs on Vercel

`npm run build` in `apps/api` runs `scripts/build-vercel.mjs`. It bundles `src/vercel.ts` and every workspace package into one Node function, written to `.vercel/output` (the [Build Output API](https://vercel.com/docs/build-output-api/v3)). Vercel serves that directory as-is, and every route goes to the one function. Local dev still uses `src/server.ts`.

To check a bundle locally: run `npm run build -w @finvantage/api`, then serve the default export of `apps/api/.vercel/output/functions/index.func/index.mjs` with `node:http`'s `createServer`.

## Skipped builds

Each project's `vercel.json` has an `ignoreCommand`, so Vercel skips a build when a commit doesn't touch that app:

- The web project rebuilds on changes to `apps/web`, `packages/contracts`, or the root `package.json`, lockfile, and `tsconfig.base.json`.
- The API project rebuilds on changes to `apps/api`, any of `packages/`, or those same root files.

Docs-only and extension-only commits deploy nothing. A skipped build shows as **Canceled** in Vercel, and that is expected.

## First-time setup

Do this once. After that, every push deploys by itself.

### 1. API project

1. On vercel.com, choose **Add New > Project** and import `ashzaeen/FinVantage`.
2. Set **Root Directory** to `apps/api`. Leave **Framework Preset** as **Other**, because `apps/api/vercel.json` sets the build.
3. Name it `finvantage-api`.
4. Add these environment variables, for Production and Preview:

   | Name | Value |
   | --- | --- |
   | `WEB_ORIGIN` | `https://finvantage-web.vercel.app,https://finvantage-web-*.vercel.app` |
   | `DEMO_API_TOKEN` | `demo-token` |

5. Deploy, then open `https://finvantage-api.vercel.app/health`. It should show `{"ok":true,...}`.

### 2. Web project

1. Import the same repository again, with **Root Directory** `apps/web`. Vercel detects Next.js.
2. Name it `finvantage-web`.
3. Add these environment variables:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_API_URL` | `https://finvantage-api.vercel.app` |
   | `NEXT_PUBLIC_DEMO_TOKEN` | `demo-token` |

4. Deploy, then open the site. The Overview page should show the demo profile.

If Vercel gives either project a different domain, use the real domains in `WEB_ORIGIN` and `NEXT_PUBLIC_API_URL`. A `*` in `WEB_ORIGIN` matches one subdomain label, which covers preview URLs.

### 3. Extension built against the deployed API

In GitHub, go to **Settings > Secrets and variables > Actions > Variables** and add these repository variables:

| Name | Value |
| --- | --- |
| `EXTENSION_API_URL` | `https://finvantage-api.vercel.app` |
| `EXTENSION_WEB_URL` | `https://finvantage-web.vercel.app` |

Each CI run then uploads a `finvantage-extension` artifact built against production. The build adds the API origin to `host_permissions` automatically. Download it, unzip it, and load it unpacked in `chrome://extensions`.

### If a deploy doesn't happen or fails

- **The first deploy shows "Canceled by Ignored Build Step":** the newest commit didn't touch that app. Open the deployment and choose **Redeploy**.
- **API install fails, or workspace packages are missing:** set the API project's **Install Command** to `cd ../.. && npm ci`.
- **API module or bundling errors:** run `npm run build -w @finvantage/api` locally. It is the same build.

## Known limits on Vercel

- **Memory stores reset.** Data lives in each function instance until the Spacetime and Mongo stores land, so saved data can vanish or differ between requests. This is fine for the demo profile.
- **Live updates through SSE are unreliable.** A Copilot event published on one function instance never reaches a dashboard connected to another. Sprint 5 moves live updates to Spacetime subscriptions. Locally, SSE works.
- **SSE streams end** when they reach the function's maximum duration. The browser's `EventSource` reconnects by itself.

## Reminder

Synthetic or sandbox data only. Real accounts bring compliance work that is out of scope (PRD section 11).

The demo token is baked into the web app and the extension, so it is public. It only ever protects demo data.
