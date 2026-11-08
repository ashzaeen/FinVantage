import assert from "node:assert/strict";
import { test } from "node:test";
import type { CopilotContext } from "@finvantage/contracts";
import { buildSnapshot, loadDemoProfileSource, mapItemSnapshot, type DemoProfileSource } from "@finvantage/data";
import { cardText, templateCard } from "@finvantage/llm";
import { computeCopilotMetrics, purchaseForSimulator } from "@finvantage/math-core";
import { evaluatePurchase } from "@finvantage/simulator";

/*
 * The Copilot is driven by the user's bank data, not by the demo profile. Each test builds a
 * different person in Plaid's exact format and runs one purchase through the same path the API
 * route uses: Plaid snapshot -> mapItemSnapshot -> buildSnapshot -> simulator -> math core -> card.
 * Nothing here names the demo's goals or cards except where the demo profile itself is under test.
 */

const laptop: CopilotContext = { pageType: "checkout", itemType: "retail_purchase", priceCents: 149_900, merchant: "Amazon" };
const TODAY = "2026-11-07";

function copilotFor(source: DemoProfileSource, context: CopilotContext = laptop) {
  const accounts = source.bank.flatMap((item) => mapItemSnapshot(item, source.user.id, source.accountDetails).accounts);
  const snapshot = buildSnapshot(source.user, accounts, source.income, TODAY);
  const inputs = { snapshot, goals: source.goals, lifeEvents: source.lifeEvents, whatIf: null };
  const metrics = computeCopilotMetrics(snapshot, context, evaluatePurchase(inputs, purchaseForSimulator(snapshot, context, source.goals)), source.goals);
  return { metrics, card: templateCard(context, metrics) };
}

/** Edits one Plaid account's balances, in Plaid's dollars. */
function setBalance(source: DemoProfileSource, accountId: string, dollars: number) {
  for (const item of source.bank) {
    for (const account of item.accounts) {
      if (account.account_id === accountId) {
        account.balances.current = dollars;
        if (account.balances.available !== null) account.balances.available = dollars;
      }
    }
  }
}

test("the demo user: the laptop dips under their cushion and nudges a goal; their 0% card fixes it", () => {
  const { metrics, card } = copilotFor(loadDemoProfileSource());
  assert.equal(metrics.verdict, "caution");
  assert.equal(metrics.liquidBufferAfterCents, 190_100, "$3,400 - $1,499");
  // $900 of the $1,499 is spare checking; only $599 comes out of goal savings.
  assert.notEqual(metrics.headline.kind, "none");
  assert.match(card.smartMove, /\$900 now.*\$599 on your 0% Promo Card/);
});

test("a different person: more cash, no promo card, a pricier card, other goals -> the advice follows them", () => {
  const source = loadDemoProfileSource();
  setBalance(source, "acc_checking", 15_000);
  for (const item of source.bank) {
    // No 0% promo card at all, and the remaining card is renamed with a higher APR.
    item.accounts = item.accounts.filter((a) => a.account_id !== "acc_promo");
    item.liabilities.credit = (item.liabilities.credit ?? []).filter((c) => c.account_id !== "acc_promo");
    for (const a of item.accounts) if (a.account_id === "acc_card") a.name = "Platinum Rewards";
    for (const c of item.liabilities.credit ?? []) for (const apr of c.aprs) apr.apr_percentage = 29.99;
  }
  delete source.accountDetails.acc_promo;
  source.user.preferences.bufferTargetCents = 100_000;
  source.goals = [{ ...source.goals[0]!, id: "goal_wedding", name: "Wedding", priorityRank: 1 }];

  // $15,000 in checking, $14,000 above the cushion: the laptop comes out of idle cash, so no goal
  // moves and nothing needs splitting.
  const laptopCard = copilotFor(source);
  assert.equal(laptopCard.metrics.verdict, "good");
  assert.equal(laptopCard.metrics.headline.kind, "none");
  assert.equal(laptopCard.metrics.splitPlan, null);

  // A small purchase fits, and the advice uses this person's own card, rate, and cushion.
  const { metrics, card } = copilotFor(source, { ...laptop, priceCents: 4_999 });
  assert.equal(metrics.verdict, "good");
  assert.match(card.smartMove, /Platinum Rewards/, "steers away from this person's own card, by its Plaid name");
  assert.match(card.smartMove, /29\.99%/, "at this person's own APR, as the lender states it");
  assert.match(card.tradeOff, /\$1,000 safety cushion/, "with this person's own cushion");
  for (const c of [laptopCard.card, card]) {
    assert.doesNotMatch(cardText(c), /Japan|Promo Card|\$2,500/, "nothing from the demo profile leaks in");
  }
});

test("a person with little in checking: the card says how short they are", () => {
  const source = loadDemoProfileSource();
  setBalance(source, "acc_checking", 900);
  const { metrics, card } = copilotFor(source);
  assert.equal(metrics.verdict, "caution");
  assert.match(card.tradeOff, /you'd be \$599 short/);
});

test("the same person, a cheaper item: the verdict flips to good", () => {
  const { metrics } = copilotFor(loadDemoProfileSource(), { ...laptop, priceCents: 1_500 });
  assert.equal(metrics.verdict, "good");
});
