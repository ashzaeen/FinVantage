# Infrastructure

Nothing here has been deployed yet. This is the plan from the PRD, for the platform owner to fill in as it becomes real. Check each vendor's current docs and pricing.

| Piece | Where | Notes |
| --- | --- | --- |
| Web app | Vercel, free tier | Root directory `apps/web`. Set `NEXT_PUBLIC_API_URL` |
| API and simulator | Vultr instance | Must be public HTTPS, because the extension calls it |
| Relational data | Tiger Data Postgres | Start from `packages/data/src/tiger/schema.sql` |
| Documents | MongoDB Atlas | Collections are listed in `packages/data/src/mongo/index.ts` |
| Domain | GoDaddy Registry | Slide code `MLHUTD84`. Confirm the rules |
| LLM | Gemini API | Server-side key only |

## API environment

See `.env.example`. A real deployment sets `WEB_ORIGIN`, `DEMO_API_TOKEN`, `DATA_BACKEND=real`, the connection strings, and `LLM_PROVIDER=gemini` with its key and model names.

## Extension for a deployed API

1. Add the API origin to `host_permissions` in `apps/extension/manifest.json`.
2. Build with `EXTENSION_API_URL`, `EXTENSION_WEB_URL`, and `EXTENSION_API_TOKEN` set.

The token in the extension is public, so it only ever protects demo data.

## Reminder

Synthetic or sandbox data only. Real accounts bring compliance work that is out of scope (PRD section 11).
