# SpacetimeDB module

The relational ledger and the live event feed, published to Maincloud as the database
`finvantage`. Dashboard: https://spacetimedb.com/finvantage

- `src/index.ts` is the whole module: tables, the admin check, and reducers.
- It runs inside SpacetimeDB, not Node. Import only from `spacetimedb`, never from other workspaces.
- Every table is private. Only identities in `admin` can call reducers. The first publisher is
  the admin, and the API uses that same identity (`SPACETIME_TOKEN` on Vercel).

## Tables

| Table | Holds |
| --- | --- |
| `app_user` | `User` from contracts, flattened |
| `income_profile` | `IncomeProfile`, one per user |
| `account`, `ledger_transaction`, `goal` | Same fields as the contracts. Transactions also carry `user_id` |
| `live_event` | Dashboard pushes. `payload` is a JSON `LiveEvent`. The newest 50 per user are kept |
| `admin`, `user_identity` | Who may write. Which browser identity belongs to which user (Sprint 5) |

`user` and `transaction` are SQL keywords, hence `app_user` and `ledger_transaction`.

## Commands

Install the CLI once: in PowerShell, run `iwr https://windows.spacetimedb.com -useb | iex`, then `spacetime login`.

| Do | Run |
| --- | --- |
| Publish changes | `npm run publish:maincloud -w @finvantage/spacetime` |
| Load the demo profile | `npm run seed:maincloud -w @finvantage/spacetime` |
| Look at data | `spacetime sql finvantage "SELECT * FROM goal" --server maincloud` |
| Read logs | `spacetime logs finvantage --server maincloud` |

Only the platform owner publishes, from their laptop. Adding a table or appending a column with a
`.default(...)` is safe. Removing or changing a column needs `--delete-data`, which wipes the
database: warn the team first, then reseed.

## Calling reducers over HTTP

`POST https://maincloud.spacetimedb.com/v1/database/finvantage/call/<reducer_name>`, with
`Authorization: Bearer <token>` and a JSON array of the arguments in order. Watch for three things:

- Field names are **snake_case** on the wire (`display_name`), even though the module uses camelCase.
- Options are `{ "some": value }` or `{ "none": [] }`.
- A reducer returns nothing. The caller picks IDs.

`scripts/seed.mjs` is a working example.
