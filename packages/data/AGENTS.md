# packages/data

Storage and data sources. Read the root `AGENTS.md` first. Briefs: `docs/workstreams/platform.md`, `docs/workstreams/transactions.md`.

| Path | Holds |
| --- | --- |
| `src/stores.ts` | `LedgerStore` and `DocumentStore` interfaces |
| `src/memory.ts` | Default in-memory implementations |
| `src/profile.ts` | Demo profile schema, loader, `buildSnapshot` |
| `src/spacetime/` | `SpacetimeLedgerStore` and its HTTP client (SQL and reducer calls, SATS-JSON decoding) |
| `src/mongo/` | MongoDB Atlas `DocumentStore` implementation |
| `src/bank.ts` | Bank providers: synthetic demo data |
| `src/plaid/` | Plaid's objects (`schema.ts`), the mapper to app types (`map.ts`), and Spacetime rows (`spacetime-rows.ts`). See `docs/DATA-MODEL.md` |
| `fixtures/planner.json` | The demo profile |

## What goes where

| SpacetimeDB (`LedgerStore`) | MongoDB Atlas (`DocumentStore`) |
| --- | --- |
| Users, income profile, bank data in Plaid's shape (items, accounts, transactions, liabilities, recurring streams, holdings), goals, budgets, balance snapshots | Life events, simulation runs, Copilot events, recommendations, reports |

Tiger Data is no longer used (`docs/DECISIONS.md`). Do not add a third store. Production runs `LEDGER_BACKEND=spacetime` and `DOCUMENT_BACKEND=mongodb`; locally both default to memory.

## Rules

- Routes use the interfaces, never a driver. `createStores` picks implementations from `LEDGER_BACKEND` and `DOCUMENT_BACKEND`.
- `src/stores.test.ts` is the ledger contract. Every implementation must pass it. Run it against Maincloud with `SPACETIME_TEST_TOKEN=... npm test -w @finvantage/data`.
- In development, an invalid MongoDB URI logs a credential-safe warning and falls back to the memory document store so the demo remains runnable. Production fails closed.
- A new store method goes on the interface, in memory, and in the real implementation.
- Money stays integer cents in every store.
- Run documents store inputs and outputs in full, so diffs read stored results and never recalculate.

## The demo profile

Editing `fixtures/planner.json` changes cards and projections with no code change, which the PRD requires. Its bank data (`bank`) is in Plaid's exact format, with dollars and Plaid's sign (positive `amount` is money out), and goes through `mapItemSnapshot` like real Plaid data. Terms Plaid doesn't provide go in `accountDetails`. It must keep all seven account types and validates against `DemoProfile` at startup. Restart the API after editing. The PRD's "starter" persona has no fixture yet: add `fixtures/starter.json`.
