import { assignCategory, categorizePlaidDetailed, type Transaction } from "@finvantage/contracts";
import type { LedgerStore, SpendingStore } from "@finvantage/data";
import { ruleCategoryFor } from "./catalog";

/**
 * Applies the user's merchant rules to the ledger they read, so bank-synced transactions follow
 * them the moment they arrive. Only a transaction still at the category Plaid gave it is touched:
 * one the user moved by hand keeps the category they chose.
 */
export function withCategoryRules(ledger: LedgerStore, spending: SpendingStore): LedgerStore {
  return new Proxy(ledger, {
    get(target, prop, receiver) {
      if (prop === "listTransactions") {
        return async (userId: string, limit: number): Promise<Transaction[]> => {
          const [transactions, { rules }] = await Promise.all([target.listTransactions(userId, limit), spending.get(userId)]);
          if (rules.length === 0) return transactions;
          return transactions.map((t) => {
            const plaid = categorizePlaidDetailed(t.categoryDetailed);
            if (t.category !== plaid.category || t.subcategory !== plaid.subcategory) return t;
            const ruled = ruleCategoryFor(rules, t.merchant);
            return ruled ? { ...t, ...assignCategory(ruled) } : t;
          });
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
