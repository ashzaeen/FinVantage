import assert from "node:assert/strict";
import { test } from "node:test";
import { CancellationGuide } from "@finvantage/contracts";
import { CANCELLATION_CATALOG, buildCancellationGuide, findCancellationEntry } from "./subscription-catalog";

test("every catalog entry is well formed", () => {
  for (const entry of CANCELLATION_CATALOG) {
    assert.ok(entry.title.length > 0 && entry.steps.length > 0 && entry.steps.every((s) => s.trim().length > 0), entry.title);
    // A link is https or absent, and a date is ISO or absent.
    assert.ok(entry.url === null || entry.url.startsWith("https://"), entry.title);
    assert.ok(entry.lastChecked === null || /^\d{4}-\d{2}-\d{2}$/.test(entry.lastChecked), entry.title);
    // Names are written the way normalizeMerchant writes them: lower case, letters, digits and spaces.
    for (const name of entry.names) assert.match(name, /^[a-z0-9]+(?: [a-z0-9]+)*$/, `${entry.title}: ${name}`);
  }
});

test("no merchant name is in the catalog twice", () => {
  const names = CANCELLATION_CATALOG.flatMap((e) => e.names);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});

test("nothing in the catalog claims to have been checked, because nothing has been", () => {
  assert.ok(CANCELLATION_CATALOG.every((e) => e.lastChecked === null));
});

test("a merchant is found by whole words, so a longer name that only contains one does not match", () => {
  assert.equal(findCancellationEntry("netflix")?.title, "Cancel Netflix");
  assert.equal(findCancellationEntry("disney plus")?.title, "Cancel Disney+");
  assert.equal(findCancellationEntry("youtube premium")?.title, "Cancel a YouTube Membership");
  assert.equal(findCancellationEntry("netflixy"), null);
  assert.equal(findCancellationEntry("hulaween"), null);
  assert.equal(findCancellationEntry(""), null);
});

test("every demo merchant has its own entry", () => {
  for (const name of ["streamflix", "showreel", "tunewave", "daily ledger news", "peak fitness", "skyvault storage"]) {
    assert.ok(findCancellationEntry(name), name);
  }
});

test("a directly billed merchant in the catalog gets its own guide", () => {
  const guide = buildCancellationGuide({ channel: "direct", normalizedMerchant: "netflix", displayName: "NETFLIX.COM" });
  assert.deepEqual([guide.source, guide.title, guide.url], ["catalog", "Cancel Netflix", "https://www.netflix.com/cancelplan"]);
});

test("a merchant not in the catalog gets generic steps naming it", () => {
  const guide = buildCancellationGuide({ channel: "direct", normalizedMerchant: "acme cloud", displayName: "Acme Cloud" });
  assert.deepEqual([guide.source, guide.title, guide.url], ["generic", "Cancel Acme Cloud", null]);
  assert.ok(guide.steps.some((s) => s.includes("Acme Cloud")));
});

test("a charge billed through a store is cancelled there, even for a merchant in the catalog", () => {
  for (const [channel, word] of [["apple", "Apple"], ["google_play", "Google Play"], ["paypal", "PayPal"]] as const) {
    const guide = buildCancellationGuide({ channel, normalizedMerchant: "netflix", displayName: "Netflix" });
    assert.equal(guide.source, "generic");
    assert.equal(guide.url, null);
    assert.ok(guide.steps.join(" ").includes(word), channel);
  }
});

test("every guide matches the contract", () => {
  const guides = [
    ...CANCELLATION_CATALOG.map((e) => buildCancellationGuide({ channel: "direct", normalizedMerchant: e.names[0]!, displayName: e.title })),
    ...(["direct", "apple", "google_play", "paypal"] as const).map((channel) => buildCancellationGuide({ channel, normalizedMerchant: "unknown thing", displayName: "" })),
  ];
  for (const guide of guides) assert.doesNotThrow(() => CancellationGuide.parse(guide), guide.title);
  // A blank display name does not leave a gap in the sentence.
  assert.ok(guides.at(-4)!.steps.every((s) => !s.includes("  ")));
});
