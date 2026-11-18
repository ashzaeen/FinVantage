# Infrastructure

| Piece | Where | Deploys |
| --- | --- | --- |
| Web app | Vercel project `finvantage-web` (platform owner's account), root directory `apps/web`. Live at https://finvantage-web-ten.vercel.app | `.github/workflows/deploy.yml`, on pushes to `main` that touch it |
| API | Vercel project `finvantage-api` (same account), root directory `apps/api`. Live at https://finvantage-api.vercel.app | Same workflow |
| Relational data, auth, live updates | SpacetimeDB Maincloud, database `finvantage` | Published from the platform owner's laptop with `spacetime publish`. Planned, see `SPRINTS.md` |
| Documents | MongoDB Atlas free cluster `cluster0.gxiece7` in the platform owner's Atlas account, database `finvantage` | Live. Collections are created by the store (`packages/data/src/mongo/`). Replaced Samyog's cluster on 2026-11-18 after it disappeared; Network Access must allow `0.0.0.0/0` for Vercel |
| CI | `.github/workflows/ci.yml` | Manual only (Actions tab > CI > Run workflow) |
| Monitoring | `.github/workflows/health.yml` | Every 30 minutes. Fails, and emails, when `/health` or the web app is down |
| Backups | `.github/workflows/backup.yml` | Nightly, encrypted, kept 30 days. Off until its three secrets are set (below) |
| LLM | Gemini API | Server-side key only |

Tiger Data and Vultr are no longer used. See `docs/DECISIONS.md`.

## Health checks and monitoring

`GET /health` queries each database in use (SpacetimeDB and MongoDB) and answers 503 if one is down, with `stores` saying which: `{"ok":false,"stores":{"spacetime":"ok","mongodb":"down"}}`. Error details go only to the Vercel log. A result is reused for 15 seconds. The deploy workflow's smoke test uses it too, so a deploy fails while a database is down.

`.github/workflows/health.yml` calls it every 30 minutes, with three tries to ride out a cold start. GitHub emails a failed scheduled run to whoever last edited the workflow's `cron` line, so that person is the one alerted. Run it by hand from Actions > Health > Run workflow.

## Backups

Free MongoDB clusters have no backups, and the old cluster vanished with its data. `.github/workflows/backup.yml` exports both databases every night with `infra/backup/backup.mjs`: every MongoDB collection, and every SpacetimeDB table (read from the module's schema, so new tables are included). It encrypts the file with AES-256 and uploads it as an artifact kept for 30 days. The repo is public and anyone signed in to GitHub can download a public repo's artifacts, which is why the file is encrypted.

**To turn it on**, the repo owner adds three secrets (Settings > Secrets and variables > Actions):

| Secret | Value |
| --- | --- |
| `BACKUP_MONGODB_URI` | The same value as `MONGODB_URI` on Vercel |
| `BACKUP_SPACETIME_TOKEN` | A token that can read every table: the module owner's, from `spacetime login show --token` |
| `BACKUP_PASSPHRASE` | A random value of 32 or more characters, such as `openssl rand -base64 36`. Keep a copy in a password manager: without it the backups can't be opened |

Until all three exist, the workflow passes with a warning and backs up nothing. After adding them, run it once by hand (Actions > Backup > Run workflow) and check that an artifact appears.

**To restore MongoDB:** download the artifact, then

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in finvantage-backup-DATE.json.gz.enc -out backup.json.gz
MONGODB_URI='mongodb+srv://...' node infra/backup/restore-mongo.mjs backup.json.gz
```

It refuses to write into a collection that already has documents unless you add `--replace`. Tested on 2026-11-18: binary PDFs, dates and nested documents come back identical.

**SpacetimeDB** rows are in the same file under `spacetime.tables`, as each table's schema and rows. There is no automatic restore: reducers own every write, so recovering means republishing the module and replaying the rows through an admin reducer written for the occasion. Treat the backup as the record to rebuild from.

## How the API runs on Vercel

`npm run build` in `apps/api` runs `scripts/build-vercel.mjs`. It bundles `src/vercel.ts` and every workspace package into one Node function, written to `.vercel/output` (the [Build Output API](https://vercel.com/docs/build-output-api/v3)). Vercel serves that directory as-is, and every route goes to the one function. Local dev still uses `src/server.ts`.

To check a bundle locally: run `npm run build -w @finvantage/api`, then serve the default export of `apps/api/.vercel/output/functions/index.func/index.mjs` with `node:http`'s `createServer`.

## Scheduled report email

Configure an external cron service to call the deployed API every five minutes:

```bash
curl --fail --silent --show-error --request POST \
  --header "Authorization: Bearer $SCHEDULER_SECRET" \
  https://finvantage-api.vercel.app/internal/reports/schedule/run
```

The endpoint is protected separately from the public demo token. MongoDB atomically leases each
due schedule, so concurrent cron calls or multiple API instances do not process the same scheduled
occurrence. Every attempt is stored in `email_schedule_logs`; failed Gmail SMTP authentication is
recorded and retried after 15 minutes.

## How deploys work

The repo belongs to Ashzaeen, but the Vercel projects belong to the platform owner, so the Vercel GitHub app isn't used. Instead, `.github/workflows/deploy.yml` deploys on each push to `main`:

1. Each app (`api`, `web`) deploys only if its paths changed.
2. The workflow links the project by name (`vercel link --project finvantage-api`), then runs `vercel deploy --prod` from the repo root.
3. Vercel uploads the repo (minus `.vercelignore`) and builds remotely on Linux, using the project's Root Directory. Build logs are in the Vercel dashboard.
4. A smoke step checks `/health` (API) or `/` (web), and fails the job if there's no 200.

You can also run it by hand: Actions tab > Deploy > Run workflow.

## First-time setup

### 1. Platform owner: create the projects (once)

From the repo root, with the Vercel CLI (`npx vercel@65.2.0 ...`):

1. `npx vercel@65.2.0 login`
2. Create and configure each project in the Vercel dashboard (**Add New > Project**, skip the Git import), or with `vercel link`:
   - `finvantage-api`: Root Directory `apps/api`, Framework **Other**. Env vars for Production and Preview:
     - `WEB_ORIGIN` = `https://finvantage-web-ten.vercel.app,http://localhost:3000`
     - `DEMO_API_TOKEN` = `demo-token`
     - `REPORT_OUTPUT_DIR` = `/tmp/finvantage-reports` (Vercel functions can only write under `/tmp`)
     - `AUTH_PRIVATE_JWK` = a private RSA JWK that signs sign-in tokens. Generate it once and pipe it straight into `vercel env add`, so it never appears on screen. Changing it signs everyone out
     - `SPACETIME_TOKEN`, `SPACETIME_URL`, `SPACETIME_MODULE` = the Spacetime admin token and database (see `apps/spacetime/README.md`)
     - `LEDGER_BACKEND` = `spacetime` (accounts, transactions, and goals in Spacetime)
     - `PLAID_CLIENT_ID`, `PLAID_SECRET` (Sandbox), `PLAID_ENV` = `sandbox`, `PLAID_TOKEN_KEY` = 32 random bytes as base64, which encrypts Plaid access tokens. Changing the key disconnects every linked bank
     - `DOCUMENT_BACKEND` = `mongodb`, `MONGODB_URI` = the Atlas connection string, `MONGODB_DB` = `finvantage`. In Atlas, Network Access must allow `0.0.0.0/0`, because Vercel has no fixed IPs. A blocked IP shows up in the logs as `SSL alert number 80`
   - `finvantage-web`: Root Directory `apps/web`, Framework **Next.js**. Env vars:
     - `NEXT_PUBLIC_API_URL` = `https://finvantage-api.vercel.app`
     - `NEXT_PUBLIC_DEMO_TOKEN` = `demo-token`
3. First deploy, from the repo root: `npx vercel@65.2.0 link --yes --project finvantage-api`, then `npx vercel@65.2.0 deploy --prod`. Repeat for `finvantage-web`.
4. Create a token at vercel.com/account/tokens and send it privately to the repo owner.

Vercel gave the web project `finvantage-web-ten.vercel.app`, because `finvantage-web` was taken. If a domain changes, update the env vars above and the `smoke` URLs in `deploy.yml`.

Only production is deployed. Vercel's preview URLs sit behind Vercel Authentication, so the `*` wildcard in `WEB_ORIGIN` is there if previews are ever needed.

- **The web build reports that TypeScript is missing:** Vercel installs only the web workspace's own dependencies, so anything `next build` needs must be listed in `apps/web/package.json`, not just the root. This already caught `typescript` and `@types/node`.

### 2. Repo owner: add the secret (once, about 2 minutes)

On GitHub, go to **Settings > Secrets and variables > Actions > New repository secret**. Set Name to `VERCEL_TOKEN` and Value to the platform owner's token. Until this exists, the Deploy workflow skips with a notice instead of failing.

### 3. Extension against the deployed API

```bash
EXTENSION_API_URL=https://finvantage-api.vercel.app EXTENSION_WEB_URL=https://finvantage-web-ten.vercel.app npm run build -w @finvantage/extension
```

The build adds the API origin to `host_permissions` automatically. Load `apps/extension/dist` unpacked.

### If a deploy fails

- Open the failed deployment in the Vercel dashboard and read its **Build Logs**.
- **The API can't find workspace packages:** set the API project's Install Command to `cd ../.. && npm ci`.
- **API bundling errors:** `npm run build -w @finvantage/api` locally runs the same build.

## Known limits on Vercel

- **Report PDFs** render to `/tmp`, and their bytes are saved in MongoDB (`report_pdfs`), so any instance can serve the download.
- **Files the API bundle reads at runtime** (pdfkit's font data, the Poppins fonts) are copied next to the bundle by `scripts/build-vercel.mjs`. A new dependency that reads its own files from disk needs the same treatment, or the API crashes on Vercel while working locally.
- **Data persists in production:** the ledger in Spacetime and documents in MongoDB. Locally both default to memory and reset when the API restarts. The signed-out demo user is shared, so edits made while signed out are visible to every visitor.
- **Live updates:** signed-in dashboards subscribe through SpacetimeDB (`LIVE_TRANSPORT=spacetime`), so a push reaches them whichever instance sent it. Signed-out visitors use SSE, which only reaches a dashboard connected to the same instance.
- **SSE streams end** when they reach the function's maximum duration. The browser's `EventSource` reconnects by itself.

## Reminder

Synthetic or sandbox data only. Real accounts bring compliance work that is out of scope (PRD section 11).

The demo token is baked into the web app and the extension, so it is public. It only ever protects demo data.
