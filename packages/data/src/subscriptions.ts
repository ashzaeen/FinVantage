import { z } from "zod";
import { IsoDate, IsoDateTime, RecurringCharge, SubscriptionKind, SubscriptionStatus } from "@finvantage/contracts";

/**
 * What the user said about one subscription: whether to keep it, that they are cancelling or have
 * cancelled it, or that it belongs in the other group. Charges come from the bank; this is the
 * only part of a subscription the user changes. Keyed by the subscription's id, which stays the
 * same across syncs (see `subscriptionId` in math-core).
 */
export const SubscriptionState = z.object({
  id: z.string().min(1),
  /**
   * The charge as the bank showed it when the user chose. A cancelled subscription's recurring
   * stream ends at the bank, so without this it would drop off the list, and its savings with it.
   */
  charge: RecurringCharge,
  status: SubscriptionStatus,
  /** The user's choice of group. Null follows the rule. */
  kind: SubscriptionKind.nullable(),
  /** The day the user cancelled. Set only while the status is "cancelled". */
  cancelledOn: IsoDate.nullable(),
  updatedAt: IsoDateTime,
});
export type SubscriptionState = z.infer<typeof SubscriptionState>;

/**
 * Per-user subscription choices. Memory for now, so they last until the API restarts; the
 * MongoDB version is the last step of docs/workstreams/subscriptions.md and needs the platform
 * owner's agreement, because it changes the store set.
 */
export interface SubscriptionStore {
  list(userId: string): Promise<SubscriptionState[]>;
  /** Adds the state, or replaces the one with the same id. Returns what was saved. */
  save(userId: string, state: SubscriptionState): Promise<SubscriptionState>;
}

export class MemorySubscriptionStore implements SubscriptionStore {
  private states = new Map<string, Map<string, SubscriptionState>>();

  async list(userId: string) {
    return structuredClone([...(this.states.get(userId)?.values() ?? [])]);
  }

  async save(userId: string, state: SubscriptionState) {
    const saved = SubscriptionState.parse(state);
    const mine = this.states.get(userId) ?? new Map<string, SubscriptionState>();
    mine.set(saved.id, structuredClone(saved));
    this.states.set(userId, mine);
    return saved;
  }
}
