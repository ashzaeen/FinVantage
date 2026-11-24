import { z } from "zod";
import {
  CreateTransaction,
  NewGoal,
  TransactionEdit,
  assignCategory,
  formatUsd,
  type ChangeDraft,
  type Goal,
  type SpendingCategory,
  type Subscription,
  type Transaction,
} from "@finvantage/contracts";
import type { AdvisorTool, AdvisorToolResult } from "@finvantage/llm";
import type { AppDeps } from "../deps";
import { listCard, shortDay } from "./cards";
import { forModel, type AdvisorReadApi } from "./read-api";
import { tool } from "./tool-kit";

/**
 * Tools that PROPOSE a change to the user's data. None of them saves anything: each returns a
 * `change_draft` card, and the browser sends the change through the ordinary route when the user
 * confirms. Every figure that changes must be one the user said, and the code, not the model,
 * finds the record to change, so a vague request never picks between several.
 */
export interface ChangeToolContext {
  api: AdvisorReadApi;
  deps: AppDeps;
  userId: string;
  /** The chat this turn belongs to, so "delete this chat" knows which. Null for a stateless chat. */
  conversationId: string | null;
}

export const toCents = (dollars: number) => Math.round(dollars * 100);

/** The draft as a tool result. `data` is what the model reads; the card is what the user confirms. */
export function draftResult(draft: Omit<ChangeDraft, "kind">): AdvisorToolResult {
  return {
    data: forModel({
      draft: { title: draft.title, details: draft.lines, readBack: draft.readBack, saved: false },
      instruction: draft.destructive
        ? "Nothing is saved. Removing needs the user to tap Confirm on screen."
        : "Nothing is saved. The user confirms by saying yes or tapping Confirm. Do not say it was done.",
    }),
    citation: "Change draft",
    summary: [`Proposed, not saved: ${draft.readBack}`],
    attachment: { kind: "change_draft", ...draft },
  };
}

/** The one category a spoken name means. Ambiguity is an error naming the options, never a guess. */
export async function findCategory(api: AdvisorReadApi, text: string): Promise<SpendingCategory> {
  const wanted = text.trim().toLowerCase();
  const all = (await api.listSpendingCategories()).filter((c) => !c.hidden);
  const exact = all.filter((c) => c.label.toLowerCase() === wanted || c.id === wanted);
  const found = exact.length > 0 ? exact : all.filter((c) => c.label.toLowerCase().includes(wanted));
  if (found.length === 1) return found[0]!;
  if (found.length === 0) throw new Error(`No category is called "${text}". Ask the user which category they mean.`);
  // "Groceries" is both a category and its own subcategory. The broadest match is what people mean; only a real tie is a question.
  const depth = (c: SpendingCategory) => c.id.split(".").length;
  const broadest = found.filter((c) => depth(c) === Math.min(...found.map(depth)));
  if (broadest.length === 1) return broadest[0]!;
  throw new Error(`"${text}" could be ${found.slice(0, 6).map((c) => c.label).join(", ")}. Ask the user which.`);
}

export function findByName<T>(items: T[], name: (item: T) => string, text: string, what: string): T {
  const wanted = text.trim().toLowerCase();
  const exact = items.filter((i) => name(i).toLowerCase() === wanted);
  const found = exact.length > 0 ? exact : items.filter((i) => name(i).toLowerCase().includes(wanted));
  if (found.length === 1) return found[0]!;
  if (found.length === 0) throw new Error(`No ${what} matches "${text}". Ask the user which one they mean.`);
  throw new Error(`Several ${what}s match "${text}": ${found.slice(0, 6).map(name).join(", ")}. Ask the user which one.`);
}

/** A saved transaction as the edit route takes it back. */
export function editOf(t: Transaction): TransactionEdit {
  return TransactionEdit.parse({
    accountId: t.accountId,
    date: t.date,
    amountCents: t.amountCents,
    currency: t.currency,
    merchant: t.merchant,
    subcategory: t.subcategory,
    pending: t.pending,
    categoryDetailed: t.categoryDetailed,
    paymentChannel: t.paymentChannel,
    logoUrl: t.logoUrl,
    category: t.category,
    isRecurring: t.isRecurring,
  });
}

export interface TransactionSelector {
  merchant?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  amount?: number | undefined;
}

/** The transactions a spoken description points at, newest first. Several is not a guess: the caller asks which. */
export async function selectTransactions(api: AdvisorReadApi, s: TransactionSelector): Promise<Transaction[]> {
  if (!s.merchant && !s.from && !s.to && s.amount === undefined) throw new Error("Which transaction? Ask for the merchant, the date, or the amount.");
  const all = await api.listTransactions({ query: { limit: 500 } });
  return all.filter((t) =>
    (!s.merchant || t.merchant.toLowerCase().includes(s.merchant.toLowerCase())) &&
    (!s.from || t.date >= s.from) &&
    (!s.to || t.date <= s.to) &&
    (s.amount === undefined || Math.abs(t.amountCents) === toCents(s.amount)),
  );
}

/** What the user sees, and the Advisor reads, when a description matches more than one transaction. */
export function whichOne(matches: Transaction[]): AdvisorToolResult {
  return {
    data: forModel({
      matches: matches.length,
      candidates: matches.slice(0, 8).map((t) => ({ date: t.date, merchant: t.merchant, amountCents: Math.abs(t.amountCents) })),
      instruction: "Several transactions match, and they are on screen. Ask which one: the user can give the merchant and date, or the amount. Do not guess and do not propose a change yet.",
    }),
    citation: "Transactions",
    summary: [`${matches.length} transactions match. Ask which one.`],
    attachment: listCard({
      title: "Which One?",
      source: `${matches.length} match`,
      total: null,
      rows: matches.map((t) => ({ label: t.merchant, detail: `${shortDay(t.date)} · ${t.category ?? "Uncategorized"}`, valueCents: Math.abs(t.amountCents) })),
    }),
  };
}

export const goalFields = (g: Goal): NewGoal =>
  NewGoal.parse({
    name: g.name,
    targetCents: g.targetCents,
    currentCents: g.currentCents,
    targetDate: g.targetDate,
    priorityRank: g.priorityRank,
    flexibility: g.flexibility,
    linkedAccountId: g.linkedAccountId,
    ...(g.status ? { status: g.status } : {}),
    ...(g.kind ? { kind: g.kind } : {}),
  });

export const isoDate = z.iso.date();
export const STATED = (value: number) => `${formatUsd(toCents(value))} is not an amount the user said. Ask them what it should be.`;

export function changeTools({ api, deps }: ChangeToolContext): AdvisorTool[] {
  const today = () => deps.today();
  const when = (iso: string) => (iso === today() ? "today" : shortDay(iso));

  return [
    tool(
      "propose_add_transaction",
      "Propose adding an expense or a piece of income the user described, such as 'add a $42 expense at Trader Joe's'. It is NOT saved: the user confirms. Use only an amount the user said; if they gave none, ask. The date is today unless they said otherwise. If they have several accounts and did not say which, ask.",
      z.object({
        merchant: z.string().min(1).max(100),
        amount: z.number().positive().describe("Dollars, a positive number."),
        direction: z.enum(["out", "in"]).optional().describe("out for an expense (the default), in for income."),
        date: isoDate.optional().describe("YYYY-MM-DD. Today if the user did not say."),
        category: z.string().optional().describe("Part of a category name, such as groceries or dining."),
        account: z.string().optional().describe("Part of an account's name."),
      }),
      async (a, turn) => {
        if (!turn.isGrounded(a.amount)) throw new Error(STATED(a.amount));
        const date = a.date ?? today();
        if (date > today()) throw new Error("That date is in the future. Ask the user for a date that is today or earlier.");
        const accounts = await api.listAccounts();
        const account = a.account
          ? findByName(accounts, (x) => `${x.name} ${x.institution}`.trim(), a.account, "account")
          : accounts.filter((x) => x.type === "checking").length === 1
            ? accounts.find((x) => x.type === "checking")!
            : (() => { throw new Error(`Which account? The user has ${accounts.map((x) => x.name).join(", ")}.`); })();
        const category = a.category ? await findCategory(api, a.category) : null;
        const income = a.direction === "in";
        const cents = toCents(a.amount);
        const body = CreateTransaction.parse({
          accountId: account.id,
          date,
          amountCents: income ? cents : -cents,
          currency: "USD",
          merchant: a.merchant.trim(),
          ...(category ? assignCategory(category.id) : { category: null, subcategory: null }),
          isRecurring: false,
          pending: false,
          categoryDetailed: null,
          paymentChannel: null,
          logoUrl: null,
        });
        return draftResult({
          title: income ? "Add Income" : "Add Expense",
          lines: [
            { label: income ? "Income" : "Expense", value: formatUsd(cents) },
            { label: "Merchant", value: body.merchant },
            { label: "Account", value: account.name },
            { label: "Date", value: when(date) },
            { label: "Category", value: category?.label ?? "Chosen by your rules" },
          ],
          readBack: `Add ${income ? "an income of" : "an expense of"} ${formatUsd(cents)} ${income ? "from" : "at"} ${body.merchant}, ${income ? "to" : "on"} ${account.name}, ${when(date)}${category ? `, under ${category.label}` : ""}.`,
          destructive: false,
          undoable: true,
          request: { action: "add_transaction", body },
        });
      },
    ),

    tool(
      "propose_edit_transaction",
      "Propose changing one existing transaction: its amount, merchant, date or category. Say which transaction with the merchant, a date range, or its current amount, and what to change. It finds the transaction itself: if several match it shows them and you must ask which, never guess. NOT saved: the user confirms. A new amount must be one the user said.",
      z.object({
        merchant: z.string().optional().describe("Part of the merchant's name."),
        from: isoDate.optional().describe("Earliest date, YYYY-MM-DD."),
        to: isoDate.optional().describe("Latest date, YYYY-MM-DD."),
        amount: z.number().positive().optional().describe("The transaction's current amount in dollars, to tell similar ones apart."),
        newAmount: z.number().positive().optional().describe("The corrected amount in dollars."),
        newMerchant: z.string().min(1).max(100).optional(),
        newDate: isoDate.optional(),
        newCategory: z.string().optional().describe("Part of a category name."),
      }),
      async (a, turn) => {
        if (a.newAmount === undefined && !a.newMerchant && !a.newDate && !a.newCategory) throw new Error("What should change? Ask the user.");
        if (a.newAmount !== undefined && !turn.isGrounded(a.newAmount)) throw new Error(STATED(a.newAmount));
        if (a.newDate && a.newDate > today()) throw new Error("That date is in the future.");

        const matches = await selectTransactions(api, a);
        if (matches.length === 0) throw new Error("No transaction matches that. Ask the user for the merchant, date or amount.");
        if (matches.length > 1) return whichOne(matches);

        const t = matches[0]!;
        if (t.currency !== "USD") throw new Error("That transaction is not in dollars. It has to be edited on the Transactions page.");
        const before = editOf(t);
        const category = a.newCategory ? await findCategory(api, a.newCategory) : null;
        const after = TransactionEdit.parse({
          ...before,
          merchant: a.newMerchant?.trim() ?? before.merchant,
          date: a.newDate ?? before.date,
          amountCents: a.newAmount === undefined ? before.amountCents : Math.sign(before.amountCents || -1) * toCents(a.newAmount),
          ...(category ? assignCategory(category.id) : {}),
        });
        const changes: Array<{ label: string; value: string; said: string }> = [];
        if (after.amountCents !== before.amountCents) {
          const [x, y] = [formatUsd(Math.abs(before.amountCents)), formatUsd(Math.abs(after.amountCents))];
          changes.push({ label: "Amount", value: `${x} to ${y}`, said: `the amount from ${x} to ${y}` });
        }
        if (after.merchant !== before.merchant) changes.push({ label: "Merchant", value: `${before.merchant} to ${after.merchant}`, said: `the merchant from ${before.merchant} to ${after.merchant}` });
        if (after.date !== before.date) changes.push({ label: "Date", value: `${shortDay(before.date)} to ${shortDay(after.date)}`, said: `the date from ${shortDay(before.date)} to ${shortDay(after.date)}` });
        if (category && (after.category !== before.category || after.subcategory !== before.subcategory)) changes.push({ label: "Category", value: `${t.category ?? "Uncategorized"} to ${category.label}`, said: `the category to ${category.label}` });
        if (changes.length === 0) throw new Error("That is already how the transaction is. Nothing would change.");
        return draftResult({
          title: "Edit Transaction",
          lines: [{ label: "Transaction", value: `${t.merchant}, ${shortDay(t.date)}, ${formatUsd(Math.abs(t.amountCents))}` }, ...changes.map(({ label, value }) => ({ label, value }))],
          readBack: `Change the ${formatUsd(Math.abs(t.amountCents))} transaction at ${t.merchant} on ${shortDay(t.date)}: ${changes.map((c) => c.said).join(", and ")}.`,
          destructive: false,
          undoable: true,
          request: { action: "update_transaction", id: t.id, body: after, previous: before },
        });
      },
    ),

    tool(
      "propose_remove_transaction",
      "Propose deleting one transaction. One the user entered themselves is deleted for good; one from their bank is hidden instead (it leaves their totals and can be restored). Say which with the merchant, a date range, or its amount. It finds the transaction itself: if several match it shows them and you must ask which. NOT saved: removing needs the user to tap Confirm.",
      z.object({
        merchant: z.string().optional(),
        from: isoDate.optional().describe("Earliest date, YYYY-MM-DD."),
        to: isoDate.optional().describe("Latest date, YYYY-MM-DD."),
        amount: z.number().positive().optional().describe("Its amount in dollars, to tell similar ones apart."),
      }),
      async (a) => {
        const matches = await selectTransactions(api, a);
        if (matches.length === 0) throw new Error("No transaction matches that. Ask the user for the merchant, date or amount.");
        if (matches.length > 1) return whichOne(matches);
        const t = matches[0]!;
        const manual = t.manual === true;
        const what = `the ${formatUsd(Math.abs(t.amountCents))} transaction at ${t.merchant} on ${shortDay(t.date)}`;
        return draftResult({
          title: manual ? "Delete Transaction" : "Hide Transaction",
          lines: [
            { label: "Transaction", value: `${t.merchant}, ${shortDay(t.date)}, ${formatUsd(Math.abs(t.amountCents))}` },
            { label: "What Happens", value: manual ? "Deleted for good" : "Hidden from your totals" },
          ],
          readBack: manual
            ? `Delete ${what}. It was added by you, and this can't be undone.`
            : `Hide ${what}. It comes from your bank, so it stays on file but leaves your totals. You can restore it from the Hidden tab.`,
          destructive: true,
          undoable: !manual,
          request: { action: "remove_transaction", id: t.id, manual },
        });
      },
    ),

    tool(
      "propose_set_budget",
      "Propose setting, or changing, the monthly budget for a category, such as 'set a $400 food budget'. NOT saved: the user confirms. The limit must be an amount the user said.",
      z.object({
        category: z.string().min(1).describe("Part of a category's name."),
        monthlyLimit: z.number().positive().describe("Dollars per month."),
      }),
      async (a, turn) => {
        if (!turn.isGrounded(a.monthlyLimit)) throw new Error(STATED(a.monthlyLimit));
        const category = await findCategory(api, a.category);
        const previous = (await api.listBudgets()).find((b) => b.category === category.id);
        const cents = toCents(a.monthlyLimit);
        const was = previous ? formatUsd(previous.limitCents) : null;
        return draftResult({
          title: previous ? "Change Budget" : "Set Budget",
          lines: [
            { label: "Category", value: category.label },
            { label: "Monthly Limit", value: formatUsd(cents) },
            ...(was ? [{ label: "Was", value: was }] : []),
          ],
          readBack: `${previous ? "Change" : "Set"} the ${category.label} budget to ${formatUsd(cents)} a month${was ? `, from ${was}` : ""}.`,
          destructive: false,
          undoable: true,
          request: { action: "set_budget", body: { category: category.id, monthlyLimitCents: cents }, previous: previous ? { category: category.id, monthlyLimitCents: previous.limitCents } : null },
        });
      },
    ),

    tool(
      "propose_remove_budget",
      "Propose removing the budget for a category. NOT saved: removing needs the user to tap Confirm.",
      z.object({ category: z.string().min(1) }),
      async (a) => {
        const category = await findCategory(api, a.category);
        const budget = (await api.listBudgets()).find((b) => b.category === category.id);
        if (!budget) throw new Error(`There is no ${category.label} budget to remove.`);
        return draftResult({
          title: "Remove Budget",
          lines: [{ label: "Category", value: category.label }, { label: "Monthly Limit", value: formatUsd(budget.limitCents) }],
          readBack: `Remove the ${formatUsd(budget.limitCents)} a month ${category.label} budget.`,
          destructive: true,
          undoable: true,
          request: { action: "remove_budget", previous: { category: category.id, monthlyLimitCents: budget.limitCents } },
        });
      },
    ),

    tool(
      "propose_update_goal",
      "Propose changing an existing goal: its name, target amount, target date, or how much is saved. NOT saved: the user confirms. Amounts must be ones the user said. To create a new goal use draft_goal.",
      z.object({
        goal: z.string().min(1).describe("Part of the goal's name."),
        newName: z.string().min(1).max(80).optional(),
        targetAmount: z.number().positive().optional().describe("The new target in dollars."),
        targetDate: isoDate.optional().describe("The new target date, YYYY-MM-DD."),
        savedSoFar: z.number().nonnegative().optional().describe("How much is saved now, in dollars."),
      }),
      async (a, turn) => {
        if (a.targetAmount === undefined && a.savedSoFar === undefined && !a.targetDate && !a.newName) throw new Error("What should change about the goal? Ask the user.");
        for (const v of [a.targetAmount, a.savedSoFar]) if (v !== undefined && !turn.isGrounded(v)) throw new Error(STATED(v));
        const goals = await api.listGoals();
        const goal = findByName(goals, (g) => g.name, a.goal, "goal");
        const before = goalFields(goal);
        const after = NewGoal.parse({
          ...before,
          name: a.newName?.trim() ?? before.name,
          targetCents: a.targetAmount === undefined ? before.targetCents : toCents(a.targetAmount),
          currentCents: a.savedSoFar === undefined ? before.currentCents : toCents(a.savedSoFar),
          targetDate: a.targetDate ?? before.targetDate,
        });
        const changes: Array<{ label: string; value: string; said: string }> = [];
        if (after.name !== before.name) changes.push({ label: "Name", value: `${before.name} to ${after.name}`, said: `the name to ${after.name}` });
        if (after.targetCents !== before.targetCents) changes.push({ label: "Target", value: `${formatUsd(before.targetCents)} to ${formatUsd(after.targetCents)}`, said: `the target from ${formatUsd(before.targetCents)} to ${formatUsd(after.targetCents)}` });
        if (after.targetDate !== before.targetDate) changes.push({ label: "Target Date", value: `${before.targetDate} to ${after.targetDate}`, said: `the target date from ${before.targetDate} to ${after.targetDate}` });
        if (after.currentCents !== before.currentCents) changes.push({ label: "Saved", value: `${formatUsd(before.currentCents)} to ${formatUsd(after.currentCents)}`, said: `the amount saved from ${formatUsd(before.currentCents)} to ${formatUsd(after.currentCents)}` });
        if (changes.length === 0) throw new Error("The goal is already like that. Nothing would change.");
        return draftResult({
          title: "Change Goal",
          lines: [{ label: "Goal", value: before.name }, ...changes.map(({ label, value }) => ({ label, value }))],
          readBack: `Change the ${before.name} goal: ${changes.map((c) => c.said).join(", and ")}.`,
          destructive: false,
          undoable: true,
          request: { action: "update_goal", id: goal.id, body: after, previous: before },
        });
      },
    ),

    tool(
      "propose_remove_goal",
      "Propose deleting a goal. NOT saved: removing needs the user to tap Confirm, and it cannot be undone.",
      z.object({ goal: z.string().min(1).describe("Part of the goal's name.") }),
      async (a) => {
        const goal = findByName(await api.listGoals(), (g) => g.name, a.goal, "goal");
        return draftResult({
          title: "Remove Goal",
          lines: [{ label: "Goal", value: goal.name }, { label: "Target", value: formatUsd(goal.targetCents) }, { label: "Saved", value: formatUsd(goal.currentCents) }],
          readBack: `Delete the ${goal.name} goal, which has ${formatUsd(goal.currentCents)} saved toward ${formatUsd(goal.targetCents)}.`,
          destructive: true,
          undoable: false,
          request: { action: "remove_goal", id: goal.id, previous: goalFields(goal) },
        });
      },
    ),

    tool(
      "propose_subscription_status",
      "Propose recording what the user decided about a subscription or bill: keep it, they are cancelling it, or they cancelled it. This only records their choice; FinVantage cancels nothing at the company. NOT saved: the user confirms.",
      z.object({
        merchant: z.string().min(1).describe("Part of the subscription's name."),
        status: z.enum(["keep", "cancelling", "cancelled"]),
      }),
      async (a) => {
        const overview = await api.listSubscriptions();
        const sub: Subscription = findByName([...overview.subscriptions, ...overview.bills, ...overview.cancelled], (s) => s.merchant, a.merchant, "subscription");
        if (sub.status === a.status) throw new Error(`${sub.merchant} is already marked ${a.status}.`);
        const words = { keep: "keeping", cancelling: "cancelling", cancelled: "cancelled" } as const;
        return draftResult({
          title: "Update Subscription",
          lines: [{ label: "Subscription", value: sub.merchant }, { label: "Status", value: `${sub.status} to ${a.status}` }],
          readBack: `Mark ${sub.merchant} as ${words[a.status]}. This only records your choice; nothing is cancelled at the company.`,
          destructive: false,
          undoable: true,
          request: { action: "set_subscription_status", id: sub.id, status: a.status, previousStatus: sub.status },
        });
      },
    ),
  ];
}

/**
 * What is said aloud for a draft: the read-back, written in code, then how to answer. Used in
 * place of the model's wording on a voice turn, so a spoken confirmation always has every figure.
 */
export function voiceConfirmation(draft: Pick<ChangeDraft, "readBack" | "destructive" | "confirmLabel">): string {
  const button = draft.confirmLabel ?? "Confirm Removal";
  return `${draft.readBack} ${draft.destructive ? `Tap ${button} on screen to go ahead, or say no to cancel.` : "Say yes to save it, or no to cancel."}`;
}
