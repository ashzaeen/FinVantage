# Subscriptions: acting for the user

**Owner:** Ashzaeen (dashboard), with Yao for storage and email infrastructure. **Tier:** P2. **Status:** plan, written 2026-11-20. **Nothing here is built.** **Builds on:** `docs/workstreams/subscriptions.md` (done). **PRD:** section 4, feature 5 (recurring expense detection), and the "suggest only" principle that this plan proposes to narrow.

## Decision needed first

Today FinVantage **suggests and tracks, and never acts**: the cancellation guide is steps for the user to follow, and a drafted message is text for the user to copy and send. That is root rule 4, "Suggest only", and `docs/workstreams/subscriptions.md` lists it as a deliberate difference from Rocket Money.

The team wants FinVantage to **act as well**. That changes a product rule, so **nobody builds anything until the decisions in Phase 0 are made.** Root `AGENTS.md`: "If a task seems to need breaking one, stop and ask."

## What Rocket Money does

Rocket Money detects subscriptions, then offers a **cancellation concierge** (staff cancel for you) and **bill negotiation** (staff negotiate, for a fee of 30% to 60% of what is saved). There is no universal automated way to cancel a subscription: every merchant has its own email address, web flow or phone line. Rocket Money's reach comes mostly from people working with the user's authorization, not from an API. (This describes the product as `subscriptions.md` recorded it on 2026-11-19. It has not been re-checked against their site.)

So "acting" is not one feature. It is a ladder of options with very different cost and risk.

## Options

| Level | What FinVantage does | Works for | Risk | Effort |
|---|---|---|---|---|
| **1. Approve and send** | Writes the cancellation email, the user presses Approve, FinVantage sends it. The existing **Still Charging** check then confirms whether the charge stopped | Merchants that accept a cancellation by email | Low | About 1 week |
| **2. Assisted cancel** | The browser extension walks the merchant's cancel flow in the **user's own logged-in browser**, and the user approves every step. No passwords are stored | Merchants whose cancel flow is a web page | Medium | 2 to 3 weeks, then ongoing upkeep as sites change |
| **3. Concierge** | People, or a partner, cancel on the user's behalf | Anything | High | Operations, staffing, legal review, and a fee model. Not an engineering task |
| **4. Bill negotiation** | A negotiator or voice agent calls the provider for the user | Bills | High | Needs written authorization, call infrastructure, and a fee model |

**Not recommended:** logging in to merchants with stored user passwords. It is the riskiest option, sites actively block it, and it conflicts with rule 6.

## Recommendation

Build **Phase 1 (approve and send)**. Decide on Phase 2 after Phase 1 shows how many catalog merchants it actually covers. Treat Phases 3 and 4 as business decisions.

## Rules this touches

| Rule | Today | Proposed change |
|---|---|---|
| **4. Suggest only** | Nothing moves money, applies for credit, or clicks anything on a host page | "FinVantage acts only on an **explicit, per-action approval** by the user, never moves money, and records every action." Cancelling a subscription by email moves no money |
| **5. Extension privacy** | Only `pageType`, `itemType`, `priceCents`, `merchant` leave the browser. Nothing is clicked on a host page | **Phase 1 needs no change.** Phase 2 needs an explicit exception: the extension may act on the merchant's cancel page the user opened, step by step, and sends back only the outcome |
| **6. Secrets stay on the server** | The web app and extension never hold model or bank keys | Mail credentials stay on the server. Phase 1 uses FinVantage's own sender, so no user mailbox token exists |
| **10. Sandbox only** | Synthetic or Plaid sandbox data. No production bank connections | Acting on real merchants is production. **Keep sending to a test inbox until a legal review is done.** The rule is not relaxed by this plan |
| **1 and 2. Math first, guardrail on** | Every figure is computed in code, and text is checked so each number appears in the inputs | Unchanged. A sent message goes through the same check as a draft, and the template is the fallback |
| **9. Confirm before saving** | Parsing never saves | Same idea: **an action is never taken from a draft alone.** Approving is a separate press |

## Phase 0: decisions (about 2 days, before any code)

1. Amend rule 4 as above, in `AGENTS.md` and `docs/PRD.md`, and record it in `docs/DECISIONS.md`.
2. Decide whether Phase 2 is wanted at all (rule 5 exception).
3. Name an owner for the legal and compliance check (see Risks).
4. Agree with Yao: a new store (below), the sending address and domain, and who can switch the feature off.
5. Decide the user-facing wording for what FinVantage does and does not do on their behalf, and where authorization is shown.

## Phase 1: approve and send

### How it works

1. The user opens Manage on a subscription and chooses **Cancel for Me** (new, beside How to Cancel). Only merchants whose catalog entry has a verified cancellation email address are offered it.
2. FinVantage drafts the message with the existing draft route (`POST /v1/subscriptions/:id/draft`), shows the **exact text, the exact recipient and the reply-to address**, and creates an action request in state `drafted`.
3. The user presses **Approve and Send**. FinVantage sends it and the request moves to `sent`.
4. FinVantage watches the ledger. When the next expected charge date passes with no charge, the request moves to `confirmed`. If a charge posts after the send, it moves to `still_charging`, and the existing dispute draft is offered. The user can also mark it `cancelled` or `failed` by hand.

### Why the recipient is not user-supplied

An endpoint that sends email to an address the caller chooses is a spam relay. The report email already follows the opposite rule: it goes **only to the address the server picks**, and guests and the shared demo user cannot email reports (`apps/api/AGENTS.md`, Auth). The same discipline applies here:

- The **recipient comes only from the catalog** (`packages/data/src/subscription-catalog.ts`), a server-side list. A request body never contains an address.
- Every catalog address needs a `lastChecked` date and a source. None exists today: the catalog has cancellation page URLs and steps, no email addresses. **Collecting and verifying these addresses is real work and decides the coverage of Phase 1.**
- Only **signed-in, non-guest users** may send. The shared demo token stays read-only. Guests can draft and see the preview but cannot send.
- The sender is a FinVantage address with the user's address as Reply-To. Sending from the user's own mailbox needs Gmail's restricted-scope verification, which is slow, so it is out of scope. Some merchants require the message to come from the account's own address. For those the request ends in a copyable message, as today.

### Data (new store, needs Yao's agreement)

A `SubscriptionActionStore` next to `SubscriptionStore` (memory by default, MongoDB with `DOCUMENT_BACKEND=mongodb`, the same fail-closed rule as the other stores). Collection `subscription_actions`, one document per request:

```jsonc
{
  "id": "act_…", "userId": "…", "subscriptionId": "sub_…",
  "action": "cancel",                       // later: "lower_bill"
  "channel": "email",                       // later: "assisted_browser"
  "status": "drafted | approved | sent | confirmed | still_charging | failed | withdrawn",
  "merchant": "StreamFlix",
  "recipient": "…",                         // from the catalog, copied for the record
  "replyTo": "…",
  "subject": "…", "body": "…",              // exactly what was shown and approved
  "bodySource": "model | template",
  "approvedAt": "…", "sentAt": "…", "messageId": "…",
  "outcomeCheckedOn": "…", "createdAt": "…", "updatedAt": "…"
}
```

This is the audit log. Keep the approved text unchanged after approval.

### API (additive contracts, `packages/contracts/src/api.ts`)

| Route | Purpose |
|---|---|
| `POST /v1/subscriptions/:id/actions` | Create a `drafted` request. Body: `action`. Returns the text, recipient and reply-to to show |
| `POST /v1/subscription-actions/:id/approve` | The approval press. Sends the message. Idempotent: a second press never sends twice |
| `POST /v1/subscription-actions/:id/withdraw` | Cancel a request before it is sent |
| `GET /v1/subscription-actions` and `/:id` | History and status |

Add a general send method to the mail client (`MailClient` in `apps/api/src/reporting/artifacts.ts` only has `sendReport`). Add the approve route to a new, **tight rate limit** in `apps/api/src/rate-limit.ts`, per user and per IP, in addition to the draft route's model limit.

### Page

- **Cancel for Me** in Manage, a review step that shows the full message, the recipient and the reply-to, and the **Approve and Send** button with plain wording: "FinVantage will send this email for you. It does not cancel anything itself. The company decides."
- A status line on the row: Draft, Sent, Charge stopped, Still charging.
- A history list under Cancelled.

### Safeguards

- **Per-action approval**: no automatic sends, no batch "cancel all".
- **Idempotency key** on approve, and a database check that a request is sent at most once.
- **Number check** on the final text (existing guardrail). The template is the fallback.
- **Kill switch**: an env flag that turns sending off and leaves the draft and copy flow working.
- **Rate limits** and a **daily cap** per user.
- **Test mode**: unless production sending is explicitly enabled, every message goes to a test inbox, and the UI says so.
- **Logging** of every state change. No full message bodies in application logs.
- **Verify, don't assume**: "sent" is never shown as "cancelled". Only the ledger proves it.

### Tests

- Contract and route tests through the typed client: create, approve, withdraw, history, `contract_violation` not raised.
- The demo token and guests cannot approve. A request body with an address is ignored or rejected.
- Approve twice sends once. Approve after withdraw is refused.
- Outcome tracking: charge stops, charge continues, no data yet.
- Guardrail: an invented figure falls back to the template.
- Mail client tested with the mock provider, never a real send.
- Memory store and Mongo store both pass the same store tests.

### Done means (Phase 1)

- A signed-in user can approve and send a cancellation email for a catalog merchant that has a verified address, to the test inbox, and see its status.
- The same request cannot be sent twice, and guests and the demo user cannot send.
- The outcome is shown from the ledger, not from the send.
- `npm run check` passes, and the UI was run and looked at on desktop and phone.
- `AGENTS.md`, `docs/DECISIONS.md` and the PRD wording are updated, and what is still a stub is stated plainly.

## Phase 2: assisted cancel in the browser (optional)

The extension opens or recognizes the merchant's cancel page in the user's own tab, highlights the next control and explains it, and the user presses it. Possibly with the extension filling a form field the user has already approved. **It never stores a password, never acts without a press, and sends back only an outcome** (`completed`, `blocked`, `abandoned`).

Before starting: the rule 5 exception, a short list of merchants (start with 3), a recorded flow for each, a way to detect when a flow has changed, and a plan for upkeep, because merchants change their pages often and a flow that silently breaks is worse than no flow. Estimated 2 to 3 weeks for three merchants, with ongoing cost.

## Phases 3 and 4: concierge and negotiation

Out of engineering scope until the business decisions are made: who does the work, what liability FinVantage takes on, whether and how it charges (Rocket Money's fee is 30% to 60% of savings), and the written authorization the user must give. A partner may be cheaper than staff, but no partner has been evaluated.

## Timeline and the 2026-12-03 presentation

The presentation is 13 days after this plan. **Phase 1 against a test inbox is the only realistic part to show**, and only if Phase 0 is decided in the first two days. Do not demo a real cancellation. The honest framing is "we draft, you approve, and we send it and watch whether it worked", for the merchants we have verified addresses for, not "we cancel everything for you".

## Risks and open questions

- **Law and consumer protection.** Authorization, impersonation, and cancellation rules vary by region and merchant. None has been checked. Get a legal review before real merchants are involved.
- **Merchants that reject third-party senders.** Many require the account holder's own address. Phase 1 will not work for them, and the plan falls back to copy and send.
- **Address coverage.** There is no verified email list yet. If only a few merchants accept email, Phase 1 looks thin. Measure this first.
- **Spam and abuse.** A send endpoint is a target. Recipients come only from the catalog, and the limits and caps above matter.
- **A "sent" that the merchant ignores.** The ledger is the only truth, so the status must say "waiting" until it can say otherwise.
- **Storing message text.** It contains the user's merchant, amounts and reply address. Decide retention with Yao.
- **Liability if a message is wrong or sent in error.** Per-action approval and the unchanged approved text are the main protections.

## Out of scope

Sending from the user's own mailbox, phone calls, stored merchant passwords, paying or disputing charges with the bank, applying for credit, and any automatic or bulk action.

## Files this will touch (Phase 1)

`packages/contracts/src/subscription.ts` and `api.ts`, a new `packages/data/src/subscription-actions.ts` and `mongo/` implementation, `packages/data/src/subscription-catalog.ts` (verified addresses), `apps/api/src/routes/subscriptions.ts` (or a new route file), `apps/api/src/reporting/artifacts.ts` (mail client send method), `apps/api/src/rate-limit.ts`, `apps/api/src/deps.ts`, `apps/web/src/app/(app)/subscriptions/SubscriptionActions.tsx`, `AGENTS.md`, `docs/PRD.md` and `docs/DECISIONS.md`.

## What is a stub when this ships

State plainly: sending goes to a test inbox until production sending is enabled and legally reviewed; the catalog's email addresses are a small, hand-collected, unverified-against-merchants list; and "sent" never means "cancelled".
