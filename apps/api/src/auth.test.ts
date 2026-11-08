import assert from "node:assert/strict";
import { test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { ApiError, createApiClient, type ApiClient } from "@finvantage/contracts";
import { createApp } from "./app";
import { AUDIENCE, createAuth, DEFAULT_ISSUER } from "./auth";
import { hashPassword, verifyPassword } from "./credentials";
import { createDeps } from "./deps";

function setup() {
  const deps = createDeps({ REPORT_OUTPUT_DIR: "/tmp/finvantage-report-tests" });
  const app = createApp(deps, {});
  const clientFor = (token: string): ApiClient =>
    createApiClient({
      baseUrl: "http://test",
      token,
      fetch: ((url: string, init: RequestInit) => app.request(url, init)) as typeof fetch,
    });
  return { app, deps, clientFor, anon: clientFor("") };
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (error instanceof ApiError) return error.status;
    throw error;
  }
}

test("passwords hash with a fresh salt and verify only with the right password", async () => {
  const a = await hashPassword("correct horse");
  const b = await hashPassword("correct horse");
  assert.notEqual(a, b);
  assert.ok(await verifyPassword("correct horse", a));
  assert.ok(!(await verifyPassword("wrong horse", a)));
  assert.ok(!(await verifyPassword("correct horse", "garbage")));
});

test("sign up gives a token for a new user with their own copy of the demo data", async () => {
  const { anon, clientFor } = setup();
  const { token, user } = await anon.signUp({
    body: { displayName: "Sam Lee", email: "Sam@Example.com", password: "s3cret-pass" },
  });
  assert.match(user.id, /^usr_/);
  assert.equal(user.displayName, "Sam Lee");
  assert.equal(user.email, "sam@example.com");

  const me = clientFor(token);
  assert.equal((await me.getMe()).id, user.id);
  const accounts = await me.listAccounts();
  assert.ok(accounts.length > 0);
  assert.ok(accounts.every((a) => a.userId === user.id));

  // The demo user is untouched and the demo token still works.
  const demo = clientFor("demo-token");
  assert.equal((await demo.getMe()).id, "user_demo");
});

test("log in works with the right password and fails the same way for anything else", async () => {
  const { anon, clientFor } = setup();
  const signedUp = await anon.signUp({
    body: { displayName: "Sam Lee", email: "sam@example.com", password: "s3cret-pass" },
  });

  const loggedIn = await anon.logIn({ body: { email: "SAM@example.com", password: "s3cret-pass" } });
  assert.equal(loggedIn.user.id, signedUp.user.id);
  assert.equal((await clientFor(loggedIn.token).getMe()).displayName, "Sam Lee");

  assert.equal(await statusOf(anon.logIn({ body: { email: "sam@example.com", password: "wrong-pass" } })), 401);
  assert.equal(await statusOf(anon.logIn({ body: { email: "nobody@example.com", password: "s3cret-pass" } })), 401);
});

test("sign up rejects a taken email and a short password", async () => {
  const { anon } = setup();
  await anon.signUp({ body: { displayName: "Sam", email: "sam@example.com", password: "s3cret-pass" } });
  assert.equal(
    await statusOf(anon.signUp({ body: { displayName: "Other", email: "SAM@example.com", password: "another-pass" } })),
    409,
  );
  assert.equal(
    await statusOf(anon.signUp({ body: { displayName: "Short", email: "short@example.com", password: "1234567" } })),
    400,
  );
});

test("tokens from another key or issuer, or with a broken signature, are rejected", async () => {
  const auth = createAuth({});
  const good = await auth.issue({ userId: "usr_1", name: "Sam", email: "sam@example.com" });
  assert.deepEqual(await auth.verify(good), { userId: "usr_1", name: "Sam", email: "sam@example.com" });

  const { privateKey } = await generateKeyPair("RS256");
  const forged = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "finvantage-1" })
    .setIssuer(DEFAULT_ISSUER)
    .setAudience(AUDIENCE)
    .setSubject("usr_1")
    .setExpirationTime("1h")
    .sign(privateKey);
  assert.equal(await auth.verify(forged), null);

  const otherIssuer = createAuth({ issuer: "https://evil.example" });
  assert.equal(await auth.verify(await otherIssuer.issue({ userId: "usr_1", name: null, email: null })), null);

  const [, payload] = good.split(".");
  assert.equal(await auth.verify(`${good.split(".")[0]}.${payload}.bad-signature`), null);
  assert.equal(await auth.verify("not-a-jwt"), null);
});

test("a configured private key signs, and only its public half is published", async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const privateJwk = JSON.stringify(await exportJWK(privateKey));
  const a = createAuth({ privateJwk });
  const b = createAuth({ privateJwk });
  // Two instances with the same key accept each other's tokens, as on Vercel.
  assert.ok(await b.verify(await a.issue({ userId: "usr_1", name: null, email: null })));
  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "finvantage-1" })
    .setIssuer(DEFAULT_ISSUER)
    .setAudience(AUDIENCE)
    .setSubject("usr_1")
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(privateKey);
  assert.equal(await a.verify(expired), null);
  const { keys } = await a.jwks();
  assert.equal(keys.length, 1);
  assert.deepEqual(Object.keys(keys[0]!).sort(), ["alg", "e", "kid", "kty", "n", "use"]);

  const { app } = setup();
  const jwks = (await (await app.request("/.well-known/jwks.json")).json()) as { keys: unknown[] };
  assert.equal(jwks.keys.length, 1);
  const discovery = (await (await app.request("/.well-known/openid-configuration")).json()) as { jwks_uri: string };
  assert.equal(discovery.jwks_uri, `${DEFAULT_ISSUER}/.well-known/jwks.json`);
});

test("requests with a bad token are rejected", async () => {
  const { app } = setup();
  const res = await app.request("/v1/me", { headers: { authorization: "Bearer not-a-jwt" } });
  assert.equal(res.status, 401);
});
