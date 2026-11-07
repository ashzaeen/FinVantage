import type { LiveEvent } from "@finvantage/contracts";

export type Unsubscribe = () => void;

/**
 * Pushes live updates to the dashboard. The API publishes here and never knows the transport,
 * so choosing Spacetime later does not touch any route.
 */
export interface LiveBus {
  readonly transport: string;
  publish(userId: string, event: LiveEvent): void;
  subscribe(userId: string, listener: (event: LiveEvent) => void): Unsubscribe;
}

/** Default. In-process fan-out that the API's SSE endpoint reads from. */
class InProcessBus implements LiveBus {
  readonly transport = "sse";
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
}

/**
 * STUB(spacetime): stretch track, needs one dedicated owner. Keep Spacetime to live push only.
 * It must not become a third system of record (PRD section 3.1).
 */
class SpacetimeBus implements LiveBus {
  readonly transport = "spacetime";

  publish(): void {
    throw new Error("Spacetime bus not implemented yet. Set LIVE_TRANSPORT=sse.");
  }

  subscribe(): Unsubscribe {
    throw new Error("Spacetime bus not implemented yet. Set LIVE_TRANSPORT=sse.");
  }
}

export function createLiveBus(env: NodeJS.ProcessEnv = process.env): LiveBus {
  return env.LIVE_TRANSPORT === "spacetime" ? new SpacetimeBus() : new InProcessBus();
}
