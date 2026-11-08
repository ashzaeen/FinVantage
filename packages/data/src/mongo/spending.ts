import { MongoClient } from "mongodb";
import { SpendingProfile, defaultSpendingProfile, type SpendingStore } from "../spending";

/** One `spending_profiles` document per user, replaced whole on each save. */
class MongoSpendingStore implements SpendingStore {
  private readonly client: MongoClient;
  private readonly db;
  private initialized: Promise<void> | null = null;

  constructor(uri: string, dbName: string) {
    this.client = new MongoClient(uri);
    this.db = this.client.db(dbName);
  }

  private ready() {
    this.initialized ??= (async () => {
      await this.client.connect();
      await this.db.collection("spending_profiles").createIndex({ userId: 1 }, { unique: true });
    })();
    return this.initialized;
  }

  async get(userId: string) {
    await this.ready();
    const doc = await this.db.collection("spending_profiles").findOne({ userId }, { projection: { _id: 0 } });
    const parsed = doc ? SpendingProfile.safeParse(doc) : null;
    return parsed?.success ? parsed.data : defaultSpendingProfile(userId);
  }

  async save(profile: SpendingProfile) {
    await this.ready();
    const saved = SpendingProfile.parse(profile);
    await this.db.collection("spending_profiles").replaceOne({ userId: saved.userId }, saved, { upsert: true });
    return saved;
  }
}

export function createMongoSpendingStore(uri: string, dbName: string): SpendingStore {
  return new MongoSpendingStore(uri, dbName);
}
