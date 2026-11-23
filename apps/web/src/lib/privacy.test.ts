import assert from "node:assert/strict";
import { test } from "node:test";
import { CopilotContext } from "@finvantage/contracts";
import { EXTENSION_FIELDS } from "./privacy";

test("the Privacy Center lists exactly the fields the extension is allowed to send", () => {
  assert.deepEqual(EXTENSION_FIELDS.map((f) => f.key).sort(), Object.keys(CopilotContext.shape).sort());
});

test("the extension's context refuses any extra field, which is what the Privacy Center promises", () => {
  const ok = { pageType: "checkout", itemType: "retail_purchase", priceCents: 32_900, merchant: "Northwind Store" };
  assert.equal(CopilotContext.safeParse(ok).success, true);
  assert.equal(CopilotContext.safeParse({ ...ok, pageText: "anything" }).success, false);
  assert.equal(CopilotContext.safeParse({ ...ok, url: "https://example.com/cart" }).success, false);
});
