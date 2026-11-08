import { MemoryDocumentStore, MemoryLedgerStore } from "./memory";
import { preferLinkedBanks } from "./linked-banks";
import { createMongoDocumentStore } from "./mongo";
import type { DocumentStore, LedgerStore } from "./stores";
import { MemoryBankTokenStore, parseTokenKey, SpacetimeBankTokenStore, type BankTokenStore } from "./bank-tokens";
import { SpacetimeLedgerStore } from "./spacetime/ledger";

export * from "./stores";
export * from "./profile";
export * from "./bank";
export * from "./plaid/schema";
export * from "./plaid/map";
export { preferLinkedBanks } from "./linked-banks";
export * from "./plaid/spacetime-rows";
export * from "./plaid/client";
export * from "./bank-tokens";
export { goalStatusForBalance, MemoryDocumentStore, MemoryLedgerStore } from "./memory";
export { SpacetimeLedgerStore } from "./spacetime/ledger";
export { SpacetimeHttp, SpacetimeError, sqlString, decodeSats, type SpacetimeConfig } from "./spacetime/client";

const MONGODB_CONFIGURATION_ERROR =
  "MongoDB configuration is invalid. MONGODB_URI must start with mongodb:// or " +
  "mongodb+srv:// and contain URL-encoded credentials.";

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
} {
  const spacetime = spacetimeConfig(env);
  return {
    // Once a user links a bank, it replaces their demo copy's accounts. See linked-banks.ts.
    ledger: preferLinkedBanks(spacetime ? new SpacetimeLedgerStore(spacetime) : new MemoryLedgerStore()),
    docs: createDocumentStore(env, env.DOCUMENT_BACKEND ?? "memory"),
    // Bank tokens live next to the ledger. In Spacetime they are encrypted with PLAID_TOKEN_KEY.
    bankTokens: spacetime ? spacetimeTokenStore(env, spacetime) : new MemoryBankTokenStore(),
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
