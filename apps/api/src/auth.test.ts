import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApiClient, type ApiClient } from "@finvantage/contracts";
import { createApp } from "./app";
import { createTokenVerifier, SPACETIMEAUTH_ISSUER } from "./auth";
import { createDeps } from "./deps";

const CLIENT_ID = "client_test";

async function signer() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, opts: { aud?: string; iss?: string; exp?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(opts.iss ?? SPACETIMEAUTH_ISSUER)
      .setAudience(opts.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "1h")
      .sign(privateKey);
  return { keys, sign };
}

test("the verifier accepts this app's tokens and rejects the rest", async () => {
  const { keys, sign } = await signer();
  const verify = createTokenVerifier({ clientId: CLIENT_ID, keys });

  const user = await verify(await sign({ sub: "user_abc", name: "Sam Lee", email: "sam@example.com" }));
  assert.deepEqual(user, { userId: "user_abc", name: "Sam Lee", email: "sam@example.com" });

  assert.equal(await verify(await sign({ sub: "user_abc" }, { aud: "another_app" })), null);
  assert.equal(await verify(await sign({ sub: "user_abc" }, { iss: "https://evil.example" })), null);
  assert.equal(await verify(await sign({ sub: "user_abc" }, { exp: "-1m" })), null);
  assert.equal(await verify(await sign({ name: "no subject" })), null);
  assert.equal(await verify("not-a-jwt"), null);
});

function clientFor(app: ReturnType<typeof createApp>, token: string): ApiClient {
  return createApiClient({
    baseUrl: "http://test",
    token,
    fetch: ((url: string, init: RequestInit) => app.request(url, init)) as typeof fetch,
  });
}

test("a signed-in user gets their own copy of the demo data, and the demo token still works", async () => {
  const { keys, sign } = await signer();
  const deps = createDeps({ REPORT_OUTPUT_DIR: "/tmp/finvantage-report-tests" });
  deps.verifyToken = createTokenVerifier({ clientId: CLIENT_ID, keys });
  const app = createApp(deps, {});

  const signedIn = clientFor(app, await sign({ sub: "user_abc", name: "Sam Lee", email: "sam@example.com" }));
  const me = await signedIn.getMe();
  assert.equal(me.id, "user_abc");
  assert.equal(me.displayName, "Sam Lee");
  const accounts = await signedIn.listAccounts();
  assert.ok(accounts.length > 0);
  assert.ok(accounts.every((a) => a.userId === "user_abc"));

  const demo = clientFor(app, "demo-token");
  assert.equal((await demo.getMe()).id, "user_demo");
  assert.ok((await demo.listAccounts()).every((a) => a.userId === "user_demo"));

  const wrongApp = await sign({ sub: "user_abc" }, { aud: "another_app" });
  const res = await app.request("/v1/me", { headers: { authorization: `Bearer ${wrongApp}` } });
  assert.equal(res.status, 401);
});
