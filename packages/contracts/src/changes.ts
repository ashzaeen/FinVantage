import { z } from "zod";
import { CreateTransaction, NewAccount, NewTransaction } from "./account";
import { NewCategoryRule } from "./categories";
import { Id } from "./common";
import { NewGoal } from "./goal";
import { BudgetLimit } from "./spending";
import { SubscriptionStatus } from "./subscription";

/** What `PATCH /v1/transactions/:id` takes: a whole transaction, not a patch. */
export const TransactionEdit = NewTransaction.extend({ category: z.string().nullable(), isRecurring: z.boolean() });
export type TransactionEdit = z.infer<typeof TransactionEdit>;

/**
 * A change to the user's data that the Advisor proposed. The Advisor never makes it: the browser
 * sends it through the ordinary route when the user confirms, by tapping or, for a change that is
 * not a delete, by saying yes. Each request carries what undoing it needs.
 */
export const ChangeRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_transaction"), body: CreateTransaction }),
  z.object({ action: z.literal("update_transaction"), id: Id, body: TransactionEdit, previous: TransactionEdit }),
  /** Deletes a transaction the user entered, or hides a bank one. `manual` says which, so the confirmation can be honest about it. */
  z.object({ action: z.literal("remove_transaction"), id: Id, manual: z.boolean() }),
  z.object({ action: z.literal("set_budget"), body: BudgetLimit, previous: BudgetLimit.nullable() }),
  z.object({ action: z.literal("remove_budget"), previous: BudgetLimit }),
  /** The browser builds this one from a goal draft, so a spoken yes can save it. */
  z.object({ action: z.literal("create_goal"), body: NewGoal }),
  z.object({ action: z.literal("update_goal"), id: Id, body: NewGoal, previous: NewGoal }),
  z.object({ action: z.literal("remove_goal"), id: Id, previous: NewGoal }),
  z.object({ action: z.literal("set_subscription_status"), id: Id, status: SubscriptionStatus, previousStatus: SubscriptionStatus }),
  /** Several goals at once, such as moving one to the top and shifting the others down. */
  z.object({ action: z.literal("reorder_goals"), changes: z.array(z.object({ id: Id, body: NewGoal, previous: NewGoal })).min(1).max(20) }),
  /** Several budgets at once, such as the app's suggestions. */
  z.object({ action: z.literal("set_budgets"), changes: z.array(z.object({ body: BudgetLimit, previous: BudgetLimit.nullable() })).min(1).max(20) }),
  z.object({ action: z.literal("update_account"), id: Id, body: NewAccount, previous: NewAccount }),
  /** Always file a merchant under a category. It also moves past transactions, so undoing it records and reverts exactly what moved. */
  z.object({ action: z.literal("create_category_rule"), body: NewCategoryRule }),
  /** Moves transactions to a category. `previous` groups them by where each came from, so it can be put back. */
  z.object({ action: z.literal("bulk_recategorize"), categoryId: z.string().min(1), previous: z.array(z.object({ categoryId: z.string().nullable(), ids: z.array(Id).min(1).max(200) })).min(1).max(40) }),
  /** Things that cannot be taken back, or leave the app. Each needs a tap. */
  z.object({ action: z.literal("email_report"), id: Id, quarter: z.string() }),
  z.object({ action: z.literal("delete_conversation"), id: Id }),
  z.object({ action: z.literal("clear_copilot_events"), count: z.number().int().nonnegative() }),
  z.object({ action: z.literal("delete_life_event"), id: Id }),
  /** Splits one transaction into two to five. The parts must add up to the original, which is kept for undo. */
  z.object({
    action: z.literal("split_transaction"),
    id: Id,
    parts: z.array(z.object({ amountCents: z.number().int(), categoryId: z.string().min(1).nullable() })).min(2).max(5),
    previous: TransactionEdit,
  }),
]);
export type ChangeRequest = z.infer<typeof ChangeRequest>;

/** The card the user confirms. `readBack` is written in code, so the spoken confirmation always has every figure. */
export const ChangeDraft = z.object({
  kind: z.literal("change_draft"),
  title: z.string(),
  /** What will change, one fact per line, such as "Amount" and "$42.00". */
  lines: z.array(z.object({ label: z.string(), value: z.string() })).max(12),
  /** One sentence that says the whole change. Spoken before asking the user to confirm. */
  readBack: z.string(),
  /** Removes something or cannot be taken back. Confirmed by a tap, never by voice alone. */
  destructive: z.boolean(),
  /** The confirm button's words when "Confirm Removal" would be wrong, such as "Send Email". */
  confirmLabel: z.string().optional(),
  /** Can be undone for a short while after it is saved. */
  undoable: z.boolean(),
  request: ChangeRequest,
});
export type ChangeDraft = z.infer<typeof ChangeDraft>;
