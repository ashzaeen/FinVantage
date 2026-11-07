import type { LedgerStore } from "../stores";

/** STUB(platform): implement LedgerStore against Tiger Data Postgres. Schema is in schema.sql. */
export function createTigerLedgerStore(_databaseUrl: string): LedgerStore {
  throw new Error("Tiger Data store not implemented yet. Set DATA_BACKEND=memory.");
}
