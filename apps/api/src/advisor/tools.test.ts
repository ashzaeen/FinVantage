import assert from "node:assert/strict";
import { test } from "node:test";
import { privacyProblem } from "./tools";

const grounded = (n: number) => [12000, 1500, 4500].includes(n);

test("a web search query may name products and topics, not the user", () => {
  assert.equal(privacyProblem("Chase Freedom Unlimited APR 2026", ["Jordan Lee"], grounded), null);
  assert.equal(privacyProblem("PNC checking overdraft fee", ["Jordan Lee"], grounded), null, "bank products are searchable");
  assert.equal(privacyProblem("top 5 cash back cards", [], grounded), null);
  assert.equal(privacyProblem("S&P 500 vs Nasdaq-100 average annual return", [], (n) => n === 500 || n === 100), null, "index names are not the user's figures");
  assert.match(privacyProblem("is jordan lee approved", ["Jordan Lee"], grounded) ?? "", /names the user/);
  assert.match(privacyProblem("card for $500 a month", [], grounded) ?? "", /dollar amount/);
  assert.match(privacyProblem("best card with 12000 in savings", [], grounded) ?? "", /own figures/);
});
