import assert from "node:assert/strict";
import { test } from "node:test";
import { isDemoViewer } from "./viewer";

/** An unsigned JWT with the given claims. Only the payload is read. */
function token(claims: Record<string, unknown>): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part(claims)}.sig`;
}
const later = Math.floor(Date.now() / 1000) + 3600;
const earlier = Math.floor(Date.now() / 1000) - 3600;

test("no sign-in, an expired token, or junk is the demo", () => {
  assert.equal(isDemoViewer(undefined), true);
  assert.equal(isDemoViewer(""), true);
  assert.equal(isDemoViewer("not-a-token"), true);
  assert.equal(isDemoViewer(token({ sub: "user_1", exp: earlier })), true);
});

test("a guest session is the demo, and a signed-in account is not", () => {
  assert.equal(isDemoViewer(token({ sub: "guest_1", exp: later, guest: true })), true);
  assert.equal(isDemoViewer(token({ sub: "user_1", exp: later, email: "a@b.co" })), false);
});
