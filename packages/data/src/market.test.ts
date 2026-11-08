import assert from "node:assert/strict";
import { test } from "node:test";
import { INVESTMENT_RANGES } from "@finvantage/contracts";
import { SampleMarketData } from "./market";
import { demoInvestments } from "./profile";

const input = { today: "2026-11-08", now: "2026-11-08T18:00:00.000Z" };

test("sample market data is repeatable", async () => {
  assert.deepEqual(await new SampleMarketData().snapshot(input), await new SampleMarketData().snapshot(input));
});

test("on a weekend the market is closed and prices are from Friday", async () => {
  const market = await new SampleMarketData().snapshot(input);
  assert.equal(market.marketStatus, "closed");
  assert.equal(market.pricesAsOf, "2026-11-06");
});

test("the market reads open during weekday trading hours", async () => {
  const market = await new SampleMarketData().snapshot({ today: "2026-11-09", now: "2026-11-09T15:00:00.000Z" });
  assert.equal(market.marketStatus, "open");
  assert.equal(market.pricesAsOf, "2026-11-09");
});

test("every range ends on the latest price, and 1D starts at the previous close", async () => {
  const market = await new SampleMarketData().snapshot(input);
  for (const [symbol, security] of Object.entries(market.securities)) {
    for (const range of INVESTMENT_RANGES) {
      const path = market.series[range].pricesCents[symbol]!;
      assert.equal(path.length, market.series[range].labels.length);
      assert.equal(path[path.length - 1], security.priceCents, `${symbol} ${range}`);
    }
    assert.equal(market.series["1D"].pricesCents[symbol]![0], security.previousCloseCents, symbol);
    assert.ok(security.week52LowCents <= security.priceCents && security.priceCents <= security.week52HighCents, symbol);
  }
});

test("sample prices match the demo holdings' close prices", async () => {
  const market = await new SampleMarketData().snapshot(input);
  const { positions } = demoInvestments();
  for (const position of positions) {
    if (position.symbol === null) continue;
    assert.equal(market.securities[position.symbol]?.priceCents, position.lastPriceCents, position.symbol);
  }
});

test("the demo profile has a Roth IRA, a 401(k) and a Brokerage account", () => {
  assert.deepEqual(demoInvestments().accounts.map((a) => a.name), ["Roth IRA", "401(k)", "Brokerage"]);
});
