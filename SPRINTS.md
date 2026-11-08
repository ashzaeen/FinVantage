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
- [ ] Done when: a PR shows a green check, and a deliberately broken type turns it red. Dropped: CI is manual-only for the hackathon

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
- [x] Done when: `/health` returns 200 publicly, and the deployed dashboard loads data from the deployed API

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
- [x] Done when: sign-up and sign-in work on the deployed site, a bad token gets a 401, and the API tests pass

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
- [x] Generated TS bindings committed in `apps/web/src/spacetime/` (done in Sprint 5)
- [x] Done when: `spacetime sql` against Maincloud returns seeded rows

Notes:
- Database `finvantage` on Maincloud. Dashboard: https://spacetimedb.com/finvantage. How-to: `apps/spacetime/README.md`.
- `user` and `transaction` are SQL keywords, so the tables are `app_user` and `ledger_transaction`.
- The demo profile loads with `npm run seed:maincloud -w @finvantage/spacetime`, which calls `load_profile` with the fixture. The API's `loadDemoProfile` will call the same reducer in Sprint 6.
- Checked: an anonymous reducer call gets "Only the API can write", and anonymous SQL can't see the private tables.
- The HTTP wire format uses snake_case field names. Sprint 6's HTTP client must convert.
- The bindings wait for Sprint 5. They import `spacetimedb`, which `apps/web` doesn't depend on yet, so committing them now would break the web build. They also need the per-user views that Sprint 5 adds.
- `spacetime login show --token` prints a sentence, not a bare token. Extract the token before piping it anywhere.

## Sprint 4b: Plaid-shaped schema (done 2026-11-07)

- [x] Plaid's objects as Zod schemas (`packages/data/src/plaid/schema.ts`), and one mapper to the app's types (`map.ts`)
- [x] The demo fixture's bank data rewritten in Plaid's exact format, mapping back to the same accounts and transactions, value for value
- [x] `Account` and `Transaction` gain Plaid fields, all optional or defaulted: subtype, mask, available balance, credit limit, due date, pending, detailed category, channel, logo
- [x] Spacetime tables mirror Plaid (`bank_item`, `bank_account`, `bank_transaction`, `liability`, `recurring_stream`, `security`, `holding`), plus `account_detail`, `budget`, and `balance_snapshot` for the PRD. Reducers follow Plaid's endpoints
- [x] Republished without losing sign-ins, and seeded
- [x] Live Plaid Sandbox (Link, token exchange, sync). Done 2026-11-08, see Sprint 8

Notes:
- The full model, and where each PRD feature reads from, is in `docs/DATA-MODEL.md`.
- The old `account` and `ledger_transaction` tables were emptied by a temporary reducer and then removed, because Spacetime refuses to drop tables with rows. `--delete-data` would have wiped `credential` too.
- The budgets, net-worth history, recurring, bills, and portfolio routes still use built-in estimates. The data to replace them now exists. Switching needs Sprint 6 and the transactions owner.

## Sprint 5: Live subscriptions with the TS SDK (live 2026-11-08)

- [x] `SpacetimeBus.publish` calls `publish_live_event` over HTTP in the background. The API waits for it (`live.flush()`) before each response returns. It still fans out in process for the SSE fallback
- [x] Production sets `LIVE_TRANSPORT=spacetime`
- [x] Each signed-in user sees only their own `live_event` rows: the `my_live_event` view, keyed by the identity that `onConnect` links to the token's `sub`
- [x] `useLiveEvents` keeps its signature. It subscribes through the `spacetimedb` SDK and validates each payload with `LiveEvent`. When signed out, or locally, it falls back to SSE
- [x] Subscriptions only trigger a refetch through `api`. Figures always come from the API
- [x] Update `apps/web/AGENTS.md` and `docs/DECISIONS.md` for the new web imports (heads-up to Ashzaeen)
- [x] Done when: the demo checkout updates the deployed Copilot feed live in two tabs, and not for a second user. Verified on production with two SDK subscribers as different users: each got only its own Copilot event, about 3 s after a cold request

Notes:
- No SpacetimeAuth: the browser connects with the FinVantage sign-in token itself. SpacetimeDB checks its signature against `https://finvantage-api.vercel.app/.well-known/jwks.json`, then `onConnect` links the identity to the token's `sub`, but only when the issuer is in `trusted_issuer`.
- Verified against a local Spacetime server (`spacetime start --listen-addr 127.0.0.1:3100 --in-memory`). The API on `LIVE_TRANSPORT=spacetime` published a Copilot event, and the signed-in subscriber got it in about 1 second; another user's event didn't reach them. A token signed by the wrong key gets `401 InvalidSignature`.
- SpacetimeDB caches an issuer's keys and doesn't refetch for an unknown key id. Rotating `AUTH_PRIVATE_JWK` therefore breaks live updates (browsers fall back to SSE) until that cache expires. Key ids are now the key's thumbprint.
- Bindings: `npm run generate -w @finvantage/spacetime` writes `apps/web/src/spacetime/`. Rerun it after changing a public view or reducer.

Went live with these steps:
1. `npm run publish:maincloud -w @finvantage/spacetime`
2. Trust the API's issuer once: `spacetime call finvantage trust_issuer '"https://finvantage-api.vercel.app"' --server maincloud`
3. Vercel API: `LIVE_TRANSPORT=spacetime`. Vercel web: `NEXT_PUBLIC_SPACETIME_URL=wss://maincloud.spacetimedb.com`, `NEXT_PUBLIC_SPACETIME_MODULE=finvantage`
4. Push. Then sign in in two tabs, run a Copilot check, and see the feed update in both

Notes:

## Sprint 6: SpacetimeLedgerStore and live data (done 2026-11-08, except the web subscription)

- [x] `packages/data/src/spacetime/`: an HTTP client (SQL and reducer calls) with SATS-JSON decoding, plus `SpacetimeLedgerStore`
- [x] Shared store contract tests in `packages/data/src/stores.test.ts`. They always run against the memory store, and against Spacetime when `SPACETIME_TEST_TOKEN` is set
- [x] `LEDGER_BACKEND` and `DOCUMENT_BACKEND` switches exist (added with the Mongo store)
- [x] Remove `DATA_BACKEND` and `src/tiger/`
- [x] Production sets `LEDGER_BACKEND=spacetime`
- [x] Reads map the Plaid-shaped bank tables through `mapItemSnapshot`. Writes go through reducers
- [ ] Store methods for budgets, balance snapshots, and recurring streams, so those routes can stop estimating
- [ ] The web app subscribes to `bank_account` and `bank_transaction`, and refetches when they change
- [x] Done when: the contract tests pass on both backends (the live-dashboard part moves to Sprint 5)

Notes:
- The user's own data sits next to the bank tables: `app_account` (hand-entered accounts) and `app_transaction` (hand-entered transactions, or an edit of a bank transaction under the same id, which wins).
- Editing a bank-linked account only changes its terms (`account_detail`). The bank owns its name, type, and balances. A rate the user enters beats the bank's.
- `goal.status` was added as an appended option column. `delete_user_data` removes everything but the sign-in, and the tests use it to clean up.
- The contract tests include an exact match between a demo profile loaded through Spacetime and one in memory.
- The auth middleware remembers per instance which users already have a profile, so most requests skip that lookup.
- The signed-out demo user (`user_demo`) is now shared and persistent, so anyone's edits stick for everyone. `POST /v1/profile/load-demo` resets it.

Notes:

## Sprint 8: Plaid (Sandbox)

- [x] `PlaidClient` over fetch (`packages/data/src/plaid/client.ts`): link token, public token exchange, `/item/get`, `/accounts/get`, `/transactions/sync` (all pages, from the saved cursor), `/liabilities/get`, `/transactions/recurring/get`, `/investments/holdings/get`, `/item/remove`. Products an item lacks come back empty instead of failing
- [x] `BankDataProvider`: Plaid when `PLAID_CLIENT_ID` and `PLAID_SECRET` are set, otherwise a synthetic stand-in that returns the demo bank through the same flow
- [x] Access tokens encrypted with AES-256-GCM (`PLAID_TOKEN_KEY`, the item id as associated data) in the private `bank_item_secret` table. Never in a response
- [x] Ledger stores gain `listBankItems`, `applyBankUpdate` (one atomic `apply_bank_update` reducer in Spacetime), and `removeBankItem`. Covered by the shared contract tests on both backends
- [x] Routes: link token, exchange, sandbox link, list, sync, and remove. The shared demo user gets a 403, and other users' items return 404
- [x] Web: a "Linked banks" panel on Accounts, with Connect (Plaid Link from Plaid's CDN), Refresh, and Disconnect
- [ ] Production Plaid: needs Plaid's production approval, plus OAuth redirect URIs for OAuth banks

Notes:
- Checked against real Sandbox data (First Platypus Bank): all 14 accounts map, with card, mortgage, and student-loan terms and 13 holdings. Sandbox returns no transactions for the first few seconds, so the panel syncs again at 8 and 23 seconds.
- Sandbox login in Plaid Link: `user_good` / `pass_good`.
- The demo profile's built-in banks have status `demo` and are left out of the linked list.
- Plaid omits `iso_currency_code` in places, so it is optional in every schema. APR type and security type are plain strings, so a new Plaid value can't break a sync.

## Sprint 9: Reports on the user's bank data (done 2026-11-08)

Once a user links a bank, the linked bank replaces their demo copy everywhere (`preferLinkedBanks`, built by the Copilot owner). This sprint makes quarterly reports follow it. Without a linked bank, reports run on the demo copy as before.

- [x] `visuals.dataSource` is `"bank"` or `"demo"`. The web report and the PDF say which: "Based on your linked bank accounts", or "Based on sample data", with a link to Accounts
- [x] On bank data, the monthly breakdown, the spending trend, and the summary's income, spending and savings come from the quarter's transactions (`apps/api/src/reporting/cashflow.ts`). Transfers between the user's own accounts don't count as income or spending
- [x] Simulation runs saved before the bank was linked describe the demo copy, so reports skip them
- [x] A quarter with no saved simulation no longer fails with 409. The report uses the newest saved run, or runs one now, and shows "Goal outlook as of <date>" (`visuals.outlookAsOf`). The previous quarter needs its own run, so a first bank report has no comparison
- [x] Simulations for a linked user take monthly income, spending and savings from the last three months of bank transactions, counting only months with both income and spending. The profile's figures remain the fallback when there is no such month (the synthetic bank has none). The Copilot keeps the profile's figures for now
- [x] Tests: a linked user's report with no saved runs; demo-era runs skipped after linking; cash-flow math

Notes:
- Net worth for a past quarter is today's balances. Balance snapshots aren't recorded on sync yet.
- Category names in a report's monthly breakdown are now labels ("Dining Out"), not ids.

## Report PDFs in MongoDB

- [x] `DocumentStore.saveReportPdf` / `getReportPdf` (memory, and a `report_pdfs` collection in Mongo). A PDF still renders to a local file, and its bytes are then saved, so any instance can serve the download
- [x] Test: the PDF downloads after the local file is deleted. Round trip checked against Atlas

## Sprint 7: MongoDB wiring (handoff to the quarterly-agent teammate)

- [x] `MongoDocumentStore` written by the quarterly-agent teammate (`packages/data/src/mongo/`), switched on with `DOCUMENT_BACKEND=mongodb`
- [ ] `/health` reports `mongo: "ok" | "unconfigured" | "error"` (optional)
- [x] `MONGODB_URI` and `MONGODB_DB` set on Vercel. Atlas network access allows `0.0.0.0/0`
- [x] Production sets `DOCUMENT_BACKEND=mongodb`
- [x] Done when: a simulation run and a life event saved through the live API read back on repeated requests, and are in Atlas

Notes:
- Atlas's error for a blocked IP address looks like a TLS failure (`SSL alert number 80`), not an access error. Vercel has no fixed IPs, so `0.0.0.0/0` is required; the password is the protection.
- Simulation runs, Copilot events, life events, recommendations, reports, and email schedules now persist in production. Report PDFs are still files in one instance's `/tmp`.

Notes:
