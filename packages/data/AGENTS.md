# packages/data

Storage and data sources. Read the root `AGENTS.md` first. Briefs: `docs/workstreams/platform.md`, `docs/workstreams/transactions.md`.

| Path | Holds |
| --- | --- |
| `src/stores.ts` | `LedgerStore` and `DocumentStore` interfaces |
| `src/memory.ts` | Default in-memory implementations |
| `src/profile.ts` | Demo profile schema, loader, `buildSnapshot` |
| `src/tiger/` | Tiger Data stub and `schema.sql` |
| `src/mongo/` | MongoDB Atlas stub |
| `src/bank.ts` | Bank providers: synthetic default, Plaid stub |
| `fixtures/planner.json` | The demo profile |

## What goes where

| Tiger Data (`LedgerStore`) | MongoDB Atlas (`DocumentStore`) |
| --- | --- |
| Users, income profile, accounts, transactions, goals | Life events, simulation runs, Copilot events, recommendations, reports |

Do not add a third store. Spacetime is for live push only.

## Rules

- Routes use the interfaces, never a driver. `createStores` picks the implementation from `DATA_BACKEND`.
- A new store method goes on the interface, in memory, and in the real implementation.
- Money stays integer cents in every store.
- Run documents store inputs and outputs in full, so diffs read stored results and never recalculate.

## The demo profile

Editing `fixtures/planner.json` changes cards and projections with no code change, which the PRD requires. It must keep all seven account types and validates against `DemoProfile` at startup. Restart the API after editing. The PRD's "starter" persona has no fixture yet: add `fixtures/starter.json`.
