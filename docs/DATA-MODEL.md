# Data model

How FinVantage stores money data. It's built around Plaid, the main bank connector, and PRD section 9 (the seven entities), plus the table-stakes features in section 4.

## Three layers

```
Plaid (or the demo fixture, in Plaid's exact format)
   │  PlaidItemSnapshot             packages/data/src/plaid/schema.ts
   ▼
Spacetime bank tables               apps/spacetime/src/index.ts   (Plaid's fields, cents, Plaid's signs)
   │  mapItemSnapshot               packages/data/src/plaid/map.ts   (the only place Plaid's rules live)
   ▼
App types: Account, Transaction     packages/contracts           (what routes, math core, simulator, and web use)
```

1. **Plaid layer.** Plaid's own objects, with Plaid's field names, so a real response parses unchanged.
   - Dollars as numbers.
   - A transaction `amount` is positive for money **out**.
   - One `PlaidItemSnapshot` per bank login holds:
     - the item
     - its accounts
     - its transactions and sync cursor
     - liabilities
     - recurring streams
     - holdings and securities
2. **Mapper.** `mapItemSnapshot` turns Plaid objects into the app's types. It handles every Plaid convention:
   - Flips the sign and converts dollars to integer cents.
   - Maps Plaid's type and subtype to the seven `AccountType`s.
   - Takes rates, minimum payments, and due dates from liabilities. A promotional `special` APR beats the purchase APR.
   - Categorizes by rules from Plaid's category (`categoryFor`).
   - Flags a transaction as recurring when it's in an active stream.
3. **App types.** `Account` and `Transaction` in `@finvantage/contracts`. Fields are only ever added, so the code that uses them stays stable.

The demo profile, `packages/data/fixtures/planner.json`, holds its bank data in Plaid's format and goes through the same mapper. Switching to live Plaid means changing where the snapshots come from, and nothing else.

## Where each entity lives

| Entity (PRD section 9) | Store | Tables or collections |
| --- | --- | --- |
| User | Spacetime | `app_user`, `income_profile`, `credential` (sign-in) |
| Account | Spacetime | `bank_item`, `bank_account`, `liability`, `account_detail` |
| Transaction | Spacetime | `bank_transaction`, `recurring_stream` |
| Goal | Spacetime | `goal` |
| Life event | MongoDB | `life_events` |
| Simulation run | MongoDB | `simulation_runs` |
| Copilot event and recommendation | MongoDB | `copilot_events`, `recommendations`, plus `quarterly_reports`, `email_schedules`, `email_schedule_logs` |

Spacetime also holds `budget`, `balance_snapshot`, `holding`, `security`, `live_event`, `admin` and `user_identity`.

## Spacetime tables

All private. Only the API's admin identity can write.

### Bank data, from Plaid

| Table | One row per | Key fields | Comes from |
| --- | --- | --- | --- |
| `bank_item` | Bank login | `item_id`, `user_id`, `institution_name`, `transactions_cursor`, `status` | Link and `/item/get` |
| `bank_account` | Account | `account_id`, `item_id`, `type`, `subtype`, `mask`, `current_cents`, `available_cents`, `limit_cents` | `/accounts/get` |
| `bank_transaction` | Transaction | `transaction_id`, `account_id`, `amount_cents` (Plaid sign), `date`, `merchant_name`, `payment_channel`, `pending`, `pfc_primary`, `pfc_detailed` | `/transactions/sync` |
| `liability` | Card or loan | `account_id`, `kind`, `aprs`, `interest_rate_percentage`, `minimum_payment_cents`, `next_payment_due_date` | `/liabilities/get` |
| `recurring_stream` | Subscription or repeat bill | `stream_id`, `direction`, `frequency`, `average_amount_cents`, `predicted_next_date`, `transaction_ids`, `status` | `/transactions/recurring/get` |
| `security` | Security (shared) | `security_id`, `ticker_symbol`, `type`, `close_price_cents` | `/investments/holdings/get` |
| `holding` | Account and security pair | `account_id`, `security_id`, `quantity`, `institution_value_cents`, `cost_basis_cents` | `/investments/holdings/get` |

Plaid's access token is never stored in these tables. When live Plaid arrives, it goes in its own server-only store.

### Entered by the user or computed by the app

| Table | Holds | PRD |
| --- | --- | --- |
| `app_user` | Name, email, buffer target, extension settings | Section 9, User |
| `income_profile` | Monthly income, fixed costs, debt payments, spending, savings, payday | Simulator inputs |
| `goal` | Target, date, priority rank, flexibility, linked account | Feature 8, section 9 |
| `account_detail` | Terms Plaid doesn't report: deposit rates (savings, CD), auto and personal loan rate and payment, promo end date | Copilot math |
| `budget` | Monthly limit per category | Feature 3 |
| `balance_snapshot` | An account's balance on a date, saved on each sync | Feature 4, net worth over time |
| `app_account` | Accounts the user entered by hand | Feature 1, manual accounts |
| `app_transaction` | Hand-entered transactions, or the user's edit of a bank transaction (same id; it wins) | Editing transactions |

### Platform

| Table | Holds |
| --- | --- |
| `credential` | Email + password sign-in: lowercased email, user id, scrypt hash |
| `live_event` | Dashboard pushes (Sprint 5) |
| `admin` | Identities allowed to call reducers |
| `user_identity` | Browser identity to user id (Sprint 5) |

## Reducers follow Plaid's endpoints

| Plaid call | Reducer |
| --- | --- |
| Link and `/item/get` | `upsert_bank_item` |
| `/accounts/get` | `replace_bank_accounts(item_id, accounts)` |
| `/transactions/sync`, one page | `sync_bank_transactions(item_id, added, modified, removed_transaction_ids, next_cursor)` |
| `/liabilities/get` | `replace_liabilities(item_id, liabilities)` |
| `/transactions/recurring/get` | `replace_recurring_streams(item_id, streams)` |
| `/investments/holdings/get` | `replace_holdings(item_id, securities, holdings)` |
| `/item/remove` | `remove_bank_item(item_id)`, which deletes everything under the item |

The demo uses `load_profile`, which replaces one user's data in a single transaction. `packages/data/src/plaid/spacetime-rows.ts` turns Plaid snapshots into these reducers' arguments.

## App-type fields added for Plaid

All are nullable or have defaults, so manual entries and old code are unaffected.

- `Account`:
  - `subtype`
  - `mask`
  - `availableBalanceCents`
  - `creditLimitCents`
  - `nextPaymentDueOn` (for bill reminders)
- `Transaction`:
  - `pending`
  - `categoryDetailed` (Plaid's detailed category)
  - `paymentChannel`
  - `logoUrl`
- New types:
  - `BalanceSnapshot` and `BudgetLimit` in `@finvantage/contracts`.
  - `AccountDetails` in `packages/data`.

## Where each table-stakes feature reads from (PRD section 4)

| Feature | Reads | Status |
| --- | --- | --- |
| 1. Account linking, all six types | `bank_item`, `bank_account` | The demo is in Plaid format. Live Plaid Link is not built |
| 2. Auto-categorization | `pfc_detailed` and `pfc_primary` through `categoryFor` | Rules done: 100% of demo transactions categorize. LLM fallback for unknown merchants is open |
| 3. Budget envelopes | `budget` and transactions | Table and fixture limits exist. The route still uses its built-in demo limits: switch it to `budget` |
| 4. Net worth over time | `balance_snapshot` | Six months of demo history exist. The route still draws a flat line: switch it to snapshots |
| 5. Recurring detection | `recurring_stream` | Streams carry real frequency and next date. The route still estimates monthly +30 days: switch it to streams |
| 6. Portfolio | `holding`, `security` | Demo IRA holdings exist. The route is still mocked |
| 7. Bill reminders | `liability.next_payment_due_date`, `recurring_stream.predicted_next_date` | Data exists. The route reuses the recurring list |
| 8. Savings goals | `goal` | Done |
| 9. Credit score | None. Plaid doesn't provide one | Mocked and labeled, as the PRD allows |
| 10. Monthly summary | Transactions | Done |

The "switch it to..." items belong to the transactions workstream, and need the Spacetime ledger store (Sprint 6) to expose these tables.

## Known gaps

- **Non-retirement brokerage accounts** are skipped by the mapper, because `AccountType` has no brokerage type. Their holdings still load. Adding a type means updating every `Record<AccountType, ...>` map.
- **Student loans** map to `loan` / `personal`.
- **Multi-currency:** currency codes are stored, but the app assumes USD.
