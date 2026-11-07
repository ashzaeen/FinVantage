import type { Account } from "@finvantage/contracts";
import { loadDemoProfileFixture } from "./profile";

export class NotImplementedError extends Error {}

/** Where account data comes from. Synthetic by default; Plaid sandbox is P2. */
export interface BankDataProvider {
  readonly name: string;
  createLinkToken(userId: string): Promise<string>;
  exchangePublicToken(userId: string, publicToken: string): Promise<Account[]>;
}

class SyntheticProvider implements BankDataProvider {
  readonly name = "synthetic";

  async createLinkToken() {
    return "synthetic-link-token";
  }

  async exchangePublicToken() {
    return loadDemoProfileFixture().accounts;
  }
}

/** STUB(platform): P2, sandbox only. Production bank connections are out of scope for v1. */
class PlaidProvider implements BankDataProvider {
  readonly name = "plaid";

  async createLinkToken(): Promise<string> {
    throw new NotImplementedError("Plaid sandbox is not wired up yet.");
  }

  async exchangePublicToken(): Promise<Account[]> {
    throw new NotImplementedError("Plaid sandbox is not wired up yet.");
  }
}

export function createBankProvider(env: NodeJS.ProcessEnv = process.env): BankDataProvider {
  return env.BANK_PROVIDER === "plaid" ? new PlaidProvider() : new SyntheticProvider();
}
