import assert from "node:assert/strict";
import { test } from "node:test";
import type { LiveEvent } from "@finvantage/contracts";
import { createLiveBus, SpacetimeBus } from "./index";

const event: LiveEvent = { type: "simulation.updated", runId: "run_1" };

test("the Spacetime bus calls publish_live_event, fans out in process, and flush waits for it", async () => {
  const calls: Array<{ url: string; body: unknown; auth: string | null }> = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const fakeFetch = (async (url: string, init: RequestInit) => {
    await gate;
    calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization") });
    return new Response("", { status: 200 });
  }) as typeof fetch;
  const bus = new SpacetimeBus({ url: "https://stdb.example/", database: "finvantage", token: "admin-token" }, fakeFetch);

  const seen: LiveEvent[] = [];
  bus.subscribe("user_1", (e) => seen.push(e));
  bus.publish("user_1", event);
  assert.deepEqual(seen, [event], "in-process listeners fire immediately");

  let flushed = false;
  const flushing = bus.flush().then(() => (flushed = true));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(flushed, false, "flush waits for the request in flight");
  release();
  await flushing;
  assert.deepEqual(calls, [
    {
      url: "https://stdb.example/v1/database/finvantage/call/publish_live_event",
      body: ["user_1", JSON.stringify(event)],
      auth: "Bearer admin-token",
    },
  ]);
});

test("a failed push is reported, never thrown", async () => {
  const errors: unknown[] = [];
  const bus = new SpacetimeBus(
    { url: "https://stdb.example", database: "finvantage", token: "t" },
    (async () => new Response("nope", { status: 530 })) as unknown as typeof fetch,
    (error) => errors.push(error),
  );
  bus.publish("user_1", event);
  await bus.flush();
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /530/);
});

test("SSE stays the default, and Spacetime needs a token", () => {
  assert.equal(createLiveBus({}).transport, "sse");
  assert.throws(() => createLiveBus({ LIVE_TRANSPORT: "spacetime" }), /SPACETIME_TOKEN/);
  assert.equal(createLiveBus({ LIVE_TRANSPORT: "spacetime", SPACETIME_TOKEN: "t" }).transport, "spacetime");
});
