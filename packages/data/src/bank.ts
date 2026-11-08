import type { Account } from "@finvantage/contracts";
import { loadDemoProfileFixture } from "./profile";

export class NotImplementedError extends Error {}

/** Synthetic demo data only. Live bank connections are not enabled in this version. */
export interface BankDataProvider {
  readonly name: string;
  createLinkToken(userId: string): Promise<string>;
  exchangePublicToken(userId: string, publicToken: string): Promise<Account[]>;
}

class SyntheticProvider implements BankDataProvider {
  readonly name = "synthetic";

  async createLinkToken() { return "synthetic-link-token"; }
  async exchangePublicToken() { return loadDemoProfileFixture().accounts; }
}

export function createBankProvider(_env: NodeJS.ProcessEnv = process.env): BankDataProvider {
  return new SyntheticProvider();
}
