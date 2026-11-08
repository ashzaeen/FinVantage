# Spending

**Owner:** Ashzaeen. **Tier:** P1. **Code:** `packages/contracts/src/categories.ts`, the spending routes in `apps/api/src/routes/transactions.ts`, and `apps/web/src/app/(app)/spending`. **PRD:** section 4, features 3, 5, 7 and 10.

## Scope

Spending categories and the Needs, Wants and Savings split, budgets, recurring charges, bill reminders, and the monthly summary, from the API route to the page. The ledger itself (fixtures, the stores) stays with the [transactions](transactions.md) workstream.

## Design (agreed 2026-11-08)

### Three layers of categories

1. **Plaid detailed categories (127):** machine tags on each transaction, from Plaid's [category taxonomy](https://plaid.com/documents/pfc-taxonomy-all.csv), version 2. Never shown to users.
2. **FinVantage categories (about 20):** what people see and budget against. Each has a default bucket and bundles several Plaid tags.
3. **Subcategories:** defaults come from the Plaid tags. Users can add their own subcategories, and one more level under those (Shopping → Superstores → Walmart). Three levels at most.

A transaction stores its top-level category in `category` and its most specific subcategory in `subcategory`. The defaults and the Plaid mapping live in `packages/contracts/src/categories.ts`.

### Default categories

| Bucket | Categories |
| --- | --- |
| Needs | Housing, Utilities, Groceries, Transportation, Insurance, Health, Childcare & Education, Debt Payments, Taxes & Fees |
| Wants | Dining Out, Entertainment, Shopping, Personal Care, Travel, Rides, Home & Pets, Giving, Other |
| Savings | Savings & Investing |
| Not spending | Income, Transfers |

- **Debt Payments** is one category in Needs. It is not split into minimum and extra payments.
- **Credit card payments are Transfers,** not spending. The purchases on the card already count, so counting the payment would double it.
- **Subscriptions are not a category.** They are a view over recurring charges, because streaming, gyms and software sit in different categories.
- **Superstores** (Walmart, Target) default to Shopping. Users can move them.

### Needs, Wants and Savings

- The default split is 50/30/20 of monthly income, and each user can change it. The three shares must add up to 100%.
- The API reports each bucket's spending against its target for the month.
- **Override order:** a transaction's own bucket, then its subcategory's, then its category's default.

### Budgets

- A fixed monthly limit per category, with optional limits per subcategory.
- The API reports spent, remaining, and pace: what the month will end at if spending continues at the same rate.
- Suggested limits can come from the last three months' average, capped to fit the split.
- Rollover, annual expenses and a flexible pool are out of scope for now.

### Custom categories and rules

- Users can create, rename and hide subcategories. Deleting one moves its transactions to its parent.
- **Merchant rules** ("Always put Starbucks in Coffee") assign new transactions automatically. Without them, custom subcategories mean re-tagging by hand.

### How it feeds the rest of FinVantage

- **Advisor:** ranks what to cut by Wants spending.
- **Simulator:** budgets become planned monthly spending.
- **Copilot:** a checkout card can show how much of a category's budget a purchase uses.
- **Life events:** a new baby suggests a Childcare budget.
- **Monthly reports:** compare the split, this month against last.

## Build order

1. **Categories and the split.** The category list, the Plaid mapping, `subcategory` on transactions, and the Needs, Wants and Savings summary, with an editable split.
2. **Budgets.** Limits per category from storage, with pace.
3. **Custom categories.** Create, rename and hide subcategories up to three levels, re-categorise transactions, and add merchant rules.
4. Recurring charges and bills from Plaid streams and due dates (see below).

## Recurring charges and bills

The real data already exists, modelled on Plaid (`docs/DATA-MODEL.md`, table at the end):

| Route | Switch it to |
| --- | --- |
| `listBudgets` | The `budget` table, or `budgets` in `fixtures/planner.json` |
| `listRecurring` | `recurring_stream`, which has the real frequency and `predicted_next_date` |
| `listUpcomingBills` | `liability.next_payment_due_date` plus `recurring_stream.predicted_next_date` |

## Done means

- Every Plaid detailed category maps to a FinVantage category, and every category has a bucket.
- The split summary shows Needs, Wants and Savings against the user's targets.
- Budgets show an overspend state and update when a transaction is added.
- Recurring charges list their cadence and next date, from streams rather than estimates.
- Upcoming bills cover the next 14 days.
- No figure is computed in the browser. Everything comes from the API.

## Depends on

- **The stores** ([transactions](transactions.md), [platform](platform.md)). New storage, such as custom categories, rules and the user's split, changes `LedgerStore` and the Spacetime tables, so agree it with Yao.
- **Samyog's** Transactions editor uses a free-text category. It should switch to the category list.
