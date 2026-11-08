# Sprints: Platform workstream

Platform work (CI/CD, hosting, auth, data) in evenly sized slices of about 1 to 2 hours each. Each sprint has a checklist and a notes section. Other workstreams can add their own section below.

**Stack (decided 2026-11-07):**
- Vercel hosts the web app and the API. The API does the math, the simulator, and the Gemini calls.
- SpacetimeDB (Maincloud) holds relational data, handles auth (SpacetimeAuth), and pushes live updates. The dashboard subscribes through the TypeScript SDK, as the Spacetime team recommended.
- MongoDB Atlas holds documents.
- Tiger Data and Vultr are no longer used. See `docs/DECISIONS.md`.

**Done means:** `npm run check` passes locally and in CI, and the sprint's "Done when" item is checked against the real deployment.

**Out of scope:** production bank connections, real user financial data, and anything that moves money (PRD section 11).

---

## Sprint 1: CI on every PR and push

- [x] `.github/workflows/ci.yml`: runs `npm ci`, `npm run check`, and `npm run build` on pull requests and on pushes to `main`
- [x] Upload the built extension (`apps/extension/dist`) as a downloadable artifact
- [x] `.nvmrc` pins Node 22
- [ ] Done when: a PR shows a green check, and a deliberately broken type turns it red

Notes:
- `next build` doesn't need the API: every page is rendered on request, so CI runs without one.

## Sprint 2: Web and API live on Vercel (memory backend)

- [x] Add a Vercel entry for the Hono API in `apps/api`, keeping `src/server.ts` for local dev
- [x] Load the fixture with a static JSON import in `packages/data/src/profile.ts`, so it survives bundling
- [x] `WEB_ORIGIN` accepts a comma-separated list (production plus preview URLs)
- [x] `.github/workflows/deploy.yml`: deploys each changed app to Vercel with the CLI on pushes to `main`, then smoke-tests it
- [x] Two Vercel projects on the platform owner's account (`finvantage-api`, `finvantage-web`), with their env vars
- [x] First deploy of both from the laptop: https://finvantage-api.vercel.app and https://finvantage-web-ten.vercel.app
- [x] Ashzaeen adds the `VERCEL_TOKEN` repository secret
- [x] Extension: the build adds the API origin to `host_permissions`. CI builds against the `EXTENSION_API_URL` repository variable
- [ ] Done when: `/health` returns 200 publicly, and the deployed dashboard loads data from the deployed API

Notes:
- Went straight to an esbuild bundle in Vercel's Build Output format (`apps/api/scripts/build-vercel.mjs`), so Vercel never has to compile the workspace's raw `.ts` packages. The bundle was tested locally: health, accounts, Copilot, and CORS all work.
- The Vercel project setup steps are in `infra/README.md`.
- The repo owner is Ashzaeen, and the platform owner is a write collaborator who can't install the Vercel GitHub app. So deploys go through Actions plus the CLI, with one secret.
- CI is manual-only. It failed on Linux in the build step, and the logs weren't visible without signing in. Deprioritized for the hackathon.
- The first Vercel web build showed the likely cause: `apps/web` didn't declare `typescript` and `@types/node`, so `next build` failed when only the web workspace's deps were installed. Fixed by declaring them.
- Live updates (SSE) are unreliable on Vercel until Sprint 5. They work locally.

## Sprint 3: Auth (email + password)

- [x] Sign-up and sign-in page at `/login` (email + password). The sidebar card shows who is signed in, with Sign in and Sign out
- [x] API: `POST /auth/signup` and `POST /auth/login` issue RS256 tokens. The `/v1/*` middleware verifies them and maps `sub` to `userId`
- [x] Accounts live in Spacetime: a private `credential` table, with passwords hashed by scrypt
- [x] The first sign-in loads the demo profile for that user
- [x] The demo token stays as a fallback for signed-out visitors, the extension, and tests
- [ ] Done when: sign-up and sign-in work on the deployed site, a bad token gets a 401, and the API tests pass

Notes:
- **SpacetimeAuth was tried first and dropped.** It offers only magic link, anonymous, Steam, and social logins (its hosted login script only calls the magic-link endpoints), and the team wanted email + password. The SpacetimeAuth project in the dashboard is unused.
- **The API is the token issuer.** Tokens are signed with `AUTH_PRIVATE_JWK` (Vercel only, never committed), with issuer `https://finvantage-api.vercel.app`, audience `finvantage`, and a 7-day lifetime. The public key is published at `/.well-known/jwks.json`, with OpenID discovery at `/.well-known/openid-configuration`, so SpacetimeDB can accept the same tokens for Sprint 5 subscriptions.
- **Credential store.** `SpacetimeCredentialStore` (`apps/api/src/credentials.ts`) writes through the admin-only `register_credential` reducer and reads with owner SQL. Locally, without `SPACETIME_TOKEN`, a memory store is used instead.
- **Failure messages.** A wrong password and an unknown email return the same 401 and take about the same time.
- **Web.** The token goes in the `fv_token` cookie (not httpOnly), so server components read it with `next/headers` and the browser reads `document.cookie`. `api` picks the token per request, so no page changed. An expired token falls back to the demo token.
- **Each signed-in user gets a copy of the demo profile,** with IDs prefixed `<userId>__` (`demoProfileFor` in `packages/data`). While the ledger is in memory, each Vercel instance makes that copy on the user's first request to it. Sprint 6 moves it into Spacetime.
- **Not done:** password reset, email verification, and rate limiting on login. All out of scope for the hackathon.

## Sprint 4: Spacetime module and publish pipeline

- [x] `apps/spacetime/`: a TypeScript module with tables `app_user`, `user_identity`, `income_profile`, `account`, `ledger_transaction`, `goal`, `live_event`, and `admin`
- [x] Reducers: `save_user`, `save_income_profile`, `replace_accounts`, `add_transaction`, `create_goal`, `load_profile`, `publish_live_event`, `link_identity`, `add_admin`. Only admins can write
- [x] Published from the platform owner's laptop: `npm run publish:maincloud -w @finvantage/spacetime`. Never use `--delete-data` without warning the team
- [x] `SPACETIME_TOKEN`, `SPACETIME_URL`, and `SPACETIME_MODULE` set on the Vercel API project, without displaying the token
- [ ] Generated TS bindings committed in `apps/web/src/spacetime/`. Moved to Sprint 5
- [x] Done when: `spacetime sql` against Maincloud returns seeded rows

Notes:
- Database `finvantage` on Maincloud. Dashboard: https://spacetimedb.com/finvantage. How-to: `apps/spacetime/README.md`.
- `user` and `transaction` are SQL keywords, so the tables are `app_user` and `ledger_transaction`.
- The demo profile loads with `npm run seed:maincloud -w @finvantage/spacetime`, which calls `load_profile` with the fixture. The API's `loadDemoProfile` will call the same reducer in Sprint 6.
- Checked: an anonymous reducer call gets "Only the API can write", and anonymous SQL can't see the private tables.
- The HTTP wire format uses snake_case field names. Sprint 6's HTTP client must convert.
- The bindings wait for Sprint 5. They import `spacetimedb`, which `apps/web` doesn't depend on yet, so committing them now would break the web build. They also need the per-user views that Sprint 5 adds.
- `spacetime login show --token` prints a sentence, not a bare token. Extract the token before piping it anywhere.

## Sprint 5: Live subscriptions with the TS SDK

- [ ] `SpacetimeBus.publish` calls `publish_live_event` over HTTP, fire-and-forget. Production sets `LIVE_TRANSPORT=spacetime`
- [ ] Each signed-in user sees only their own `live_event` rows
- [ ] `useLiveEvents` keeps its signature. It subscribes through the `spacetimedb` SDK and validates each payload with `LiveEvent`. When signed out, or locally, it falls back to SSE
- [ ] Subscriptions only trigger a refetch through `api`. Figures always come from the API
- [ ] Update `apps/web/AGENTS.md` and `docs/DECISIONS.md` for the new web imports (heads-up to Ashzaeen)
- [ ] Done when: the demo checkout updates the deployed Copilot feed live in two tabs, and not for a second user

Notes:

## Sprint 6: SpacetimeLedgerStore and live data

- [ ] `packages/data/src/spacetime/`: an HTTP client (SQL and reducer calls) with SATS-JSON decoding, plus `SpacetimeLedgerStore`
- [ ] Shared store contract tests in `packages/data/src/stores.test.ts`. They always run against the memory store, and against Spacetime when `SPACETIME_TEST_URL` is set
- [ ] Replace `DATA_BACKEND` with `LEDGER_BACKEND` and `DOCS_BACKEND`, and remove `src/tiger/`
- [ ] Production sets `LEDGER_BACKEND=spacetime`
- [ ] The web app subscribes to `account` and `transaction`, and refetches when they change
- [ ] Done when: the contract tests pass on both backends, and `spacetime call ... add_transaction` updates an open dashboard live

Notes:

## Sprint 7: MongoDB wiring (handoff to the quarterly-agent teammate)

- [ ] `mongodb` driver, a cached client, and `ensureIndexes()` for the five collections
- [ ] `MongoDocumentStore` methods throw `NotImplementedError`, tagged `STUB(advisory)`
- [ ] `/health` reports `mongo: "ok" | "unconfigured" | "error"`
- [ ] Set `MONGODB_URI` in Vercel, and allow `0.0.0.0/0` in Atlas network access
- [ ] Production keeps `DOCS_BACKEND=memory` until the Mongo contract tests pass
- [ ] Done when: production `/health` shows `mongo: "ok"`

Notes:
