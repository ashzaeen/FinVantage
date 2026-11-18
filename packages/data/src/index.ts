import { MemoryDocumentStore, MemoryLedgerStore } from "./memory";
import { preferLinkedBanks } from "./linked-banks";
import { createMongoDocumentStore } from "./mongo";
import { createMongoSpendingStore } from "./mongo/spending";
import { createMongoSubscriptionStore } from "./mongo/subscriptions";
import { MemorySpendingStore, type SpendingStore } from "./spending";
import { MemorySubscriptionStore, type SubscriptionStore } from "./subscriptions";
import type { DocumentStore, LedgerStore } from "./stores";
import { MemoryBankTokenStore, parseTokenKey, SpacetimeBankTokenStore, type BankTokenStore } from "./bank-tokens";
import { SpacetimeLedgerStore } from "./spacetime/ledger";
import { SpacetimeHttp } from "./spacetime/client";
import type { HealthCheck } from "./health";

export * from "./stores";
export * from "./profile";
export * from "./bank";
export * from "./plaid/schema";
export * from "./plaid/map";
export { isDemoCopy, preferLinkedBanks } from "./linked-banks";
export * from "./plaid/spacetime-rows";
export * from "./plaid/client";
export * from "./bank-tokens";
export * from "./market";
export { createMarketData, LiveMarketData, type LiveMarketOptions } from "./market-live";
export * from "./spending";
export * from "./subscriptions";
export * from "./subscription-catalog";
export { goalStatusForBalance, MemoryDocumentStore, MemoryLedgerStore } from "./memory";
export { SpacetimeLedgerStore } from "./spacetime/ledger";
export { runHealthChecks, type HealthCheck, type HealthReport } from "./health";
export { SpacetimeHttp, SpacetimeError, sqlString, decodeSats, type SpacetimeConfig } from "./spacetime/client";

const MONGODB_CONFIGURATION_ERROR =
  "MongoDB configuration is invalid. MONGODB_URI must start with mongodb:// or " +
  "mongodb+srv:// and contain URL-encoded credentials.";

function createSpendingStore(env: NodeJS.ProcessEnv, backend: string): SpendingStore {
  const uri = env.MONGODB_URI?.trim() ?? "";
  if (backend !== "mongodb" || !/^mongodb(?:\+srv)?:\/\//.test(uri) || /<[^>]+>/.test(uri)) {
    if (backend === "mongodb" && env.NODE_ENV === "production") throw new Error(MONGODB_CONFIGURATION_ERROR);
    return new MemorySpendingStore();
  }
  return createMongoSpendingStore(uri, env.MONGODB_DB?.trim() || "finvantage");
}

function createSubscriptionStore(env: NodeJS.ProcessEnv, backend: string): SubscriptionStore {
  const uri = env.MONGODB_URI?.trim() ?? "";
  if (backend !== "mongodb" || !/^mongodb(?:\+srv)?:\/\//.test(uri) || /<[^>]+>/.test(uri)) {
    if (backend === "mongodb" && env.NODE_ENV === "production") throw new Error(MONGODB_CONFIGURATION_ERROR);
    return new MemorySubscriptionStore();
  }
  return createMongoSubscriptionStore(uri, env.MONGODB_DB?.trim() || "finvantage");
}

function createDocumentStore(env: NodeJS.ProcessEnv, backend: string): DocumentStore {
  if (backend !== "mongodb") return new MemoryDocumentStore();

  const uri = env.MONGODB_URI?.trim() ?? "";
  try {
    if (!/^mongodb(?:\+srv)?:\/\//.test(uri) || /<[^>]+>/.test(uri)) {
      throw new Error(MONGODB_CONFIGURATION_ERROR);
    }
    return createMongoDocumentStore(uri, env.MONGODB_DB?.trim() || "finvantage");
  } catch {
    if (env.NODE_ENV === "production") throw new Error(MONGODB_CONFIGURATION_ERROR);
    console.warn(
      `[data] ${MONGODB_CONFIGURATION_ERROR} Using the in-memory document store for this development session.`,
    );
    return new MemoryDocumentStore();
  }
}

/**
 * Picks the stores from env:
 * - LEDGER_BACKEND: "memory" (default) or "spacetime" (needs SPACETIME_TOKEN, plus SPACETIME_URL
 *   and SPACETIME_MODULE, which default to Maincloud and "finvantage").
 * - DOCUMENT_BACKEND: "memory" (default) or "mongodb" (needs MONGODB_URI).
 */
export function createStores(env: NodeJS.ProcessEnv = process.env): {
  ledger: LedgerStore;
  docs: DocumentStore;
  bankTokens: BankTokenStore;
  spending: SpendingStore;
  subscriptions: SubscriptionStore;
  /** One check per database in use, for `GET /health`. Empty when everything runs in memory. */
  health: HealthCheck[];
} {
  const spacetime = spacetimeConfig(env);
  const docs = createDocumentStore(env, env.DOCUMENT_BACKEND ?? "memory");
  const health: HealthCheck[] = [];
  if (spacetime) {
    const http = new SpacetimeHttp(spacetime);
    // `admin` is a tiny private table, so this proves the database, the module and the token.
    health.push({ name: "spacetime", check: async () => void (await http.sql("SELECT * FROM admin")) });
  }
  if (docs.ping) health.push({ name: "mongodb", check: () => docs.ping!() });
  return {
    // Once a user links a bank, it replaces their demo copy's accounts. See linked-banks.ts.
    ledger: preferLinkedBanks(spacetime ? new SpacetimeLedgerStore(spacetime) : new MemoryLedgerStore()),
    docs,
    // Bank tokens live next to the ledger. In Spacetime they are encrypted with PLAID_TOKEN_KEY.
    bankTokens: spacetime ? spacetimeTokenStore(env, spacetime) : new MemoryBankTokenStore(),
    // Spending settings are per-user documents, so they live with the other documents.
    spending: createSpendingStore(env, env.DOCUMENT_BACKEND ?? "memory"),
    // The user's subscription choices are per-user documents too: MongoDB in production, else memory.
    subscriptions: createSubscriptionStore(env, env.DOCUMENT_BACKEND ?? "memory"),
    health,
  };
}

/** Spacetime settings when LEDGER_BACKEND=spacetime, otherwise null (memory). */
function spacetimeConfig(env: NodeJS.ProcessEnv) {
  const backend = env.LEDGER_BACKEND ?? "memory";
  if (backend === "memory") return null;
  if (backend !== "spacetime") throw new Error(`Unknown LEDGER_BACKEND "${backend}". Use memory or spacetime.`);
  const token = env.SPACETIME_TOKEN?.trim();
  if (!token) throw new Error("LEDGER_BACKEND=spacetime needs SPACETIME_TOKEN.");
  return {
    url: env.SPACETIME_URL?.trim() || "https://maincloud.spacetimedb.com",
    database: env.SPACETIME_MODULE?.trim() || "finvantage",
    token,
  };
}

function spacetimeTokenStore(env: NodeJS.ProcessEnv, config: NonNullable<ReturnType<typeof spacetimeConfig>>): BankTokenStore {
  const key = env.PLAID_TOKEN_KEY?.trim();
  if (key) return new SpacetimeBankTokenStore(config, parseTokenKey(key));
  // No key: banks can't be linked, but everything else works.
  return {
    save: async () => {
      throw new Error("PLAID_TOKEN_KEY is not set, so bank tokens can't be stored.");
    },
    get: async () => null,
    remove: async () => {},
  };
}
