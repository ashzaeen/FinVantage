# Platform: auth, data, deploy

**Tier:** P0, with Plaid at P2. **Code:** `apps/api`, `packages/data`, `packages/live`, `infra`. **Guides:** the `AGENTS.md` in each. **PRD:** sections 3.1, 9, 10, 11.

## Scope

Tiger Data and MongoDB Atlas, the public API on Vultr, the web app on Vercel, the domain, and auth. This is sponsor work, so start it in the first hours, not the last.

## You have now

A complete API with in-memory stores, a demo-token auth stub, working SSE, and a starting `schema.sql`.

## Start here

1. Spike Tiger Data and Atlas right away. Setup problems here delay everyone.
2. Implement `LedgerStore` in `src/tiger`, and `DocumentStore` in `src/mongo`.
3. Deploy the API to Vultr with HTTPS. The extension needs a public endpoint.
4. Add the production API URL to the extension's `host_permissions`, and the web origin to `WEB_ORIGIN`.
5. Claim the domain. The slide lists the code `MLHUTD84`, so confirm its rules first.
6. Use a Tiger Data feature for real, such as time-bucketed spending summaries. The track rewards genuine use.

## Done means

- `DATA_BACKEND=real` passes the API tests.
- The extension works against the deployed API over HTTPS.
- API keys exist only on the server.
- Each sponsor has one visible moment in the demo or write-up.

## Later

- Replace the demo token if time allows.
- Bank data uses the synthetic demo provider. Plaid Sandbox integration is out of scope for the current build.
