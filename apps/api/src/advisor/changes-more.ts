import { z } from "zod";
import { NewAccount, formatUsd, type Transaction } from "@finvantage/contracts";
import type { AdvisorTool } from "@finvantage/llm";
import { shortDay } from "./cards";
import {
  STATED,
  draftResult,
  editOf,
  findByName,
  findCategory,
  goalFields,
  isoDate,
  selectTransactions,
  toCents,
  whichOne,
  type ChangeToolContext,
} from "./changes";
import { tool } from "./tool-kit";

/**
 * More tools that only PROPOSE a change (see changes.ts): money into a goal, goal order, a merchant
 * rule, moving many transactions, splitting one, a card's terms, and the app's suggested budgets.
 * Every amount the user is asked to confirm is one they said, or one the app worked out itself.
 */

const rate = (r: number | null) => (r === null ? "none" : `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`);

/** Where a transaction is filed now. */
const filedUnder = (t: Pick<Transaction, "category" | "subcategory">) => t.subcategory ?? t.category;

/** Already in the category, or in one of its subcategories. Moving those up would only lose detail. */
const isInside = (t: Pick<Transaction, "category" | "subcategory">, id: string) => {
  const at = filedUnder(t);
  return at === id || (at !== null && at.startsWith(`${id}.`));
};

export function moreChangeTools({ api }: ChangeToolContext): AdvisorTool[] {
  return [
    tool(
      "propose_add_to_goal",
      "Propose adding money to a goal the user already has, such as 'I put $200 toward the trip'. It raises the amount saved. NOT saved: the user confirms. The amount must be one the user said.",
      z.object({
        goal: z.string().min(1).describe("Part of the goal's name."),
        amount: z.number().positive().describe("Dollars to add."),
      }),
      async (a, turn) => {
        if (!turn.isGrounded(a.amount)) throw new Error(STATED(a.amount));
        const goal = findByName(await api.listGoals(), (g) => g.name, a.goal, "goal");
        const before = goalFields(goal);
        const after = { ...before, currentCents: before.currentCents + toCents(a.amount) };
        return draftResult({
          title: "Add to Goal",
          lines: [
            { label: "Goal", value: before.name },
            { label: "Adding", value: formatUsd(toCents(a.amount)) },
            { label: "Saved", value: `${formatUsd(before.currentCents)} to ${formatUsd(after.currentCents)}` },
            { label: "Target", value: formatUsd(before.targetCents) },
          ],
          readBack: `Add ${formatUsd(toCents(a.amount))} to the ${before.name} goal, taking it from ${formatUsd(before.currentCents)} to ${formatUsd(after.currentCents)} saved of ${formatUsd(before.targetCents)}. This records the amount; no money moves.`,
          destructive: false,
          undoable: true,
          request: { action: "update_goal", id: goal.id, body: after, previous: before },
        });
      },
    ),

    tool(
      "propose_prioritize_goal",
      "Propose moving a goal in the priority order, such as 'make the emergency fund my top goal' (rank 1). Goals are funded in order, so the others shift down. NOT saved: the user confirms, and it moves no money.",
      z.object({
        goal: z.string().min(1).describe("Part of the goal's name."),
        rank: z.number().int().min(1).optional().describe("The new position, 1 for first. 1 if the user said top or first."),
      }),
      async (a) => {
        const goals = [...(await api.listGoals())].sort((x, y) => x.priorityRank - y.priorityRank);
        const target = findByName(goals, (g) => g.name, a.goal, "goal");
        const position = Math.min(a.rank ?? 1, goals.length);
        const order = goals.filter((g) => g.id !== target.id);
        order.splice(position - 1, 0, target);
        const changes = order
          .map((g, i) => ({ id: g.id, name: g.name, previous: goalFields(g), rank: i + 1 }))
          .filter((c) => c.rank !== c.previous.priorityRank)
          .map((c) => ({ id: c.id, name: c.name, previous: c.previous, body: { ...c.previous, priorityRank: c.rank } }));
        if (changes.length === 0) throw new Error(`${target.name} is already at that position. Nothing would change.`);
        const rankLine = (c: (typeof changes)[number]) => `${c.name}: ${c.previous.priorityRank} to ${c.body.priorityRank}`;
        return draftResult({
          title: "Change Goal Order",
          lines: changes.map((c) => ({ label: c.name, value: `Priority ${c.previous.priorityRank} to ${c.body.priorityRank}` })),
          readBack: `Move the ${target.name} goal to priority ${position}. ${changes.length > 1 ? `That changes ${changes.map(rankLine).join("; ")}.` : ""} Goals are funded in this order. No money moves.`.replace("  ", " "),
          destructive: false,
          undoable: true,
          request: { action: "reorder_goals", changes: changes.map(({ id, body, previous }) => ({ id, body, previous })) },
        });
      },
    ),

    tool(
      "propose_category_rule",
      "Propose a rule that always files a merchant under a category, such as 'always put Starbucks under Coffee'. It also moves that merchant's past transactions, and says how many. NOT saved: the user confirms.",
      z.object({
        merchant: z.string().min(2).max(60).describe("Part of the merchant's name."),
        category: z.string().min(1).describe("Part of a category's name."),
      }),
      async (a) => {
        const category = await findCategory(api, a.category);
        const merchant = a.merchant.trim();
        const all = await api.listTransactions({ query: { limit: 500 } });
        const affected = all.filter((t) => t.merchant.toLowerCase().includes(merchant.toLowerCase()) && filedUnder(t) !== category.id);
        const word = affected.length === 1 ? "transaction" : "transactions";
        // The app keeps one rule per merchant text, so a new one replaces the old.
        const replaced = (await api.listCategoryRules()).find((r) => r.merchantContains.toLowerCase() === merchant.toLowerCase());
        const replaces = replaced ? ` It replaces your existing rule for ${merchant}.` : "";
        return draftResult({
          title: "Add Category Rule",
          lines: [
            { label: "Merchant Contains", value: merchant },
            { label: "Always Filed Under", value: category.label },
            { label: "Past Transactions Moved", value: `${affected.length}` },
            ...(replaced ? [{ label: "Replaces", value: "Your existing rule for this merchant" }] : []),
          ],
          readBack: `Always file ${merchant} under ${category.label}. This also moves ${affected.length} past ${word} there.${replaces}`,
          destructive: false,
          undoable: true,
          request: { action: "create_category_rule", body: { merchantContains: merchant, categoryId: category.id, applyToPast: true } },
        });
      },
    ),

    tool(
      "propose_bulk_recategorize",
      "Propose moving all of a merchant's transactions to one category, such as 'move every Uber charge to Transport'. It says how many and their total. NOT saved: the user confirms. Narrow with dates if the user wants only some.",
      z.object({
        merchant: z.string().min(2).describe("Part of the merchant's name."),
        category: z.string().min(1).describe("Part of a category's name."),
        from: isoDate.optional().describe("Earliest date, YYYY-MM-DD."),
        to: isoDate.optional().describe("Latest date, YYYY-MM-DD."),
      }),
      async (a) => {
        const category = await findCategory(api, a.category);
        const matches = (await selectTransactions(api, { merchant: a.merchant, from: a.from, to: a.to })).filter((t) => !isInside(t, category.id));
        if (matches.length === 0) throw new Error(`Nothing to move: every ${a.merchant} transaction is already under ${category.label}.`);
        if (matches.length > 200) throw new Error(`That is ${matches.length} transactions, more than can be moved at once. Ask the user to narrow it with dates.`);
        const groups = new Map<string | null, string[]>();
        for (const t of matches) groups.set(filedUnder(t), [...(groups.get(filedUnder(t)) ?? []), t.id]);
        const total = matches.reduce((sum, t) => sum + Math.abs(t.amountCents), 0);
        return draftResult({
          title: "Move Transactions",
          lines: [
            { label: "Merchant", value: a.merchant },
            { label: "Transactions", value: `${matches.length}` },
            { label: "Total", value: formatUsd(total) },
            { label: "Move To", value: category.label },
          ],
          readBack: `Move ${matches.length} ${a.merchant} ${matches.length === 1 ? "transaction" : "transactions"}, ${formatUsd(total)} in all, to ${category.label}.`,
          destructive: false,
          undoable: true,
          request: { action: "bulk_recategorize", categoryId: category.id, previous: [...groups].map(([categoryId, ids]) => ({ categoryId, ids })) },
        });
      },
    ),

    tool(
      "propose_split_transaction",
      "Propose splitting one transaction into two to five parts with their own categories, such as 'split that $80 Costco charge between groceries and household'. Give each part's amount, or leave one part's amount out and it gets the rest. The parts must add up to the transaction. It finds the transaction itself: if several match it shows them and you must ask which. NOT saved: the user confirms. Amounts must be ones the user said.",
      z.object({
        merchant: z.string().optional(),
        from: isoDate.optional().describe("Earliest date, YYYY-MM-DD."),
        to: isoDate.optional().describe("Latest date, YYYY-MM-DD."),
        amount: z.number().positive().optional().describe("The transaction's full amount in dollars, to tell similar ones apart."),
        parts: z
          .array(z.object({ category: z.string().min(1), amount: z.number().positive().optional().describe("Dollars. Leave out for the rest.") }))
          .min(2)
          .max(5),
      }),
      async (a, turn) => {
        for (const p of a.parts) if (p.amount !== undefined && !turn.isGrounded(p.amount)) throw new Error(STATED(p.amount));
        if (a.parts.filter((p) => p.amount === undefined).length > 1) throw new Error("Only one part can be left to take the rest. Ask the user for the other amounts.");
        const matches = await selectTransactions(api, a);
        if (matches.length === 0) throw new Error("No transaction matches that. Ask the user for the merchant, date or amount.");
        if (matches.length > 1) return whichOne(matches);
        const t = matches[0]!;
        if (t.currency !== "USD") throw new Error("Only dollar transactions can be split. Ask the user to do it on the Transactions page.");
        const total = Math.abs(t.amountCents);
        const given = a.parts.reduce((sum, p) => sum + (p.amount === undefined ? 0 : toCents(p.amount)), 0);
        const rest = total - given;
        if (a.parts.some((p) => p.amount === undefined) ? rest <= 0 : rest !== 0) {
          throw new Error(`The parts add up to ${formatUsd(given)} but the transaction is ${formatUsd(total)}. Tell the user and ask for amounts that add up.`);
        }
        const sign = Math.sign(t.amountCents) || -1;
        const resolved = await Promise.all(a.parts.map(async (p) => ({ category: await findCategory(api, p.category), cents: p.amount === undefined ? rest : toCents(p.amount) })));
        return draftResult({
          title: "Split Transaction",
          lines: [{ label: "Transaction", value: `${t.merchant}, ${shortDay(t.date)}, ${formatUsd(total)}` }, ...resolved.map((p) => ({ label: p.category.label, value: formatUsd(p.cents) }))],
          readBack: `Split the ${formatUsd(total)} transaction at ${t.merchant} on ${shortDay(t.date)} into ${resolved.map((p) => `${formatUsd(p.cents)} for ${p.category.label}`).join(" and ")}.`,
          destructive: false,
          undoable: true,
          request: { action: "split_transaction", id: t.id, parts: resolved.map((p) => ({ amountCents: sign * p.cents, categoryId: p.category.id })), previous: editOf(t) },
        });
      },
    ),

    tool(
      "propose_update_account_terms",
      "Propose updating a card's or loan's interest rate (APR) or minimum payment, such as 'my Visa APR is 24.99%'. These are the terms the bank does not report. NOT saved: the user confirms. Numbers must be ones the user said.",
      z.object({
        account: z.string().min(1).describe("Part of the account's name."),
        apr: z.number().min(0).max(100).optional().describe("The annual rate as a percent, such as 24.99."),
        minimumPayment: z.number().nonnegative().optional().describe("Dollars a month."),
      }),
      async (a, turn) => {
        if (a.apr === undefined && a.minimumPayment === undefined) throw new Error("What should change: the APR, the minimum payment, or both? Ask the user.");
        for (const v of [a.apr, a.minimumPayment]) if (v !== undefined && !turn.isGrounded(v)) throw new Error(`${v} is not a number the user said. Ask them.`);
        const account = findByName(await api.listAccounts(), (x) => `${x.name} ${x.institution}`.trim(), a.account, "account");
        const { id: _id, userId: _userId, ...fields } = account;
        const before = NewAccount.parse(fields);
        const after = NewAccount.parse({
          ...before,
          ...(a.apr === undefined ? {} : { annualRate: Number((a.apr / 100).toFixed(6)) }),
          ...(a.minimumPayment === undefined ? {} : { minimumPaymentCents: toCents(a.minimumPayment) }),
        });
        const lines: Array<{ label: string; value: string }> = [{ label: "Account", value: account.name }];
        const said: string[] = [];
        if (after.annualRate !== before.annualRate) {
          lines.push({ label: "APR", value: `${rate(before.annualRate)} to ${rate(after.annualRate)}` });
          said.push(`the rate from ${rate(before.annualRate)} to ${rate(after.annualRate)}`);
        }
        if (after.minimumPaymentCents !== before.minimumPaymentCents) {
          const [x, y] = [before.minimumPaymentCents === null ? "none" : formatUsd(before.minimumPaymentCents), after.minimumPaymentCents === null ? "none" : formatUsd(after.minimumPaymentCents)];
          lines.push({ label: "Minimum Payment", value: `${x} to ${y}` });
          said.push(`the minimum payment from ${x} to ${y}`);
        }
        if (said.length === 0) throw new Error("The account already has those terms. Nothing would change.");
        return draftResult({
          title: "Update Account Terms",
          lines,
          readBack: `On ${account.name}, change ${said.join(" and ")}.`,
          destructive: false,
          undoable: true,
          request: { action: "update_account", id: account.id, body: after, previous: before },
        });
      },
    ),

    tool(
      "propose_budgets_from_suggestions",
      "Propose setting several budgets at once from the app's own suggestions (each is the middle of the last three months, rounded up). Use it for 'set budgets for me'. NOT saved: the user confirms the whole set in one card.",
      z.object({}),
      async () => {
        const [suggestions, budgets, categories] = await Promise.all([api.listBudgetSuggestions(), api.listBudgets(), api.listSpendingCategories()]);
        const label = (id: string) => categories.find((c) => c.id === id)?.label ?? id;
        const changes = suggestions
          .map((s) => ({ s, previous: budgets.find((b) => b.category === s.category) }))
          .filter(({ s, previous }) => previous?.limitCents !== s.suggestedLimitCents)
          .slice(0, 12)
          .map(({ s, previous }) => ({
            name: label(s.category),
            body: { category: s.category, monthlyLimitCents: s.suggestedLimitCents },
            previous: previous ? { category: s.category, monthlyLimitCents: previous.limitCents } : null,
          }));
        if (changes.length === 0) throw new Error("There are no new budget suggestions: every category with spending already has one.");
        const said = changes.slice(0, 6).map((c) => `${c.name} ${formatUsd(c.body.monthlyLimitCents)}`).join(", ");
        return draftResult({
          title: "Set Suggested Budgets",
          lines: changes.map((c) => ({ label: c.name, value: c.previous ? `${formatUsd(c.previous.monthlyLimitCents)} to ${formatUsd(c.body.monthlyLimitCents)}` : formatUsd(c.body.monthlyLimitCents) })),
          readBack: `Set ${changes.length} monthly ${changes.length === 1 ? "budget" : "budgets"}: ${said}${changes.length > 6 ? `, and ${changes.length - 6} more` : ""}. Each is the middle of your last three months.`,
          destructive: false,
          undoable: true,
          request: { action: "set_budgets", changes: changes.map(({ body, previous }) => ({ body, previous })) },
        });
      },
    ),
  ];
}
