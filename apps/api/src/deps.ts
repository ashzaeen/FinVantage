import { createBankProvider, createStores, type BankDataProvider, type DocumentStore, type LedgerStore } from "@finvantage/data";
import { createLiveBus, type LiveBus } from "@finvantage/live";
import { createLlmClient, type LlmClient } from "@finvantage/llm";
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
  /** Injectable so demos and tests are repeatable. */
  today: () => string;
  now: () => string;
  reportEmailOverride: string | null;
  schedulerSecret: string | null;
  /**
   * Merchants whose Copilot card Gemini writes, lower-cased. Every other merchant gets the
   * template card without a model call. Null means every merchant uses the model.
   */
  copilotLlmMerchants: ReadonlySet<string> | null;
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
    today: () => now().slice(0, 10),
    now,
    reportEmailOverride: env.REPORT_EMAIL_OVERRIDE ?? null,
    schedulerSecret: env.SCHEDULER_SECRET ?? null,
    copilotLlmMerchants: parseMerchantList(env.COPILOT_GEMINI_MERCHANTS),
  };
}

/** "Amazon, Best Buy" -> {"amazon", "best buy"}. Unset or blank means no restriction. */
function parseMerchantList(value: string | undefined): ReadonlySet<string> | null {
  const names = (value ?? "").split(",").map((n) => n.trim().toLowerCase()).filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
}
