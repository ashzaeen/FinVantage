import { DEMO_USER_ID } from "./profile";
import type { LedgerStore } from "./stores";

/**
 * A signed-up user starts with a copy of the demo profile so the app is never empty. Once they
 * link a real or Sandbox bank, that bank is the truth about their money: the demo copy's accounts
 * (and their transactions) are hidden, so cash isn't counted twice and the Copilot, simulator, and
 * dashboard all see only the linked bank. Goals, income, and life events stay, because a bank
 * doesn't know them. Accounts the user added by hand stay too.
 *
 * Both ledger backends give the demo copy's records IDs of the form `<userId>__<original>`
 * (`demoProfileFor` and `demoSourceFor`), and neither lists the demo copy as a linked bank.
 */
export function preferLinkedBanks(ledger: LedgerStore): LedgerStore {
  const isDemoCopy = (userId: string, accountId: string) =>
    userId !== DEMO_USER_ID && accountId.startsWith(`${userId}__`);
  const hasLinkedBank = async (userId: string) => (await ledger.listBankItems(userId)).length > 0;

  return new Proxy(ledger, {
    get(target, prop, receiver) {
      if (prop === "listAccounts") {
        return async (userId: string) => {
          const accounts = await target.listAccounts(userId);
          if (!(await hasLinkedBank(userId))) return accounts;
          return accounts.filter((a) => !isDemoCopy(userId, a.id));
        };
      }
      if (prop === "listTransactions") {
        return async (userId: string, limit: number) => {
          if (!(await hasLinkedBank(userId))) return target.listTransactions(userId, limit);
          // Ask for everything, then trim, so hidden demo transactions don't eat into the limit.
          const all = await target.listTransactions(userId, Number.MAX_SAFE_INTEGER);
          return all.filter((t) => !isDemoCopy(userId, t.accountId)).slice(0, limit);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
