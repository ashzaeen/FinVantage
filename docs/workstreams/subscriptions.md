# Subscriptions

**Owner:** Ashzaeen (dashboard). **Tier:** P1. **Status:** plan, written 2026-11-19. Nothing here is built yet. **Code (planned):** `apps/web/src/app/(app)/subscriptions`, `packages/math-core/src/subscriptions.ts`, `apps/api/src/routes/subscriptions.ts`, contracts in `packages/contracts/src/subscription.ts`. **PRD:** section 4, feature 5 (recurring expense detection), plus feature 7 (bill reminders).

## Decisions made (2026-11-19)

| Question | Answer |
| --- | --- |
| Where subscription state lives | **Memory first, MongoDB later.** Build `SubscriptionStore` with a memory implementation; add the MongoDB one after agreeing it with Yao |
| Draft word cap | **120 words**, with the same number check as cards and a template fallback |
| Demo data | **Streams on, with history.** Extend the demo generator with about 10 subscriptions covering every flag |
| First pass | **Steps 1 to 4: a read-only page.** Math, contracts, API reads, demo data and the page. Status tracking, the guide, drafts, connections and production storage follow |

## Summary

A new page, **Subscriptions**, in the Intelligence section of the dashboard. It finds every recurring charge, says what each one costs per month and per year, flags the ones worth a second look (price went up, two services doing the same job, a charge that should have stopped), and helps the user act: a step-by-step cancellation guide, a ready-to-send message for cancelling or asking a provider for a lower bill, and a tracker that checks whether a cancelled charge really stopped.

It does what Rocket Money does for tracking, and a version of what it does for cancelling and negotiating, **without acting on the user's behalf**. Rocket Money's concierge and negotiators are people who contact providers for the user, and it takes a share of the savings. FinVantage's rule 4 is "Suggest only": nothing moves money, applies for anything, or clicks anything on a host page. So the user does the last step, and FinVantage makes that step as small as it can be.

## What exists already

The recurring plumbing is mostly in place. This feature builds on it rather than replacing it.

| Piece | Where | State |
| --- | --- | --- |
| `RecurringCharge` schema: merchant, `amountCents`, cadence, `nextDate`, `accountId`, `category`, `source` | `packages/contracts/src/spending.ts` | Done. Has no id, no history, no status |
| `GET /v1/recurring` and `GET /v1/bills/upcoming` | `apps/api/src/routes/spending.ts` | Done. Uses the bank's recurring streams, else falls back to `estimatedCharges` (latest charge per merchant, assumed monthly) |
| `RecurringStream` (Plaid `/transactions/recurring/get`, outflows) and the `recurring_stream` table | `packages/data/src/stores.ts`, `docs/DATA-MODEL.md` | Done in the store interface. `listRecurringStreams` is optional, so the estimate path runs without it |
| `isRecurring` on every `Transaction` | `packages/contracts/src/account.ts` | Done |
| Advisor tool `get_recurring_and_bills` | `apps/api/src/advisor/tools.ts` | Done |
| Decision: "Subscriptions are not a category. They are a view over recurring charges" | `docs/workstreams/spending.md` | Decided 2026-11-08. This plan follows it |
| Intelligence nav group | `apps/web/src/lib/nav.ts` | Four items today: Advisor, Copilot, Life Events, Reports |

**Gaps this plan fills:** telling a subscription from a bill, a stable id per subscription, monthly and annual cost, price-change and duplicate detection, a per-subscription charge history, user state (keep, cancelling, cancelled), a check that a cancelled charge really stopped, the guide and message drafts, and the page.

## What Rocket Money does, and what we do

| Rocket Money | FinVantage |
| --- | --- |
| Detects subscriptions from linked accounts | Same, from the data we already have: bank streams first, estimate as fallback |
| Lists them with cost | Same, plus monthly and yearly totals and share of income |
| Cancellation concierge: staff cancel for you | **Cancellation guide and drafted message.** The user cancels. FinVantage tracks whether the charge stopped |
| Bill negotiation: staff negotiate, fee of 30% to 60% of savings | **Drafted negotiation message** for bills the user's own history says went up. No fee, nobody acts for the user |
| Premium paywall | None. This is a demo, and there is no billing |

## Rules check

Every rule in the root `AGENTS.md` that this feature touches, and how the plan keeps it.

| Rule | How |
| --- | --- |
| 1. Math first | Costs, totals, price changes, duplicates and savings are computed in `math-core`. The model only words the drafts and gets those figures as input |
| 2. The guardrail stays on | Drafted messages go through the same number check as cards: every figure must appear in the inputs. The word cap is per draft, set below (a message is longer than a 60-word card), and the cap is recorded in `docs/DECISIONS.md` |
| 3. No empty state | If the model fails, the page shows the template draft. If the user has no recurring charges, the page shows the sample explanation and the "Link a Bank" prompt instead of a blank list |
| 4. Suggest only | No cancelling, no calling, no clicking on a provider's site. Links open the provider's own cancellation page in a new tab, and the user does the rest. "I Cancelled It" only records what the user says |
| 5. Extension privacy | Untouched. The extension is not part of this feature. `CopilotContext` is not changed |
| 6. Secrets on the server | The model key stays in `packages/llm`. The page holds no keys |
| 7. Ranges | There are no probabilities here. Savings are plain arithmetic on the user's own charges ("$14.99 a month is $179.88 a year"), shown as exact sums with a note that they assume the charge stops |
| 8. Label mocks | Nothing new is mocked. Demo data is synthetic and the demo already says so. The cancellation catalog (below) is labeled "May be out of date" |
| 9. Confirm before saving | A status change (Keep, Cancelling, Cancelled) is a button the user presses, and cancelling is confirmed. A draft is never sent or saved without a press |
| 10. Sandbox only | Synthetic or Plaid sandbox data only |
| 11. One LLM wrapper | The draft calls go through `packages/llm/src/client.ts`. No provider SDK elsewhere |
| 12. Deterministic simulator | Not involved |

If any step below seems to need breaking one of these, stop and ask.

## Design

### 1. What counts as a subscription

A recurring charge is a **Subscription** or a **Bill**. This is a view over `RecurringCharge`, so no new category is added (the existing decision).

- **Bills** are charges tied to a liability or a necessity: rent and mortgage, loan and card payments, utilities, insurance, phone, internet, childcare. Rule: the charge's category is in the Needs bucket, or it matches an account with a `liability` due date (the same test `listUpcomingBills` already uses to drop covered streams).
- **Subscriptions** are everything else that repeats: streaming, music, software, news, gyms, memberships, cloud storage, apps, meal kits.
- The user can move a charge between the two. That choice is saved, and it wins over the rule.
- Bills still get a "Lower This Bill" action, because phone, internet and insurance are where negotiating pays. Subscriptions get "Cancel".

The split is deterministic and lives in `math-core`, with a table of tests, so the same input always lands in the same group.

### 2. Stable identity

`RecurringCharge` has no id. Add one, computed by the API, not stored: a short hash of `accountId` and the normalized merchant name (lowercase, punctuation and trailing store numbers removed). It stays the same across syncs, so user state can attach to it. Merchant normalization has its own tests, with cases such as `NETFLIX.COM`, `Netflix 8665`, and `NETFLIX INC`.

If the bank changes a merchant string, the id changes and the old state orphans. The API shows orphaned state as "Possible Match" for the user to confirm rather than guessing. This is rare and recorded as a known limit.

### 3. Numbers (all in `math-core`)

New file `packages/math-core/src/subscriptions.ts`, pure functions, tested beside it.

| Function | Gives |
| --- | --- |
| `monthlyCostCents(charge)` | Amount normalized by cadence: weekly ×52/12, biweekly ×26/12, semi-monthly ×2, monthly ×1, yearly ÷12. Integer cents, rounded once at the end. `unknown` cadence is excluded from totals and shown as "Cadence Unknown" |
| `annualCostCents(charge)` | `monthlyCostCents × 12`, computed from the exact cadence so it does not accumulate rounding |
| `totals(charges)` | Monthly and yearly totals for subscriptions and for bills, and subscription spend as a share of the user's monthly income when it is known |
| `priceChanges(history)` | Compares the latest charge with the one before it and with the one a year earlier. Flags a rise of more than 2% or $1, whichever is larger. Returns old amount, new amount, and the date it changed |
| `possibleDuplicates(charges)` | Two or more active subscriptions in the same group, from a small fixed list of groups (video streaming, music streaming, cloud storage, news). Flag, not verdict: the user may want both |
| `stillCharging(subscription, history, today)` | For a subscription marked Cancelled: true when a charge posted after the cancel date plus a grace window (the cadence, capped at 35 days) |
| `startedRecently(history, ledgerStart, today)` | True when the first charge is in the last 60 days and the ledger reaches back at least 45 days before it, so a long-running subscription does not look new just because the history is short. Flags "Started Recently". Skipped without history or a known ledger start |
| `savedSoFarCents(subscription, today)` | For a confirmed cancellation that stopped charging: monthly cost times the months since the last charge. Shown plainly, not as a forecast |

Rules for these figures:
- Money is integer cents. Rates are decimal fractions.
- Nothing is forecast beyond the next charge date. "If you cancel, you save $X a year" is the stated assumption, not a prediction.
- No usage data exists, so FinVantage never claims a subscription is "unused". The only flags are ones the charges themselves prove.

### 4. Flags shown on the page

| Flag | Meaning | Needs |
| --- | --- | --- |
| Price Went Up | Latest charge higher than the previous one or the one a year ago | Charge history |
| Possible Duplicate | Same group as another active subscription | Group list |
| Started Recently | First charge in the last 60 days | Charge history |
| Still Charging | Marked Cancelled, but a charge posted after the grace window | Charge history, user state |
| Annual Charge Coming | A yearly charge due in the next 30 days. These surprise people, and Rocket Money highlights them | `nextDate` |

A flag only appears when its inputs exist. With stream data but no history, the page shows no price flags and says nothing about them, rather than guessing.

### 5. Acting on a subscription

**Cancel.** For a subscription, "How to Cancel" opens a panel with:
1. The merchant's cancellation route from a **small curated catalog**: cancellation page URL, the channel (website, app store, phone), and one line on what to expect ("Cancel in Account, then Membership"). Catalog file: `packages/data/src/subscription-catalog.ts`, about 40 common merchants, each with a `lastChecked` date. The panel shows "May be out of date" and the date.
2. For anything not in the catalog, a generic guide by billing channel. Billing channel is read from the transaction (a charge from Apple or Google means cancel in the app store, not with the merchant). This channel guess is deterministic, from the payment descriptor, and can be wrong, so it is worded as a suggestion.
3. A **drafted message** ("Please cancel my subscription effective today and confirm by email") for providers that need one.

**Lower a bill.** For a bill whose own history shows a rise, "Ask for a Lower Bill" opens a drafted message or call script that cites the user's figures: "My bill went from $62.00 to $79.00 on June 3." Honest limit: FinVantage has no benchmark data for what a fair price is, so it never says "you overpay by X". The only claim is the user's own history, and the potential saving shown is getting back to the old price.

**Drafts.** The model words them, from figures `math-core` supplies:
- Input: merchant, current amount, previous amount, change date, cadence, the user's chosen action. No account numbers, no balances, no personal details beyond what the message needs.
- The template draft is the fallback and is also the default when the model is off. It is complete and usable on its own.
- Guardrail: every number in the draft must appear in the inputs, the same check the cards use, with a word cap for drafts of 120 words. The page shows a draft only after it passes, otherwise the template.
- Drafts are generated on request, never on page load, so loading the page costs no model call.

**Track.** The user can mark a subscription:

| Status | Set by | Effect |
| --- | --- | --- |
| Active | Default | Counted in totals |
| Keep | User | Counted, and flags are muted so it stops nagging |
| Cancelling | User, after confirming | Still counted until the next expected charge date passes |
| Cancelled | User, after confirming | Removed from the monthly total after the grace window; moves to "Cancelled" with "Saved So Far". If a charge posts anyway: **Still Charging** appears, with a drafted dispute message |

This is the one place FinVantage goes beyond a list: it checks the cancel worked, using charge data it already has.

### 6. The page

Route `/subscriptions`, added to the Intelligence group in `apps/web/src/lib/nav.ts`:

```ts
{ href: "/subscriptions", label: "Subscriptions", hint: "Find and trim recurring charges" },
```

The group label stays "Intelligence". The phone bar uses `NAV_ITEMS`, which derives from the groups, so it picks the item up. Check that the bar still fits on a phone width with a fifth Intelligence item.

Layout, top to bottom:

1. **Page header:** "Subscriptions", one line of body copy.
2. **Headline stats** using `Stat` and `CountUp`: Monthly Cost, Yearly Cost, Active Subscriptions, Share of Income. A "Could Save" figure appears only when there are flags, as the sum of the flagged items' yearly cost, labeled as an upper bound.
3. **Needs a Look:** the flagged items, most costly first, each with its flag chip and one primary action. This is the part that makes the page useful at a glance, so it sits above the full list.
4. **All Subscriptions:** a list of rows (`row-cascade`), each with the merchant, category icon (`CategoryIcon`), amount, cadence, next charge date, flag chips, and a menu: How to Cancel, Keep, Mark as Bill. Filter chips: All, Needs a Look, Cancelling, Cancelled. Sort by cost, next charge, or name.
5. **Bills:** the same rows for the bill group, with "Ask for a Lower Bill".
6. **Upcoming:** the next 30 days of charges in date order, so an annual charge never lands as a surprise.
7. **Cancelled:** what was cancelled, whether it stopped, and "Saved So Far".

Page rules from `apps/web/AGENTS.md`:
- Server component fetches through `api`; interactive parts in `*Client.tsx`.
- Cards lift, rows use `tile-lift`, the grid uses `page-cascade`, figures count up with `CountUp`, bars use `meter-fill`. Everything respects reduced motion.
- Title Case for labels, sentences for body copy and errors.
- Token classes only. Any new color token goes in both the light and dark blocks of `globals.css`.
- Works to phone width. Rows collapse to two lines; the menu becomes a bottom sheet.
- Refreshes on `useLiveEvents` so a synced charge appears without a reload.
- No figure is computed in the browser.

Empty states: no bank linked, no recurring found, nothing flagged, and nothing cancelled each get their own message with a next step. None is blank.

### 7. Where it connects

| Feature | Link |
| --- | --- |
| **Advisor** | New tool `get_subscriptions` returning the page's summary, so "what subscriptions can I cut" is answered from the same figures. The existing `get_recurring_and_bills` stays |
| **Overview** | A small "Subscriptions" card: monthly total and the count needing a look, linking to the page |
| **Reports** | The quarterly report adds subscription spend, change from last quarter, and what was cancelled |
| **Simulator** | Cancelling a subscription is a recurring saving. A later step can offer "Apply to a goal", which uses the existing scenario path and confirms before saving, as life events do |
| **Copilot** | Out of scope for now. A later idea: warn when a checkout is itself a recurring charge. That runs in the extension and touches the privacy rule, so it is its own decision |

## API and contracts

Contracts come first, and changes stay additive. In `packages/contracts/src/api.ts`:

| Route | Method and path | Returns |
| --- | --- | --- |
| `listSubscriptions` | `GET /v1/subscriptions` | `SubscriptionOverview`: totals, flags, and `Subscription[]` for subscriptions and bills |
| `getSubscription` | `GET /v1/subscriptions/:id` | One `Subscription` with its charge history |
| `updateSubscription` | `PATCH /v1/subscriptions/:id` | The updated `Subscription`. Body: `status` and `kind` (subscription or bill) |
| `draftSubscriptionMessage` | `POST /v1/subscriptions/:id/draft` | `{ text, source: "model" or "template" }`. Body: `action` (cancel, lower_bill, dispute) |

New schemas in `packages/contracts/src/subscription.ts`, PascalCase with same-named types:

- `Subscription`: `id`, `merchant`, `category`, `kind`, `amountCents`, `cadence`, `monthlyCents`, `annualCents`, `nextDate`, `accountId`, `status`, `flags`, `source`, and `lastChargeDate`.
- `SubscriptionFlag`: enum of the five flags above. A price flag carries `previousCents` and `changedOn`, so the page can show the figures without computing them.
- `SubscriptionOverview`: `totals` (monthly and yearly, for subscriptions and for bills), `shareOfIncome` (decimal fraction, or null), `subscriptions`, `bills`, `cancelled`.
- `SubscriptionStatus`: `active`, `keep`, `cancelling`, `cancelled`.
- `SubscriptionDraftRequest` and `SubscriptionDraft`.

Notes:
- The existing `RecurringCharge` is not changed in a breaking way. `Subscription` extends its fields. A response that drifts from its contract returns 500 `contract_violation`, so each route gets a test.
- `draftSubscriptionMessage` is a model route. Add it to `MODEL_ROUTES` in `apps/api/src/rate-limit.ts`, as the security review requires. Without that it would be an unlimited model call.
- Bodies keep the 64 KB cap and the existing input-length caps. Merchant names that reach a prompt are capped at 100 characters, as other names are.
- Guests and the shared demo user: `updateSubscription` follows the demo rules. The shared demo token is read-only, so a status change from it returns 403 `demo_read_only`, and the web client already recovers by starting a guest session. Guest sessions are private copies, so they can write.
- `apps/api/src/app.test.ts` gets a test for every route, through the real typed client.

## Data

**Read side:** nothing new. History comes from transactions already in the ledger (`listTransactions`), matched to a stream by account and normalized merchant. If `listRecurringStreams` is absent, the page works from `estimatedCharges` and shows fewer flags, labeled "Estimated" through the existing `source` field.

**Write side:** per-user subscription state (status, kind override, cancel date, note) is new storage. Following the existing split (`docs/DATA-MODEL.md`), user-entered app data and preferences are not bank data, so this does **not** go in the Plaid-shaped `recurring_stream` table. Proposal:

- A `SubscriptionStore` interface in `packages/data/src/stores.ts`, with a memory implementation by default and a MongoDB one in production, next to `SpendingStore`.
- One document per user, keyed by subscription id, so a state change is one small write.
- Agree it with Yao before building, because it changes the store set and `createStores`. The memory version needs no agreement and lets the page be built first.

**Demo data:** the generated demo profile (`packages/data/scripts/generate-demo.ts`) must include a good set of subscriptions, so the page is not thin at the demo: about 10 subscriptions, one with a price rise, one duplicate pair (two video services), one annual charge, one recent start, and one cancelled charge that kept charging. Regenerate the profile and check the totals by hand. Synthetic only.

## Build order

Each step ends with `npm run check` passing and, for UI steps, a look at the page at desktop and phone width.

1. **Math and contracts.** *Done 2026-11-19, on the `subscriptions` branch, uncommitted.* `subscription.ts` schemas, `math-core/src/subscriptions.ts` with 30 tests, merchant normalization with tests. No UI. This is where the numbers get proven. Routes are not added until step 2.
2. **Classification and API read.** *Done 2026-11-19, on the `subscriptions` branch.* Kind rule, stable id, `listSubscriptions` and `getSubscription` from existing data, and tests in `app.test.ts`. The builder is `apps/api/src/spending/subscriptions.ts` (pure, tested on its own); the recurring sources moved out of `routes/spending.ts` into `spending/recurring.ts` so both routes share them. Every status is `active` and `cancelled` is empty until step 5 stores the user's choices.
3. **Demo data.** *Done 2026-11-19, on the `subscriptions` branch.* The generator now makes StreamFlix rise from $11.99 to $15.49 in October, adds Showreel (a second streaming service that started in October) and Skyvault Storage (a yearly stream renewing 18 days after the as-of date), and regenerates `fixtures/planner.json` as of 2026-11-08. Price up, possible duplicate, started recently and annual charge coming all fire; still charging waits for step 5. **Deviation from the plan:** six subscriptions, not about ten. The demo is at exactly 500 transactions, the most the Transactions page loads, and a monthly subscription costs 11 of them. The net worth moves from $39,500.00 to $39,480.02, because the Travel Rewards Card balance is derived from its spending. Production needs a reseed (`npm run seed:maincloud -w @finvantage/spacetime`).
4. **Page, read-only.** *Done 2026-11-19, on the `subscriptions` branch.* Nav item (after Life Events), header, four stat tiles, Needs a Look, All Subscriptions and Bills with a filter and sort, Upcoming Charges, and the empty state. Looked at in the running app at 1360, 768, 390 and 360 px; the first phone pass found horizontal overflow from auto-sized single-column grids, fixed with `grid-cols-1`. **Left for later steps:** the **Could Save** tile (no sound definition yet: a flagged item's whole cost overstates what a price rise or duplicate costs), the Cancelling and Cancelled filter chips and the Cancelled list (step 5), and any action buttons (step 6), so no control on the page is dead. **Not exercised in the browser:** the empty state, because a new account starts with a copy of the demo profile. The loading state is the app's default, as no dashboard page has its own `loading.tsx`, and an API outage is handled by `(app)/error.tsx`.
5. **State.** `SubscriptionStore` (memory), `updateSubscription`, Keep and mark-as-bill, Cancelling and Cancelled with confirmation, Still Charging.
6. **Guide and drafts.** The curated catalog, channel detection, template drafts, then `draftSubscriptionMessage` with the model and the guardrail, plus its rate-limit entry.
7. **Connections.** Advisor tool, Overview card, Reports line.
8. **Production storage.** MongoDB `SubscriptionStore`, after agreement with the platform owner.
9. **Polish.** Motion, reduced motion, phone layout, accessibility pass, the table view for any chart.

Steps 1 to 4 deliver a working read-only page and need no agreement from anyone. Steps 5 and 8 need the storage decision.

## Tests

- **math-core:** cadence normalization for every cadence, including rounding at the cent; price change at the 2% and $1 thresholds on both sides; duplicate groups; `stillCharging` just inside and just outside the grace window; empty history; a single charge; `unknown` cadence.
- **Merchant normalization:** the table of messy descriptors above, plus a case that must not merge (two different merchants with similar names).
- **Classification:** bill versus subscription for each Needs category, a liability account match, and a user override that wins.
- **API:** each route through the typed client, `contract_violation` not raised, the demo token refused on writes, a guest write accepted, the rate limit on the draft route, and body size cap.
- **Guardrail:** a draft containing a figure not in the inputs falls back to the template; a draft over the word cap does too; look-alike digits are normalized, as the card check does.
- **Privacy:** the draft prompt contains none of account number, balance or name. A test builds the prompt and checks its fields.
- **Web:** `src/lib` modules get unit tests. The page itself is checked by running it.

## Done means

- The Subscriptions tab appears under Intelligence, on desktop and the phone bar.
- Subscriptions and bills are listed separately with monthly and yearly cost, cadence, and next charge date.
- Totals match a hand calculation from the demo profile.
- Each flag fires on the demo data where it should and not where it shouldn't.
- A user can mark an item Keep, Cancelling or Cancelled, each with confirmation, and the state survives a reload.
- A cancelled item that charges again shows Still Charging.
- "How to Cancel" shows a route for catalog merchants and a generic guide otherwise.
- A drafted message passes the number check or falls back to the template, and a model failure never leaves the page empty.
- No figure is computed in the browser.
- Nothing cancels, negotiates, pays, or clicks anything for the user.
- `npm run check` passes.

## Out of scope

- Doing the cancellation or negotiation for the user, and any fee on savings.
- Calling providers, sending email, or filling a provider's form.
- Detecting usage, so no "you haven't used this" claims.
- Benchmarking a fair price for a bill, because there is no data for it.
- Virtual cards, card locking, or blocking a charge.
- Free trial reminders from the extension or from page content.
- Production bank connections.

## Risks and open questions

| Item | Note |
| --- | --- |
| **Cancellation catalog goes stale** | Providers change their pages. Mitigation: `lastChecked` date, "May be out of date" label, a generic fallback, and a small list. Open: who owns refreshing it |
| **Streams versus estimate** | Without bank streams the fallback assumes monthly and has no history, so most flags are silent. Open: whether the live demo runs with streams on |
| **Merchant string changes** | Id changes orphan state. Mitigation above. Open: whether to fuzzy-match |
| **App store and PayPal charges** | Many subscriptions bill through a middleman and appear as one opaque row. They are shown with the middleman's name and the guide says to cancel there |
| **A flag can be wrong** | Price change might be tax, a plan change, or a usage-based bill. Wording says "went up", never "overcharged" |
| **Draft quality** | A bad draft is possible. The user reads and edits before sending, and nothing sends itself |
| **Storage owner** | `SubscriptionStore` changes the store set. Needs agreement with the platform owner (Yao) before step 8 |
| **Phone bar width** | A fifth Intelligence item may crowd the bar. Check at 360 px |
| **Rate limits** | The draft route is a model route and counts against model quotas |

## Decisions to record in `docs/DECISIONS.md`

1. Subscriptions are a view over recurring charges, split into Subscriptions and Bills, with a user override (extends the 2026-11-08 decision).
2. FinVantage suggests and tracks cancellations but never performs them, and takes no fee, unlike Rocket Money's concierge. Reason: rule 4.
3. Subscription state is stored apart from the Plaid-shaped tables.
4. Drafted messages: word cap 120, same number check as cards, template fallback, model call only on request.
5. No usage claims and no fair-price claims, because the data does not exist.

## Files this will touch

| Path | Change |
| --- | --- |
| `packages/contracts/src/subscription.ts` | New schemas |
| `packages/contracts/src/api.ts` | Four routes |
| `packages/math-core/src/subscriptions.ts` and test | New |
| `packages/data/src/stores.ts`, memory store, `createStores` | `SubscriptionStore` |
| `packages/data/src/subscription-catalog.ts` | New curated catalog |
| `packages/data/scripts/generate-demo.ts` and the generated profile | Subscription-rich demo data |
| `packages/llm` | Draft prompt, template draft, guardrail use |
| `apps/api/src/routes/subscriptions.ts`, `app.ts`, `rate-limit.ts`, `app.test.ts` | Routes, mount, model-route entry, tests |
| `apps/api/src/advisor/tools.ts` | `get_subscriptions` tool |
| `apps/web/src/lib/nav.ts` | Nav item |
| `apps/web/src/app/(app)/subscriptions/` | Page and client parts |
| `apps/web/src/app/(app)/app/page.tsx` | Overview card |
| `apps/web/AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, this brief | Updated as it lands |

## What is a stub when this ships

State plainly in the PR: the cancellation catalog is a hand-written sample, not a maintained dataset; negotiation drafts have no pricing benchmark behind them; production storage for subscription state is memory-only until the MongoDB store lands; and nothing is cancelled or negotiated on the user's behalf by design.
