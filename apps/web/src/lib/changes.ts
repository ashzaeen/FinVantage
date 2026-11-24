import { ApiError, type ApiClient, type ChangeRequest } from "@finvantage/contracts";

/** The routes a confirmed change goes through: the same ones the pages use. */
export type ChangeApi = Pick<
  ApiClient,
  | "addTransaction"
  | "updateTransaction"
  | "removeTransaction"
  | "restoreTransaction"
  | "setBudget"
  | "deleteBudget"
  | "createGoal"
  | "updateGoal"
  | "deleteGoal"
  | "updateSubscription"
  | "updateAccount"
  | "listTransactions"
  | "listCategoryRules"
  | "createCategoryRule"
  | "deleteCategoryRule"
  | "bulkRecategorizeTransactions"
  | "splitTransaction"
  | "emailReport"
  | "deleteAdvisorConversation"
  | "clearCopilotEvents"
  | "deleteLifeEvent"
>;

/** The bulk route takes up to 200 ids. */
const chunks = <T,>(items: T[], size = 200): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** Where a transaction is filed: its most specific category. */
const filedUnder = (t: { category: string | null; subcategory: string | null }) => t.subcategory ?? t.category;

export interface AppliedChange {
  /** Reverses the change, or null when it cannot be reversed. */
  undo: (() => Promise<void>) | null;
}

/**
 * Saves a change the user confirmed, through the ordinary route, and returns how to undo it. The
 * Advisor never calls this: only a tap, or a spoken yes to a read-back, does.
 */
export async function applyChange(api: ChangeApi, request: ChangeRequest): Promise<AppliedChange> {
  switch (request.action) {
    case "add_transaction": {
      const saved = await api.addTransaction({ body: request.body });
      // A transaction entered by hand can be deleted, so an add is undone by deleting it.
      return { undo: async () => void (await api.removeTransaction({ params: { id: saved.id } })) };
    }
    case "update_transaction":
      await api.updateTransaction({ params: { id: request.id }, body: request.body });
      return { undo: async () => void (await api.updateTransaction({ params: { id: request.id }, body: request.previous })) };
    case "remove_transaction": {
      const { result } = await api.removeTransaction({ params: { id: request.id } });
      // Deleting a manual transaction is final. Hiding a bank one is undone by restoring it.
      return { undo: result === "hidden" ? async () => void (await api.restoreTransaction({ params: { id: request.id } })) : null };
    }
    case "set_budget":
      await api.setBudget({ body: request.body });
      return {
        undo: async () => {
          if (request.previous) await api.setBudget({ body: request.previous });
          else await api.deleteBudget({ params: { category: request.body.category } });
        },
      };
    case "remove_budget":
      await api.deleteBudget({ params: { category: request.previous.category } });
      return { undo: async () => void (await api.setBudget({ body: request.previous })) };
    case "create_goal": {
      const saved = await api.createGoal({ body: request.body });
      return { undo: async () => void (await api.deleteGoal({ params: { id: saved.id } })) };
    }
    case "update_goal":
      await api.updateGoal({ params: { id: request.id }, body: request.body });
      return { undo: async () => void (await api.updateGoal({ params: { id: request.id }, body: request.previous })) };
    case "remove_goal":
      await api.deleteGoal({ params: { id: request.id } });
      return { undo: null };
    case "reorder_goals":
      for (const c of request.changes) await api.updateGoal({ params: { id: c.id }, body: c.body });
      return { undo: async () => { for (const c of request.changes) await api.updateGoal({ params: { id: c.id }, body: c.previous }); } };
    case "set_budgets":
      for (const c of request.changes) await api.setBudget({ body: c.body });
      return {
        undo: async () => {
          for (const c of request.changes) {
            if (c.previous) await api.setBudget({ body: c.previous });
            else await api.deleteBudget({ params: { category: c.body.category } });
          }
        },
      };
    case "update_account":
      await api.updateAccount({ params: { id: request.id }, body: request.body });
      return { undo: async () => void (await api.updateAccount({ params: { id: request.id }, body: request.previous })) };
    case "create_category_rule": {
      // A rule also moves past transactions. Compare before and after to know exactly which, so undo can put them back.
      const before = await api.listTransactions({ query: { limit: 500 } });
      // A new rule replaces any rule for the same merchant text, so remember it to put it back.
      const replaced = (await api.listCategoryRules()).find((r) => r.merchantContains.toLowerCase() === request.body.merchantContains.trim().toLowerCase());
      const { rule } = await api.createCategoryRule({ body: request.body });
      const after = await api.listTransactions({ query: { limit: 500 } });
      const was = new Map(before.map((t) => [t.id, filedUnder(t)]));
      const moved = new Map<string | null, string[]>();
      for (const t of after) {
        if (was.has(t.id) && was.get(t.id) !== filedUnder(t)) moved.set(was.get(t.id) ?? null, [...(moved.get(was.get(t.id) ?? null) ?? []), t.id]);
      }
      return {
        undo: async () => {
          await api.deleteCategoryRule({ params: { id: rule.id } });
          if (replaced) await api.createCategoryRule({ body: { merchantContains: replaced.merchantContains, categoryId: replaced.categoryId, applyToPast: false } });
          for (const [categoryId, ids] of moved) for (const part of chunks(ids)) await api.bulkRecategorizeTransactions({ body: { ids: part, categoryId } });
        },
      };
    }
    case "bulk_recategorize":
      for (const part of chunks(request.previous.flatMap((g) => g.ids))) await api.bulkRecategorizeTransactions({ body: { ids: part, categoryId: request.categoryId } });
      return { undo: async () => { for (const g of request.previous) for (const part of chunks(g.ids)) await api.bulkRecategorizeTransactions({ body: { ids: part, categoryId: g.categoryId } }); } };
    case "split_transaction": {
      const saved = await api.splitTransaction({ params: { id: request.id }, body: { parts: request.parts } });
      // The first part is the original; the rest are new transactions of the user's, so they can be deleted.
      const added = saved.filter((t) => t.id !== request.id);
      return {
        undo: async () => {
          for (const t of added) await api.removeTransaction({ params: { id: t.id } });
          await api.updateTransaction({ params: { id: request.id }, body: request.previous });
        },
      };
    }
    // Each of these leaves the app or cannot be taken back, so there is no undo. The card says so before the tap.
    case "email_report":
      await api.emailReport({ params: { id: request.id }, body: {} }); // no address: the server picks it
      return { undo: null };
    case "delete_conversation":
      await api.deleteAdvisorConversation({ params: { id: request.id } });
      return { undo: null };
    case "clear_copilot_events":
      await api.clearCopilotEvents();
      return { undo: null };
    case "delete_life_event":
      await api.deleteLifeEvent({ params: { id: request.id } });
      return { undo: null };
    case "set_subscription_status":
      await api.updateSubscription({ params: { id: request.id }, body: { status: request.status } });
      return { undo: async () => void (await api.updateSubscription({ params: { id: request.id }, body: { status: request.previousStatus } })) };
  }
}

/** What went wrong saving a change, in words the user can act on. */
export function changeErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "demo_read_only" || err.status === 401) return "This session is read-only. Reload the page to start a new one, then try again.";
    if (err.status === 404) return "That record has changed or no longer exists, so nothing was saved.";
    if (err.status === 400) return "That change wasn't accepted, so nothing was saved.";
  }
  return "That couldn't be saved. Please try again.";
}
