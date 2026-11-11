import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionFetch } from "./session-fetch";

const DEMO = "demo-token";

/** A JWT-shaped token whose claims say it is good for another day. Only the API checks signatures. */
function token(sub: string): string {
  const claims = { sub, exp: Math.floor(Date.now() / 1000) + 86_400, guest: true };
  return `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

/** A fake API: accepts tokens in `valid`, keeps the demo token read-only, records what it saw. */
function fakeApi(valid: Set<string>) {
  const seen: Array<{ method: string; token: string }> = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    const method = init?.method ?? "GET";
    const sent = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    seen.push({ method, token: sent });
    if (sent === DEMO) {
      return method === "GET"
        ? Response.json({ ok: true })
        : Response.json({ error: { code: "demo_read_only", message: "read-only" } }, { status: 403 });
    }
    if (!valid.has(sent)) return Response.json({ error: { code: "unauthorized", message: "bad token" } }, { status: 401 });
    return Response.json({ ok: true });
  };
  return { fetch, seen };
}

test("a cookie the API no longer accepts is replaced with a new guest session, so writes still work", async () => {
  // The Advisor bug: a guest cookie from before an API restart. It used to fall back to the
  // read-only demo token, and starting a chat got 403 demo_read_only.
  const stale = token("guest_old");
  const fresh = token("guest_new");
  const api = fakeApi(new Set([fresh]));
  let saved: string | null | undefined = stale;
  let guestsStarted = 0;
  const send = createSessionFetch({
    demoToken: DEMO,
    readToken: () => saved ?? undefined,
    startGuest: async () => (guestsStarted++, fresh),
    saveToken: (t) => (saved = t),
    fetch: api.fetch,
  });

  const res = await send("http://api/v1/advisory/conversations", { method: "POST", body: "{}" });

  assert.equal(res.status, 200);
  assert.equal(saved, fresh);
  assert.equal(guestsStarted, 1);
  assert.deepEqual(api.seen.map((s) => s.token), [stale, fresh]);
  assert.ok(!api.seen.some((s) => s.token === DEMO), "never retried a write with the read-only demo token");
});

test("calls refused at the same moment share one new guest session", async () => {
  const fresh = token("guest_new");
  const api = fakeApi(new Set([fresh]));
  let saved: string | null | undefined = token("guest_old");
  let guestsStarted = 0;
  const send = createSessionFetch({
    demoToken: DEMO,
    readToken: () => saved ?? undefined,
    startGuest: async () => {
      guestsStarted++;
      await new Promise((r) => setTimeout(r, 5));
      return fresh;
    },
    saveToken: (t) => (saved = t),
    fetch: api.fetch,
  });

  const results = await Promise.all([send("http://api/v1/goals"), send("http://api/v1/accounts"), send("http://api/v1/goals")]);

  assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
  assert.equal(guestsStarted, 1);
});

test("a write refused for the demo token gets a guest session and is retried", async () => {
  const fresh = token("guest_new");
  const api = fakeApi(new Set([fresh]));
  let saved: string | null | undefined;
  const send = createSessionFetch({
    demoToken: DEMO,
    readToken: () => saved ?? undefined,
    startGuest: async () => fresh,
    saveToken: (t) => (saved = t),
    fetch: api.fetch,
  });

  const res = await send("http://api/v1/goals", { method: "POST", body: "{}" });

  assert.equal(res.status, 200);
  assert.equal(saved, fresh);
});

test("with no guest session to be had, a refused cookie is cleared and reads use the demo profile", async () => {
  const api = fakeApi(new Set());
  let saved: string | null | undefined = token("guest_old");
  const send = createSessionFetch({
    demoToken: DEMO,
    readToken: () => saved ?? undefined,
    startGuest: async () => {
      throw new Error("API down");
    },
    saveToken: (t) => (saved = t),
    fetch: api.fetch,
  });

  const res = await send("http://api/v1/goals");

  assert.equal(res.status, 200);
  assert.equal(saved, null);
  assert.equal(api.seen.at(-1)?.token, DEMO);
});

test("on the server (no startGuest) a refused cookie falls back to the demo token for rendering", async () => {
  const api = fakeApi(new Set());
  const send = createSessionFetch({ demoToken: DEMO, readToken: () => token("guest_old"), fetch: api.fetch });

  const res = await send("http://api/v1/goals");

  assert.equal(res.status, 200);
  assert.equal(api.seen.at(-1)?.token, DEMO);
});

test("a working session is sent as is, once", async () => {
  const good = token("guest_ok");
  const api = fakeApi(new Set([good]));
  const send = createSessionFetch({
    demoToken: DEMO,
    readToken: () => good,
    startGuest: async () => assert.fail("no new session needed"),
    fetch: api.fetch,
  });

  const res = await send("http://api/v1/advisory/conversations", { method: "POST", body: "{}" });

  assert.equal(res.status, 200);
  assert.deepEqual(api.seen, [{ method: "POST", token: good }]);
});
