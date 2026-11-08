# Ledger and transactions

**Tier:** P0 synthetic data, P1 pipeline. **Code:** `packages/data`, `apps/api/src/routes/transactions.ts`, `apps/api/src/routes/accounts.ts`. **PRD:** sections 4 and 12.3.

## Scope

The synthetic demo profile, then the transaction pipeline: categorization, budgets, recurring detection, bill reminders, and the monthly summary.

## You have now

One demo profile with all account types and ten seed transactions. Spending category totals, month-over-month changes, six-month income/spending trend, and recurring-charge lists now derive from ledger transactions. Budget limits remain demo defaults. Recurring cadence is estimated monthly from the fixture flag and next date is a 30-day estimate. Net worth history is reconstructed from current account balances and recorded transactions; it cannot include older activity that is not in the ledger.

The Transactions page searches and filters by type and category across loaded rows, then opens a compact editor. Users can add transactions and edit merchant, account, date, amount, currency, category, and recurring status; changes persist through the API. Non-USD entries retain their original amount and use a historical exchange rate to normalize ledger summaries to USD.

**New (2026-11-07): the data to finish these now exists.** Bank data is modeled on Plaid (`docs/DATA-MODEL.md`):
- `fixtures/planner.json` keeps its bank data in Plaid's format, under `bank`.
- Budget limits are in `budgets`.
- Six months of balance snapshots are in `balanceHistory`.
- Plaid recurring streams carry the real frequency and next date.
- Transactions carry Plaid's detailed category (`categoryDetailed`), and accounts carry `nextPaymentDueOn`.

The budgets, net-worth history, recurring, and bills routes can switch to this data. The table at the end of `docs/DATA-MODEL.md` says which route reads what. The store methods to read budgets, snapshots, and streams arrive with the Spacetime ledger store (`SPRINTS.md`, Sprint 6).

## Start here

1. Grow `fixtures/planner.json` to several months of realistic transactions. Everything downstream looks better for it.
2. Add `fixtures/starter.json` for the PRD's other persona.
3. Compute net worth history from real data.
4. Derive income and spending in `buildSnapshot` from transactions.
5. Build rule-based categorization, then recurring detection, then budgets and bills.
6. Add the LLM fallback for unknown merchants.

## Done means

- A demo user shows all six account categories with balances.
- 90% of synthetic transactions categorize without user input.
- Recurring charges list with cadence and next date, and upcoming bills cover 14 days.
- Budgets show overspending and update on new transactions.
- The monthly summary shows change against the prior month.

## Depends on

The stores. Keep to `LedgerStore` so the swap to Tiger Data is painless. Time-bucketed summaries are a good real use of Tiger Data, so talk to the platform owner.
