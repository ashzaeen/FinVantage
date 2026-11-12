import {
  createBankProvider,
  createMarketData,
  createStores,
  type BankDataProvider,
  type BankTokenStore,
  type DocumentStore,
  type MarketDataProvider,
  type SpendingStore,
  type LedgerStore,
} from "@finvantage/data";
import { createLiveBus, type LiveBus } from "@finvantage/live";
import { createLlmClient, type LlmClient } from "@finvantage/llm";
import { withCategoryRules } from "./spending/rules-ledger";
import { createAuth, type Auth } from "./auth";
import { MemoryCredentialStore, SpacetimeCredentialStore, type CredentialStore } from "./credentials";
import {
  createMailClient,
  createPdfStore,
  type MailClient,
  type PdfStore,
} from "./reporting/artifacts";

export interface AppDeps {
  ledger: LedgerStore;
  docs: DocumentStore;
  /** Spending categories, budgets, rules and the split: MongoDB in production, else memory. */
  spending: SpendingStore;
  llm: LlmClient;
  live: LiveBus;
  bank: BankDataProvider;
  /** Prices and market news for the Investments page: Alpaca and FMP when their keys are set, else sample data. */
  market: MarketDataProvider;
  /** Plaid access tokens, encrypted at rest. Never returned to clients. */
  bankTokens: BankTokenStore;
  mail: MailClient;
  pdf: PdfStore;
  /** Issues and checks sign-in tokens. The demo token is handled separately in app.ts. */
  auth: Auth;
  /** Email + password accounts: Spacetime when SPACETIME_TOKEN is set, otherwise memory. */
  credentials: CredentialStore;
  /** Injectable so demos and tests are repeatable. */
  today: () => string;
  now: () => string;
  reportEmailOverride: string | null;
  schedulerSecret: string | null;
  /** Shared with the web server so it can name a visitor's address for rate limits. Unset: not trusted. */
  webProxySecret: string | null;
  /**
   * Merchants whose Copilot card Gemini writes, lower-cased. Every other merchant gets the
   * template card without a model call. Null means every merchant uses the model.
   */
  copilotLlmMerchants: ReadonlySet<string> | null;
}

/** Every stub-or-real switch happens here, from env. See .env.example. */
export function createDeps(env: NodeJS.ProcessEnv = process.env): AppDeps {
  const now = () => new Date().toISOString();
  const stores = createStores(env);
  return {
    ...stores,
    ledger: withCategoryRules(stores.ledger, stores.spending),
    llm: createLlmClient(env),
    live: createLiveBus(env),
    bank: createBankProvider(env),
    market: createMarketData(env),
    mail: createMailClient(env),
    pdf: createPdfStore(env, now, stores.docs),
    auth: createAuth({ privateJwk: requiredInProduction(env, "AUTH_PRIVATE_JWK"), issuer: env.AUTH_ISSUER }),
    credentials: env.SPACETIME_TOKEN
      ? new SpacetimeCredentialStore({
          url: env.SPACETIME_URL ?? "https://maincloud.spacetimedb.com",
          database: env.SPACETIME_MODULE ?? "finvantage",
          token: env.SPACETIME_TOKEN,
        })
      : new MemoryCredentialStore(),
    today: () => now().slice(0, 10),
    now,
    reportEmailOverride: env.REPORT_EMAIL_OVERRIDE ?? null,
    schedulerSecret: env.SCHEDULER_SECRET ?? null,
    webProxySecret: env.WEB_PROXY_SECRET || null,
    copilotLlmMerchants: parseMerchantList(env.COPILOT_GEMINI_MERCHANTS),
  };
}

/** "Amazon, Best Buy" -> {"amazon", "best buy"}. Unset or blank means no restriction. */
function parseMerchantList(value: string | undefined): ReadonlySet<string> | null {
  const names = (value ?? "").split(",").map((n) => n.trim().toLowerCase()).filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
}

/**
 * Without a signing key, tokens use a throwaway key and stop working on restart. Fine locally,
 * but on Vercel every instance would have its own key, so production refuses to start.
 */
function requiredInProduction(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  if (!value && env.NODE_ENV === "production") throw new Error(`${name} must be set in production.`);
  return value || undefined;
}
