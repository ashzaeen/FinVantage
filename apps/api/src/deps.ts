import { createBankProvider, createStores, type BankDataProvider, type DocumentStore, type LedgerStore } from "@finvantage/data";
import { createLiveBus, type LiveBus } from "@finvantage/live";
import { createLlmClient, type LlmClient } from "@finvantage/llm";
import { createTokenVerifier, rejectAllTokens, type TokenVerifier } from "./auth";
import {
  createMailClient,
  createPdfStore,
  type MailClient,
  type PdfStore,
} from "./reporting/artifacts";

export interface AppDeps {
  ledger: LedgerStore;
  docs: DocumentStore;
  llm: LlmClient;
  live: LiveBus;
  bank: BankDataProvider;
  mail: MailClient;
  pdf: PdfStore;
  /** Checks SpacetimeAuth sign-in tokens. The demo token is handled separately in app.ts. */
  verifyToken: TokenVerifier;
  /** Injectable so demos and tests are repeatable. */
  today: () => string;
  now: () => string;
  reportEmailOverride: string | null;
  schedulerSecret: string | null;
}

/** Every stub-or-real switch happens here, from env. See .env.example. */
export function createDeps(env: NodeJS.ProcessEnv = process.env): AppDeps {
  const now = () => new Date().toISOString();
  return {
    ...createStores(env),
    llm: createLlmClient(env),
    live: createLiveBus(env),
    bank: createBankProvider(env),
    mail: createMailClient(env),
    pdf: createPdfStore(env, now),
    verifyToken: env.SPACETIMEAUTH_CLIENT_ID
      ? createTokenVerifier({ clientId: env.SPACETIMEAUTH_CLIENT_ID })
      : rejectAllTokens,
    today: () => now().slice(0, 10),
    now,
    reportEmailOverride: env.REPORT_EMAIL_OVERRIDE ?? null,
    schedulerSecret: env.SCHEDULER_SECRET ?? null,
  };
}
