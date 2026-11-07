import { createBankProvider, createStores, type BankDataProvider, type DocumentStore, type LedgerStore } from "@finvantage/data";
import { createLiveBus, type LiveBus } from "@finvantage/live";
import { createLlmClient, type LlmClient } from "@finvantage/llm";

export interface AppDeps {
  ledger: LedgerStore;
  docs: DocumentStore;
  llm: LlmClient;
  live: LiveBus;
  bank: BankDataProvider;
  /** Injectable so demos and tests are repeatable. */
  today: () => string;
}

/** Every stub-or-real switch happens here, from env. See .env.example. */
export function createDeps(env: NodeJS.ProcessEnv = process.env): AppDeps {
  return {
    ...createStores(env),
    llm: createLlmClient(env),
    live: createLiveBus(env),
    bank: createBankProvider(env),
    today: () => new Date().toISOString().slice(0, 10),
  };
}
