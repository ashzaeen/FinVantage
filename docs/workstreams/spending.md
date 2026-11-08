# Spending

**Owner:** Ashzaeen. **Tier:** P1. **Code:** the spending routes in `apps/api/src/routes/transactions.ts` (`listBudgets`, `listRecurring`, `listUpcomingBills`, `getSpendingSummary`), and `apps/web/src/app/(app)/spending`. **PRD:** section 4, features 3, 5, 7 and 10.

## Scope

Budget envelopes, recurring charges, bill reminders, and the monthly spending summary, from the API route to the page. The ledger itself (fixtures, categorization, the stores) stays with the [transactions](transactions.md) workstream.

## You have now

- **Monthly summary:** done. Category totals and the change against the prior month come from ledger transactions.
- **Budgets:** the route uses built-in demo limits.
- **Recurring charges:** estimated as monthly, with the next date set 30 days out.
- **Bill reminders:** reuse the recurring list.

The real data for all three already exists, modelled on Plaid (`docs/DATA-MODEL.md`, table at the end):

| Route | Switch it to |
| --- | --- |
| `listBudgets` | The `budget` table, or `budgets` in `fixtures/planner.json` |
| `listRecurring` | `recurring_stream`, which has the real frequency and `predicted_next_date` |
| `listUpcomingBills` | `liability.next_payment_due_date` plus `recurring_stream.predicted_next_date` |

## Start here

1. Read the demo profile's `budgets` and recurring streams through the store. If a store method is missing, it is planned with the Spacetime ledger store (`SPRINTS.md`, Sprint 6), so agree the method with Yao rather than reading the fixture from a route.
2. Switch `listRecurring` to streams, then build `listUpcomingBills` from due dates and stream dates for the next 14 days.
3. Switch `listBudgets` to stored limits, with spending computed from the month's transactions.
4. Redesign `/spending` to match the landing page's style: Title Case labels, the purple tokens, and 14px cards.

## Done means

- Budgets show an overspend state and update when a transaction is added.
- Recurring charges list their cadence and next date, from streams rather than estimates.
- Upcoming bills cover the next 14 days.
- The monthly summary shows the change against the prior month.
- No figure is computed in the browser. Everything comes from the API.

## Depends on

The ledger and stores ([transactions](transactions.md), [platform](platform.md)). Adding a store method changes `LedgerStore`, so tell its owners.
