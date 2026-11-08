import assert from "node:assert/strict";
import { test } from "node:test";
import { INVESTMENT_RANGES } from "@finvantage/contracts";
import { MARKET_SYMBOLS } from "./market";
import { LiveMarketData, nyInstant, paragraphs } from "./market-live";

const SUNDAY = { today: "2026-11-08", now: "2026-11-08T18:00:00.000Z" };
const STOCKS = MARKET_SYMBOLS.filter((s) => s.assetClass !== "crypto").map((s) => s.symbol);
const CRYPTO = MARKET_SYMBOLS.filter((s) => s.assetClass === "crypto").map((s) => s.symbol);

function days(from: string, to: string, weekdaysOnly: boolean): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (!weekdaysOnly || (d.getUTCDay() !== 0 && d.getUTCDay() !== 6)) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const STOCK_DAYS = days("2025-09-01", "2026-11-06", true);
const CRYPTO_DAYS = days("2025-09-01", "2026-11-08", false);
const base = (symbol: string) => 50 + symbol.charCodeAt(0);
const close = (symbol: string, i: number) => base(symbol) + i / 10;

/** Canned answers for every endpoint the provider calls, keyed by path. */
function feed(overrides: Record<string, () => Response> = {}) {
  const calls: string[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const fake = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    const override = overrides[url.pathname];
    if (override) return override();
    const params = url.searchParams;
    switch (url.pathname) {
      case "/v2/stocks/bars":
        if (params.get("timeframe") === "1Day") {
          return json({ bars: Object.fromEntries(STOCKS.map((s) => [s, STOCK_DAYS.map((d, i) => ({ t: `${d}T05:00:00Z`, c: close(s, i) }))])), next_page_token: null });
        }
        // Intraday bars only for SPY and AAPL, through the Friday session.
        return json({
          bars: Object.fromEntries(
            ["SPY", "AAPL"].map((s) => [s, Array.from({ length: 26 }, (_, i) => ({ t: new Date(Date.parse("2026-11-06T14:30:00Z") + i * 900_000).toISOString(), c: base(s) + 100 + i }))]),
          ),
          next_page_token: null,
        });
      case "/v1beta3/crypto/us/bars":
        if (params.get("timeframe") === "1Day") {
          return json({ bars: Object.fromEntries(CRYPTO.map((s) => [`${s}/USD`, CRYPTO_DAYS.map((d, i) => ({ t: `${d}T00:00:00Z`, c: close(s, i) * 1000 }))])) });
        }
        return json({ bars: {} });
      case "/v2/stocks/snapshots":
        return json(
          Object.fromEntries(
            STOCKS.map((s) => [
              s,
              { latestTrade: { p: 999 }, dailyBar: { t: "2026-11-06T05:00:00Z", c: close(s, STOCK_DAYS.length - 1) }, prevDailyBar: { t: "2026-11-05T05:00:00Z", c: close(s, STOCK_DAYS.length - 2) } },
            ]),
          ),
        );
      case "/v1beta3/crypto/us/snapshots":
        return json({ snapshots: Object.fromEntries(CRYPTO.map((s) => [`${s}/USD`, { latestTrade: { p: 70_123.45 }, dailyBar: { t: "2026-11-08T00:00:00Z", c: 70_000 }, prevDailyBar: { t: "2026-11-07T00:00:00Z", c: 69_000 } }])) });
      case "/v1/corporate-actions":
        return json({ corporate_actions: { cash_dividends: [{ symbol: "AAPL", rate: 0.26, ex_date: "2026-02-09" }, { symbol: "AAPL", rate: 0.27, ex_date: "2026-05-11" }] } });
      case "/v1beta1/news":
        return json({
          news: [
            { id: 1, headline: "Apple &amp; friends rally", source: "benzinga", created_at: "2026-11-08T03:00:00Z", summary: "", content: '<p class="x">First <strong>paragraph</strong>.</p><p>Second&#39;s.</p>', url: "https://example.com/a" },
            { id: 2, headline: "Summary only", source: "benzinga", created_at: "2026-11-07T15:00:00Z", summary: "Just a summary.", content: "", url: "" },
            { id: 3, headline: "Nothing to read", source: "benzinga", created_at: "2026-11-07T15:00:00Z", summary: "", content: "", url: "https://example.com/c" },
          ],
        });
      case "/stable/key-metrics-ttm":
        return json([{ marketCap: 4_000_000_000_000, earningsYieldTTM: 0.025 }]);
      case "/stable/quote":
        return json([{ marketCap: 1_500_000_000_000 }]);
      default:
        return new Response("not found", { status: 404 });
    }
  };
  return { calls, fetch: fake as typeof fetch };
}

const provider = (fetch: typeof globalThis.fetch, warnings: string[] = []) =>
  new LiveMarketData({ alpacaKeyId: "id", alpacaSecretKey: "secret", fmpApiKey: "fmp", fetch, warn: (m) => warnings.push(m) });

test("Alpaca and FMP answers become a live snapshot", async () => {
  const market = await provider(feed().fetch).snapshot(SUNDAY);
  assert.equal(market.source, "live");
  assert.equal(market.marketStatus, "closed");
  assert.equal(market.pricesAsOf, "2026-11-06");

  const aapl = market.securities.AAPL!;
  // Closed market: the official close, not the after-hours trade.
  assert.equal(aapl.priceCents, Math.round(close("AAPL", STOCK_DAYS.length - 1) * 100));
  assert.equal(aapl.previousCloseCents, Math.round(close("AAPL", STOCK_DAYS.length - 2) * 100));
  assert.equal(aapl.marketCapCents, 400_000_000_000_000);
  assert.equal(aapl.peRatio, 40);
  assert.equal(aapl.dividendsYtdPerShareCents, 53);
  assert.equal(market.securities.VTI!.marketCapCents, null, "funds have no market cap");
  assert.equal(market.securities.VTI!.peRatio, null);
  // Crypto trades on weekends, so its latest trade is its price.
  assert.equal(market.securities.BTC!.priceCents, 7_012_345);
  assert.equal(market.securities.BTC!.marketCapCents, 150_000_000_000_000);

  for (const [symbol, security] of Object.entries(market.securities)) {
    for (const range of INVESTMENT_RANGES) {
      const path = market.series[range].pricesCents[symbol]!;
      assert.equal(path.length, market.series[range].labels.length, `${symbol} ${range}`);
      assert.equal(path[path.length - 1], security.priceCents, `${symbol} ${range}`);
    }
    assert.equal(market.series["1D"].pricesCents[symbol]![0], security.previousCloseCents, symbol);
    assert.ok(security.week52LowCents <= security.priceCents && security.priceCents <= security.week52HighCents, symbol);
  }
  assert.equal(market.series["1D"].labels[0], "2026-11-06T09:30");
  assert.equal(market.series["1D"].labels.at(-1), "2026-11-06T16:00");
  // 09:45 is the close of the 09:30 bar.
  assert.equal(market.series["1D"].pricesCents.SPY![1], Math.round((base("SPY") + 100) * 100));
  assert.equal(market.series["1M"].labels.at(-1), "2026-11-06");

  assert.deepEqual(
    market.news.map((n) => [n.title, n.source, n.publishedOn, n.body, n.url]),
    [
      ["Apple & friends rally", "Benzinga", "2026-11-07", ["First paragraph.", "Second's."], "https://example.com/a"],
      ["Summary only", "Benzinga", "2026-11-07", ["Just a summary."], null],
    ],
  );
});

test("while the market is open, prices are the latest trade and 1D stops at now", async () => {
  const market = await provider(feed().fetch).snapshot({ today: "2026-11-06", now: "2026-11-06T16:05:00.000Z" });
  assert.equal(market.marketStatus, "open");
  assert.equal(market.securities.AAPL!.priceCents, 99_900);
  assert.equal(market.series["1D"].labels.at(-1), "2026-11-06T11:00");
});

test("snapshots are cached for a while", async () => {
  const { calls, fetch } = feed();
  const live = provider(fetch);
  await live.snapshot(SUNDAY);
  const count = calls.length;
  await live.snapshot({ ...SUNDAY, now: "2026-11-08T18:05:00.000Z" });
  assert.equal(calls.length, count);
  await live.snapshot({ ...SUNDAY, now: "2026-11-08T18:15:00.000Z" });
  assert.ok(calls.length > count, "refreshes after ten minutes when closed");
  assert.ok(!calls.slice(count).includes("/stable/key-metrics-ttm"), "fundamentals are fetched once a day");
});

test("a failed refresh keeps the last good prices", async () => {
  let down = false;
  const healthy = feed();
  const warnings: string[] = [];
  const live = provider((async (input: string | URL | Request) => (down ? new Response("", { status: 503 }) : healthy.fetch(input))) as typeof fetch, warnings);
  const good = await live.snapshot(SUNDAY);
  down = true;
  const later = await live.snapshot({ ...SUNDAY, now: "2026-11-08T19:00:00.000Z" });
  assert.equal(later, good);
  assert.match(warnings.join("\n"), /last good prices/);
  assert.doesNotMatch(warnings.join("\n"), /secret|fmp/);
});

test("with no good snapshot yet, a failure shows the sample data", async () => {
  const warnings: string[] = [];
  const market = await provider((async () => new Response("", { status: 401 })) as typeof fetch, warnings).snapshot(SUNDAY);
  assert.equal(market.source, "sample");
  assert.match(warnings.join("\n"), /sample prices/);
});

test("if FMP fails, prices stay live and market cap is empty", async () => {
  const { fetch } = feed({ "/stable/key-metrics-ttm": () => new Response("", { status: 429 }) });
  const market = await provider(fetch).snapshot(SUNDAY);
  assert.equal(market.source, "live");
  assert.equal(market.securities.AAPL!.marketCapCents, null);
  assert.equal(market.securities.AAPL!.peRatio, null);
});

test("New York times convert across daylight saving", () => {
  assert.equal(new Date(nyInstant("2026-07-01", "09:30")).toISOString(), "2026-07-01T13:30:00.000Z");
  assert.equal(new Date(nyInstant("2026-11-06", "09:30")).toISOString(), "2026-11-06T14:30:00.000Z");
});

test("story HTML becomes plain paragraphs", () => {
  assert.deepEqual(paragraphs("<p>A &amp; B</p><p></p><p>C&nbsp;<a href='x'>D</a></p>"), ["A & B", "C D"]);
});
