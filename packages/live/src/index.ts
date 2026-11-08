import type { LiveEvent } from "@finvantage/contracts";

export type Unsubscribe = () => void;

/**
 * Pushes live updates to the dashboard. The API publishes here and never knows the transport,
 * so choosing Spacetime does not touch any route.
 */
export interface LiveBus {
  readonly transport: string;
  publish(userId: string, event: LiveEvent): void;
  /** In-process listeners, read by the SSE endpoint. */
  subscribe(userId: string, listener: (event: LiveEvent) => void): Unsubscribe;
  /**
   * Waits for publishes still in flight. The API calls it before each response returns, because
   * a serverless function may be frozen as soon as it has answered.
   */
  flush(): Promise<void>;
}

/** Default. In-process fan-out that the API's SSE endpoint reads from. */
class InProcessBus implements LiveBus {
  readonly transport: string = "sse";
  private listeners = new Map<string, Set<(event: LiveEvent) => void>>();

  publish(userId: string, event: LiveEvent): void {
    this.listeners.get(userId)?.forEach((listener) => listener(event));
  }

  subscribe(userId: string, listener: (event: LiveEvent) => void): Unsubscribe {
    const set = this.listeners.get(userId) ?? new Set();
    set.add(listener);
    this.listeners.set(userId, set);
    return () => set.delete(listener);
  }

  async flush() {}
}

export interface SpacetimeLiveConfig {
  url: string;
  database: string;
  /** The API's admin token. Only admins can call publish_live_event. */
  token: string;
}

/**
 * Publishes each event as a `live_event` row through the module's publish_live_event reducer.
 * Signed-in browsers subscribe to their own rows (the my_live_event view) with the Spacetime SDK,
 * so a push reaches them whichever server instance handled the request. It still fans out in
 * process too, so the SSE fallback (signed-out visitors, local dev) keeps working.
 *
 * Spacetime stays a push channel here: rows are signals to refetch, never figures.
 */
export class SpacetimeBus extends InProcessBus {
  override readonly transport = "spacetime";
  private pending = new Set<Promise<void>>();

  constructor(
    private readonly config: SpacetimeLiveConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly onError: (error: unknown) => void = (error) => console.error("[live] Spacetime publish failed:", error),
  ) {
    super();
  }

  override publish(userId: string, event: LiveEvent): void {
    super.publish(userId, event);
    const url = `${this.config.url.replace(/\/$/, "")}/v1/database/${encodeURIComponent(this.config.database)}/call/publish_live_event`;
    const sent = this.fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.token}`, "content-type": "application/json" },
      body: JSON.stringify([userId, JSON.stringify(event)]),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      })
      // A missed push only delays a refresh, so it must never fail the request.
      .catch(this.onError)
      .finally(() => this.pending.delete(sent));
    this.pending.add(sent);
  }

  override async flush() {
    await Promise.all(this.pending);
  }
}

export function createLiveBus(env: NodeJS.ProcessEnv = process.env): LiveBus {
  if (env.LIVE_TRANSPORT !== "spacetime") return new InProcessBus();
  const token = env.SPACETIME_TOKEN?.trim();
  if (!token) throw new Error("LIVE_TRANSPORT=spacetime needs SPACETIME_TOKEN.");
  return new SpacetimeBus({
    url: env.SPACETIME_URL?.trim() || "https://maincloud.spacetimedb.com",
    database: env.SPACETIME_MODULE?.trim() || "finvantage",
    token,
  });
}
