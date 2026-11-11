import assert from "node:assert/strict";
import { test } from "node:test";
import { NewAccount, NewGoal } from "./index";
import { ParseLifeEventRequest } from "./life-event";
import { safeNextPath } from "./session";

const origin = "https://finvantage.example";

test("N3: after sign-in, only a path on this site is followed", () => {
  for (const next of ["/goals", "/advisor?c=abc", "/app#top"]) assert.equal(safeNextPath(next, origin), next);
  for (const next of [
    "/\\evil.example/x",
    "//evil.example",
    "/\\/evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "/\tevil",
    "/login?next=/app",
    "",
    null,
  ]) {
    assert.equal(safeNextPath(next, origin), "/app", String(next));
  }
});

test("N1: names and typed sentences a caller sends have a maximum length", () => {
  const goal = { name: "Trip", targetCents: 100_000, currentCents: 0, targetDate: "2027-01-01", priorityRank: 1, flexibility: "flexible", linkedAccountId: null };
  assert.equal(NewGoal.safeParse(goal).success, true);
  assert.equal(NewGoal.safeParse({ ...goal, name: "x".repeat(81) }).success, false);
  assert.equal(NewGoal.safeParse({ ...goal, name: "   " }).success, false);
  assert.equal(NewAccount.shape.name.safeParse("x".repeat(81)).success, false);
  assert.equal(ParseLifeEventRequest.safeParse({ text: "x".repeat(501) }).success, false);
  assert.equal(ParseLifeEventRequest.safeParse({ text: "We are having a baby next June." }).success, true);
});
