import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { LIVE_STREAM_PATH, type LiveEvent } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import type { AppEnv } from "../mount";

const HEARTBEAT_MS = 25_000;

export function registerLiveRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.get(LIVE_STREAM_PATH, (c) => {
    const userId = c.get("userId");
    return streamSSE(c, async (stream) => {
      const queue: LiveEvent[] = [];
      let wake = () => {};
      const unsubscribe = deps.live.subscribe(userId, (event) => {
        queue.push(event);
        wake();
      });
      stream.onAbort(() => {
        unsubscribe();
        wake();
      });

      while (!stream.aborted) {
        for (const event of queue.splice(0)) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, HEARTBEAT_MS);
        });
        if (queue.length === 0 && !stream.aborted) {
          await stream.writeSSE({ event: "ping", data: "{}" });
        }
      }
    });
  });
}
