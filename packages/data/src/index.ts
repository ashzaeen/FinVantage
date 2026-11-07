import { MemoryDocumentStore, MemoryLedgerStore } from "./memory";
import { createMongoDocumentStore } from "./mongo";
import type { DocumentStore, LedgerStore } from "./stores";
import { createTigerLedgerStore } from "./tiger";

export * from "./stores";
export * from "./profile";
export * from "./bank";
export { MemoryDocumentStore, MemoryLedgerStore } from "./memory";

export function createStores(env: NodeJS.ProcessEnv = process.env): {
  ledger: LedgerStore;
  docs: DocumentStore;
} {
  if (env.DATA_BACKEND === "real") {
    return {
      ledger: createTigerLedgerStore(env.TIGER_DATABASE_URL ?? ""),
      docs: createMongoDocumentStore(env.MONGODB_URI ?? ""),
    };
  }
  return { ledger: new MemoryLedgerStore(), docs: new MemoryDocumentStore() };
}
