import { MongoClient } from "mongodb";
import { SubscriptionState, type SubscriptionStore } from "../subscriptions";

/**
 * One `subscription_states` document per user and subscription id, replaced whole on each save, so
 * a status change is one small write. Not the Plaid-shaped `recurring_stream` table: these are the
 * user's own choices, not bank data (docs/DATA-MODEL.md).
 */
class MongoSubscriptionStore implements SubscriptionStore {
  private readonly client: MongoClient;
  private readonly db;
  private initialized: Promise<void> | null = null;

  constructor(uri: string, dbName: string) {
    this.client = new MongoClient(uri);
    this.db = this.client.db(dbName);
  }

  private ready() {
    // A failed connect must not be cached, or every later call would fail until a restart.
    this.initialized ??= (async () => {
      await this.client.connect();
      await this.db.collection("subscription_states").createIndex({ userId: 1, id: 1 }, { unique: true });
    })().catch((error) => {
      this.initialized = null;
      throw error;
    });
    return this.initialized;
  }

  async list(userId: string) {
    await this.ready();
    const docs = await this.db.collection("subscription_states").find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
    // A document that no longer fits the schema is skipped rather than breaking the whole page.
    return docs.flatMap((doc) => {
      const parsed = SubscriptionState.safeParse(doc);
      return parsed.success ? [parsed.data] : [];
    });
  }

  async save(userId: string, state: SubscriptionState) {
    await this.ready();
    const saved = SubscriptionState.parse(state);
    await this.db.collection("subscription_states").replaceOne({ userId, id: saved.id }, { ...saved, userId }, { upsert: true });
    return saved;
  }
}

export function createMongoSubscriptionStore(uri: string, dbName: string): SubscriptionStore {
  return new MongoSubscriptionStore(uri, dbName);
}
