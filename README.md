# FinVantage

A responsive web app and a Chrome extension that simulate a user's financial future and step in at the moment of a money decision. Built for HackUTD (PNC 360 Financial Health Navigator, design, and sponsor tracks).

This repo is a **running skeleton**. Every part boots and talks to every other part, but the logic behind it is stubbed. Teams replace stubs without waiting on each other, because the contracts between parts already exist.

## Quick start

Needs Node 20.9 or later.

```bash
npm install
npm run dev
```

| What | Where |
| --- | --- |
| Landing page | http://localhost:3000 |
| Dashboard | http://localhost:3000/app |
| API | http://localhost:4000/health |
| Demo pages for the extension | http://localhost:4100 |

No `.env`, database, or API keys are needed. To load the extension, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select `apps/extension/dist`. Then open a demo page.

Before you push, run:

```bash
npm run check   # typecheck and tests, everywhere
```

## Quarterly reports

The default setup uses the in-memory document store, template report writer, and mock email
provider. Reloading the demo profile seeds three synthetic quarterly simulation runs; the Reports
page then generates the latest completed quarter without asking the user to select a period.

To use the real services, copy `.env.example` to `.env` and configure:

```bash
DOCUMENT_BACKEND=mongodb
MONGODB_URI=mongodb+srv://...
MONGODB_DB=finvantage

LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL_FLASH=...

MAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=youraccount@gmail.com
SMTP_PASSWORD=your-google-app-password
REPORT_EMAIL_FROM=FinVantage <youraccount@gmail.com>
REPORT_EMAIL_OVERRIDE=your-demo-recipient@example.com
SCHEDULER_SECRET=replace-with-a-long-random-secret
```

`POST /v1/reports/quarterly` automatically resolves the latest completed quarter and is
idempotent per user and quarter. PDFs are written beneath `REPORT_OUTPUT_DIR` and served through
the authenticated download route.

Users can save a recipient and hourly, daily, weekly, monthly, or quarterly email frequency on the
Reports page. The API persists the schedule and its delivery log in the configured document store.
In production, call `POST /internal/reports/schedule/run` every five minutes with
`Authorization: Bearer $SCHEDULER_SECRET`; this processes every due schedule. The Reports page's
**Run now** action exercises the same delivery path locally without waiting for cron.

## Find your part

Claim a workstream by putting your name in the table, then read its brief.

| Workstream | Tier | Owner | Brief | Code |
| --- | --- | --- | --- | --- |
| Dashboard and design | P0 | Ashzaeen | [web-dashboard](docs/workstreams/web-dashboard.md) | `apps/web` |
| Life-Event Simulator | P0 | _unclaimed_ | [simulator](docs/workstreams/simulator.md) | `packages/simulator` |
| Copilot extension | P0 | _unclaimed_ | [extension](docs/workstreams/extension.md) | `apps/extension` |
| Copilot backend | P0 | _unclaimed_ | [copilot-backend](docs/workstreams/copilot-backend.md) | `packages/math-core`, `packages/llm` |
| Platform: auth, data, deploy | P0 | _unclaimed_ | [platform](docs/workstreams/platform.md) | `apps/api`, `packages/data`, `packages/live`, `infra` |
| Life-event entry | P0 form, P1 parser | _unclaimed_ | [life-events](docs/workstreams/life-events.md) | `packages/llm`, `apps/web` |
| Ledger and transactions | P0 data, P1 pipeline | _unclaimed_ | [transactions](docs/workstreams/transactions.md) | `packages/data`, `apps/api` |
| Advisory and report agents | P1, P2 | _unclaimed_ | [advisory](docs/workstreams/advisory.md) | `packages/llm` |
| Spacetime live push | Stretch | _unclaimed_ | [spacetime](docs/workstreams/spacetime.md) | `packages/live` |

## Docs

| Read this | For |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Rules and navigation for coding agents, and a good summary for people |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the parts fit together |
| [docs/RECIPES.md](docs/RECIPES.md) | Step-by-step changes, such as adding an endpoint |
| [docs/DECISIONS.md](docs/DECISIONS.md) | What was decided, and what is still open |
| [docs/PRD.md](docs/PRD.md) | The full requirements, as text |
| [infra/README.md](infra/README.md) | Hosting and deployment |
