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
| `src/market.ts` | `MarketDataProvider` and the sample prices, statistics and headlines behind the Investments page |
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

## Linked banks replace the demo copy

A signed-up user starts with a copy of the demo profile. Once they link a bank, `preferLinkedBanks` (wrapped around the ledger in `createStores`) hides the demo copy's accounts and their transactions, so the linked bank is the only source of balances. It relies on the demo copy's `<userId>__` ID prefix from `demoProfileFor` and `demoSourceFor`; keep that prefix if you change them.

## The demo profile

`fixtures/planner.json` is generated: edit `scripts/generate-demo.ts`, then run `npm run generate:demo -w @finvantage/data` (it ends today; pass `-- --as-of YYYY-MM-DD` for a fixed date). The generator is seeded, so the same date gives the same file. It builds about eleven months for one persona (Jordan Rivera): semi-monthly pay, freelance, interest, dividends and a tax refund; about $4,000 of monthly spending with seasonal swings; three credit cards; savings, Roth IRA, and brokerage contributions shown on both sides; four mostly-on-track goals and one stretch goal; month-end balance history; and holdings that add up to the account balances. Keep two things the demos rely on: checking at $3,400 with the goals' saved amounts equal to the savings balance (the Copilot checkout demo needs a $1,499 laptop to dip under the $2,500 cushion and nudge a goal), and at most 500 transactions (the transactions list loads 500). The dates do not move on their own: regenerate to refresh them, then restart the API and reseed production (`npm run seed:maincloud -w @finvantage/spacetime`, or POST `/v1/profile/load-demo` as the demo user).

Editing `fixtures/planner.json` changes cards and projections with no code change, which the PRD requires. Its bank data (`bank`) is in Plaid's exact format, with dollars and Plaid's sign (positive `amount` is money out), and goes through `mapItemSnapshot` like real Plaid data. Terms Plaid doesn't provide go in `accountDetails`. It must keep all eight account types and validates against `DemoProfile` at startup. A holding's `close_price` must match its symbol's price in `src/market.ts`, so the Investments page adds up to the Accounts page. Restart the API after editing. The PRD's "starter" persona has no fixture yet: add `fixtures/starter.json`.
