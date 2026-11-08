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

## Scheduled report email

Keep the Hono API as the persistent worker and configure the hosting provider's cron service to
call it every five minutes:

```bash
curl --fail --silent --show-error --request POST \
  --header "Authorization: Bearer $SCHEDULER_SECRET" \
  https://api.example.com/internal/reports/schedule/run
```

The endpoint is protected separately from the public demo token. MongoDB atomically leases each
due schedule, so concurrent cron calls or multiple API instances do not process the same scheduled
occurrence. Every attempt is stored in `email_schedule_logs`; failed Gmail SMTP authentication is
shown in the Reports UI and retried after 15 minutes.

## Extension for a deployed API

1. Add the API origin to `host_permissions` in `apps/extension/manifest.json`.
2. Build with `EXTENSION_API_URL`, `EXTENSION_WEB_URL`, and `EXTENSION_API_TOKEN` set.

The token in the extension is public, so it only ever protects demo data.

## Reminder

Synthetic or sandbox data only. Real accounts bring compliance work that is out of scope (PRD section 11).
