import { randomUUID } from "node:crypto";
import { PlaidClient, type BankItemUpdate, type PlaidEnv } from "./plaid/client";
import { loadDemoProfileSource } from "./profile";

export class NotImplementedError extends Error {}

/**
 * Where bank data comes from. Plaid when PLAID_CLIENT_ID and PLAID_SECRET are set, otherwise a
 * synthetic stand-in that returns the demo bank, so local dev and tests work without keys.
 * Both speak Plaid's shapes, so the sync code is the same either way.
 */
export interface BankDataProvider {
  readonly name: "plaid" | "synthetic";
  /** True for Plaid Sandbox and the synthetic stand-in: test banks may be linked without Link. */
  readonly sandbox: boolean;
  createLinkToken(userId: string): Promise<string>;
  exchangePublicToken(publicToken: string): Promise<{ itemId: string; accessToken: string }>;
  /** A public token for a test bank, as if the user had completed Link. Sandbox only. */
  createSandboxPublicToken(): Promise<string>;
  /** The item's latest data. Transactions start after `cursor` (null for the first sync). */
  fetchItem(accessToken: string, cursor: string | null): Promise<BankItemUpdate>;
  removeItem(accessToken: string): Promise<void>;
}

class PlaidProvider implements BankDataProvider {
  readonly name = "plaid";
  constructor(private readonly client: PlaidClient) {}
  get sandbox() {
    return this.client.env === "sandbox";
  }
  createLinkToken(userId: string) {
    return this.client.createLinkToken(userId);
  }
  exchangePublicToken(publicToken: string) {
    return this.client.exchangePublicToken(publicToken);
  }
  createSandboxPublicToken() {
    if (!this.sandbox) throw new NotImplementedError("Test banks exist only in Plaid Sandbox.");
    return this.client.createSandboxPublicToken();
  }
  fetchItem(accessToken: string, cursor: string | null) {
    return this.client.fetchItem(accessToken, cursor);
  }
  removeItem(accessToken: string) {
    return this.client.removeItem(accessToken);
  }
}

/** The demo bank from the fixture, with IDs made unique per link. The first sync returns everything. */
class SyntheticProvider implements BankDataProvider {
  readonly name = "synthetic";
  readonly sandbox = true;

  async createLinkToken() {
    return "synthetic-link-token";
  }
  async createSandboxPublicToken() {
    return "synthetic-public-token";
  }
  async exchangePublicToken() {
    const itemId = `synthetic_${randomUUID().slice(0, 8)}`;
    return { itemId, accessToken: itemId };
  }
  async fetchItem(accessToken: string, cursor: string | null): Promise<BankItemUpdate> {
    const bank = loadDemoProfileSource().bank[0]!;
    const id = (original: string) => `${accessToken}__${original}`;
    const onAccount = <T extends { account_id: string }>(row: T): T => ({ ...row, account_id: id(row.account_id) });
    const stream = (s: (typeof bank.recurring.inflow_streams)[number]) => ({
      ...onAccount(s),
      stream_id: id(s.stream_id),
      transaction_ids: s.transaction_ids.map(id),
    });
    return {
      item: { item_id: accessToken, institution_id: bank.item.institution_id, institution_name: bank.item.institution_name },
      accounts: bank.accounts.map(onAccount),
      added: cursor ? [] : bank.transactions.map((t) => ({ ...onAccount(t), transaction_id: id(t.transaction_id) })),
      modified: [],
      removedTransactionIds: [],
      nextCursor: "synthetic-cursor",
      liabilities: {
        credit: bank.liabilities.credit?.map(onAccount) ?? null,
        mortgage: bank.liabilities.mortgage?.map(onAccount) ?? null,
        student: bank.liabilities.student?.map(onAccount) ?? null,
      },
      recurring: {
        inflow_streams: bank.recurring.inflow_streams.map(stream),
        outflow_streams: bank.recurring.outflow_streams.map(stream),
      },
      investments: { holdings: bank.investments.holdings.map(onAccount), securities: bank.investments.securities },
    };
  }
  async removeItem() {}
}

export function createBankProvider(env: NodeJS.ProcessEnv = process.env): BankDataProvider {
  const clientId = env.PLAID_CLIENT_ID?.trim();
  const secret = env.PLAID_SECRET?.trim();
  const choice = env.BANK_PROVIDER ?? (clientId && secret ? "plaid" : "synthetic");
  if (choice !== "plaid") return new SyntheticProvider();
  if (!clientId || !secret) throw new Error("BANK_PROVIDER=plaid needs PLAID_CLIENT_ID and PLAID_SECRET.");
  const plaidEnv = (env.PLAID_ENV ?? "sandbox") as PlaidEnv;
  if (plaidEnv !== "sandbox" && plaidEnv !== "production") throw new Error(`Unknown PLAID_ENV "${plaidEnv}".`);
  return new PlaidProvider(new PlaidClient({ clientId, secret, env: plaidEnv }));
}
