import { MemoryDocumentStore, MemoryLedgerStore } from "./memory";
import { createMongoDocumentStore } from "./mongo";
import type { DocumentStore, LedgerStore } from "./stores";
import { SpacetimeLedgerStore } from "./spacetime/ledger";

export * from "./stores";
export * from "./profile";
export * from "./bank";
export * from "./plaid/schema";
export * from "./plaid/map";
export * from "./plaid/spacetime-rows";
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
} {
  return {
    ledger: createLedgerStore(env),
    docs: createDocumentStore(env, env.DOCUMENT_BACKEND ?? "memory"),
  };
}

function createLedgerStore(env: NodeJS.ProcessEnv): LedgerStore {
  const backend = env.LEDGER_BACKEND ?? "memory";
  if (backend === "memory") return new MemoryLedgerStore();
  if (backend !== "spacetime") throw new Error(`Unknown LEDGER_BACKEND "${backend}". Use memory or spacetime.`);
  const token = env.SPACETIME_TOKEN?.trim();
  if (!token) throw new Error("LEDGER_BACKEND=spacetime needs SPACETIME_TOKEN.");
  return new SpacetimeLedgerStore({
    url: env.SPACETIME_URL?.trim() || "https://maincloud.spacetimedb.com",
    database: env.SPACETIME_MODULE?.trim() || "finvantage",
    token,
  });
}
