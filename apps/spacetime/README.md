# SpacetimeDB module

The relational ledger and the live event feed, published to Maincloud as the database
`finvantage`. Dashboard: https://spacetimedb.com/finvantage

- `src/index.ts` is the whole module: tables, the admin check, and reducers.
- It runs inside SpacetimeDB, not Node. Import only from `spacetimedb`, never from other workspaces.
- Every table is private. Only identities in `admin` can call reducers. The first publisher is
  the admin, and the API uses that same identity (`SPACETIME_TOKEN` on Vercel).

## Tables

The full model is in `docs/DATA-MODEL.md`. In short:

- **Bank data, mirroring Plaid:** `bank_item`, `bank_account`, `bank_transaction`, `liability`, `recurring_stream`, `security`, `holding`. Plaid's field names, cents instead of dollars, and Plaid's sign (a positive `bank_transaction.amount_cents` is money out).
- **User-entered or computed:** `app_user`, `income_profile`, `goal`, `account_detail`, `budget`, `balance_snapshot`.
- **Platform:** `credential`, `live_event`, `admin`, `user_identity`.

Reducers follow Plaid's endpoints: `sync_bank_transactions` takes one `/transactions/sync` page, `replace_liabilities` takes one `/liabilities/get` result, and so on. `load_profile` loads the demo in one transaction.

## Commands

Install the CLI once: in PowerShell, run `iwr https://windows.spacetimedb.com -useb | iex`, then `spacetime login`.

| Do | Run |
| --- | --- |
| Publish changes | `npm run publish:maincloud -w @finvantage/spacetime` |
| Load the demo profile | `npm run seed:maincloud -w @finvantage/spacetime` |
| Look at data | `spacetime sql finvantage "SELECT * FROM goal" --server maincloud` |
| Read logs | `spacetime logs finvantage --server maincloud` |

Only the platform owner publishes, from their laptop. Adding a table, or appending a column with a
`.default(...)`, is safe. Spacetime refuses to remove a table that still has rows. Publish a
version with a reducer that empties it, call that, then publish without the table. This keeps
sign-ins (`credential`). `--delete-data` wipes everything, including sign-ins: never use it
without warning the team.

## Calling reducers over HTTP

`POST https://maincloud.spacetimedb.com/v1/database/finvantage/call/<reducer_name>`, with
`Authorization: Bearer <token>` and a JSON array of the arguments in order. Watch for three things:

- Field names are **snake_case** on the wire (`display_name`), even though the module uses camelCase.
- Options are `{ "some": value }` or `{ "none": [] }`.
- A reducer returns nothing. The caller picks IDs.

`scripts/seed.mjs` is a working example.
