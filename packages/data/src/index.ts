import { MemoryDocumentStore, MemoryLedgerStore } from "./memory";
import { createMongoDocumentStore } from "./mongo";
import type { DocumentStore, LedgerStore } from "./stores";
import { createTigerLedgerStore } from "./tiger";

export * from "./stores";
export * from "./profile";
export * from "./bank";
export { MemoryDocumentStore, MemoryLedgerStore } from "./memory";

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

export function createStores(env: NodeJS.ProcessEnv = process.env): {
  ledger: LedgerStore;
  docs: DocumentStore;
} {
  const legacyReal = env.DATA_BACKEND === "real";
  const ledgerBackend = env.LEDGER_BACKEND ?? (legacyReal ? "tiger" : "memory");
  const documentBackend = env.DOCUMENT_BACKEND ?? (legacyReal ? "mongodb" : "memory");
  return {
    ledger:
      ledgerBackend === "tiger"
        ? createTigerLedgerStore(env.TIGER_DATABASE_URL ?? "")
        : new MemoryLedgerStore(),
    docs: createDocumentStore(env, documentBackend),
  };
}
