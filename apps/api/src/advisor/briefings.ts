import { z } from "zod";
import { formatUsd } from "@finvantage/contracts";
import type { AdvisorTool } from "@finvantage/llm";
import { listCard, rangeLabel, shortDay } from "./cards";
import type { ChangeToolContext } from "./changes";
import { forModel } from "./read-api";
import { none, tool } from "./tool-kit";

/**
 * Read-only briefings: the figures the app already works out for its own pages (safe to spend,
 * what is due, the health score, what needs attention, debt payoff, a credit what-if, unusual
 * charges, spending pace). Each hands the model dollar strings to quote and shows a card. Nothing
 * here saves anything, and nothing is worked out by the model.
 */

const toCents = (dollars: number) => Math.round(dollars * 100);
const percent = (rate: number | null) => (rate === null ? "no limit" : `${Math.round(rate * 100)}%`);
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function briefingTools({ api }: ChangeToolContext): AdvisorTool[] {
  return [
    tool(
      "get_safe_to_spend",
      "What the user can spend for the rest of this month without missing a bill or a savings target, and how that is worked out: checking today, income still due, bills still due, and savings still needed. Use it for 'how much can I spend', 'can I afford something small this week'.",
      none,
      async () => {
        const s = await api.getSafeToSpend();
        return {
          data: forModel({ asOf: s.asOf, throughDate: s.periodEnd, safeCents: s.safeCents, ...s.parts }),
          citation: "Safe to spend",
          summary: [`Safe to spend through ${shortDay(s.periodEnd)}: ${formatUsd(s.safeCents)}.`],
          attachment: listCard({
            title: "Safe to Spend",
            source: `Through ${shortDay(s.periodEnd)}`,
            total: { label: "Safe to Spend", valueCents: s.safeCents },
            rows: [
              { label: "In Checking Today", detail: null, valueCents: s.parts.checkingCents },
              { label: "Income Still Due", detail: "Added", valueCents: s.parts.incomeStillDueCents },
              { label: "Bills Still Due", detail: "Taken off", valueCents: s.parts.billsStillDueCents },
              { label: "Savings Still Needed", detail: "Taken off", valueCents: s.parts.savingsStillNeededCents },
            ],
          }),
        };
      },
    ),

    tool(
      "get_upcoming_bills",
      "Bills and card payments due in the next few days, what they add up to, the next paydays, and the lowest checking balance expected over the next 30 days. Use it for 'what's due in the next two weeks', 'will I run low'.",
      z.object({ days: z.number().int().min(1).max(30).optional().describe("How many days ahead. 14 if the user did not say.") }),
      async (a) => {
        const calendar = await api.getMoneyCalendar();
        const days = a.days ?? 14;
        const end = addDays(calendar.asOf, days);
        const inWindow = calendar.events.filter((e) => e.date >= calendar.asOf && e.date <= end);
        const due = inWindow.filter((e) => e.kind !== "payday");
        const dueCents = due.reduce((sum, e) => sum + (e.amountCents ?? 0), 0);
        return {
          data: forModel({
            window: rangeLabel(calendar.asOf, end),
            dueCents,
            dueCount: due.length,
            due: due.slice(0, 12).map((e) => ({ date: e.date, what: e.label, kind: e.kind === "card_due" ? "card payment" : "bill", amountCents: e.amountCents })),
            paydays: inWindow.filter((e) => e.kind === "payday").map((e) => ({ date: e.date, amountCents: e.amountCents })),
            checkingTodayCents: calendar.startingCents,
            lowestCheckingCents: calendar.lowestCents,
            lowestCheckingDate: calendar.lowestDate,
            lowestCheckingWindow: "the next 30 days",
          }),
          citation: "Money calendar",
          summary: [`${due.length} bills and card payments in the next ${days} days, ${formatUsd(dueCents)} in all.`],
          attachment: due.length === 0 ? undefined : listCard({
            title: "Due Soon",
            source: rangeLabel(calendar.asOf, end),
            total: { label: "Bills and Card Payments", valueCents: dueCents },
            rows: due.map((e) => ({
              label: e.label,
              detail: `${shortDay(e.date)} · ${e.kind === "card_due" ? "Card payment" : "Bill"}`,
              valueCents: e.amountCents ?? 0,
              ...(e.amountCents === null ? { valueText: "No minimum set" } : {}),
            })),
          }),
        };
      },
    ),

    tool(
      "get_health_score",
      "The user's financial health score out of 100 with its label and the four parts behind it (savings rate, debt-to-income, credit utilization, cash runway), each with its own figure and score.",
      none,
      async () => {
        const h = await api.getHealthScore();
        return {
          data: {
            asOf: h.asOf,
            score: h.score,
            label: h.label,
            parts: h.parts.map((p) => ({ name: p.label, figure: p.valueText, score: p.score, weightPercent: Math.round(p.weight * 100) })),
          },
          citation: "Health score",
          summary: [`Financial health: ${h.score} out of 100, ${h.label}.`],
          attachment: listCard({
            title: "Financial Health",
            source: `As of ${shortDay(h.asOf)}`,
            total: { label: h.label, valueCents: 0, valueText: `${h.score} of 100` },
            rows: h.parts.map((p) => ({ label: p.label, detail: `Score ${p.score} · ${Math.round(p.weight * 100)}% of the total`, valueCents: 0, valueText: p.valueText })),
          }),
        };
      },
    ),

    tool(
      "get_attention",
      "The few things worth the user's attention today, most urgent first: a card past due, a cancelled subscription still charging, a bill coming, a budget about to be passed. Use it for 'what needs my attention', 'anything I should know'.",
      none,
      async () => {
        const feed = await api.getAttention();
        return {
          data: { asOf: feed.asOf, count: feed.items.length, items: feed.items.map((i) => ({ what: i.message, urgency: i.severity === "action" ? "needs action" : "heads up" })) },
          citation: "Attention",
          summary: feed.items.length === 0 ? ["Nothing needs attention right now."] : feed.items.slice(0, 4).map((i) => i.message),
          attachment: feed.items.length === 0 ? undefined : listCard({
            title: "Needs Attention",
            source: `As of ${shortDay(feed.asOf)}`,
            total: null,
            rows: feed.items.map((i) => ({ label: i.message, detail: i.severity === "action" ? "Needs action" : "Heads up", valueCents: 0, valueText: "" })),
          }),
        };
      },
    ),

    tool(
      "get_debt_payoff",
      "How long it takes to pay off the user's cards and loans with the avalanche (highest rate first) and snowball (smallest balance first) plans: months, debt-free date and total interest for each, and what the avalanche saves. Optionally with extra money each month, which must be an amount the user said.",
      z.object({ extraPerMonth: z.number().nonnegative().optional().describe("Extra dollars a month on top of the minimums.") }),
      async (a, turn) => {
        if (a.extraPerMonth !== undefined && a.extraPerMonth > 0 && !turn.isGrounded(a.extraPerMonth)) {
          throw new Error(`${formatUsd(toCents(a.extraPerMonth))} is not an amount the user said. Ask how much extra they could pay.`);
        }
        const extraCents = toCents(a.extraPerMonth ?? 0);
        const payoff = await api.getDebtPayoff({ query: extraCents > 0 ? { extraCents } : {} });
        if (payoff.plans.length === 0) {
          return { data: { debts: [], note: "The user has no cards or loans to pay off." }, citation: "Debt payoff", summary: ["No debts to pay off."] };
        }
        const apr = (rate: number) => `${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
        const name = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`;
        const owed = payoff.debts.reduce((sum, d) => sum + d.balanceCents, 0);
        return {
          data: forModel({
            asOf: payoff.asOf,
            extraPerMonthCents: payoff.extraPerMonthCents,
            totalOwedCents: owed,
            debts: payoff.debts.map((d) => ({ name: d.name, balanceCents: d.balanceCents, apr: apr(d.annualRate), minimumPaymentCents: d.minimumPaymentCents })),
            plans: payoff.plans.map((p) => ({ plan: p.strategy, months: p.months, debtFreeDate: p.payoffDate, totalInterestCents: p.totalInterestCents })),
            avalancheSavesCents: payoff.avalancheSavesCents,
          }),
          citation: "Debt payoff",
          summary: payoff.plans.map((p) => `${name(p.strategy)}: ${p.months === null ? "over 30 years" : `${p.months} months`}, ${formatUsd(p.totalInterestCents)} interest.`),
          attachment: listCard({
            title: "Debt Payoff",
            source: payoff.extraPerMonthCents > 0 ? `${formatUsd(payoff.extraPerMonthCents)} extra a month` : "Minimum payments",
            total: { label: "Total Owed", valueCents: owed },
            rows: [
              ...payoff.plans.map((p) => ({
                label: `${name(p.strategy)} Plan`,
                detail: `Interest · ${p.months === null ? "over 30 years" : `${p.months} months`}${p.payoffDate ? `, debt-free ${shortDay(p.payoffDate)}` : ""}`,
                valueCents: p.totalInterestCents,
              })),
              ...payoff.debts.map((d) => ({ label: d.name, detail: `${apr(d.annualRate)} APR · minimum ${formatUsd(d.minimumPaymentCents)}`, valueCents: d.balanceCents })),
            ],
          }),
        };
      },
    ),

    tool(
      "check_credit_whatif",
      "What paying a given amount toward one credit card would do to its utilization and to an estimated credit score range. The score is a MOCKED estimate from a stated rule, never a real score: say so. Changes nothing. The payment must be an amount the user said.",
      z.object({
        card: z.string().min(1).describe("Part of the card's name."),
        payment: z.number().positive().describe("Dollars to pay toward it."),
      }),
      async (a, turn) => {
        if (!turn.isGrounded(a.payment)) throw new Error(`${formatUsd(toCents(a.payment))} is not an amount the user said. Ask how much they would pay.`);
        const { cards } = await api.getCreditCards();
        const wanted = a.card.trim().toLowerCase();
        const found = cards.filter((c) => c.name.toLowerCase().includes(wanted));
        if (found.length !== 1) {
          throw new Error(found.length === 0 ? `No card matches "${a.card}". The cards are ${cards.map((c) => c.name).join(", ")}. Ask which.` : `Several cards match: ${found.map((c) => c.name).join(", ")}. Ask which.`);
        }
        const card = found[0]!;
        const w = await api.creditWhatIf({ body: { cardId: card.id, paymentCents: toCents(a.payment) } });
        const range = (s: { scoreLow: number; scoreHigh: number }) => `${s.scoreLow} to ${s.scoreHigh}`;
        return {
          data: forModel({
            mocked: true,
            card: w.cardName,
            paymentCents: w.paymentCents,
            cardUtilizationBefore: percent(w.before.cardUtilization),
            cardUtilizationAfter: percent(w.after.cardUtilization),
            totalUtilizationBefore: percent(w.before.totalUtilization),
            totalUtilizationAfter: percent(w.after.totalUtilization),
            estimatedScoreBefore: range(w.before),
            estimatedScoreAfter: range(w.after),
          }),
          citation: "Credit what-if (mocked)",
          summary: [`Paying ${formatUsd(w.paymentCents)} on ${w.cardName}: utilization ${percent(w.before.cardUtilization)} to ${percent(w.after.cardUtilization)}. The score is a mocked estimate.`],
          attachment: listCard({
            title: "Credit What-If",
            source: `${w.cardName} · mocked estimate`,
            total: { label: "Payment", valueCents: w.paymentCents },
            rows: [
              { label: "This Card's Utilization", detail: null, valueCents: 0, valueText: `${percent(w.before.cardUtilization)} to ${percent(w.after.cardUtilization)}` },
              { label: "All Cards' Utilization", detail: null, valueCents: 0, valueText: `${percent(w.before.totalUtilization)} to ${percent(w.after.totalUtilization)}` },
              { label: "Estimated Score Range", detail: "Mocked, not a real score", valueCents: 0, valueText: `${range(w.before)} to ${range(w.after)}` },
            ],
          }),
        };
      },
    ),

    tool(
      "get_unusual_charges",
      "Charges far above what the same merchant usually charges, with the usual amount and how many times bigger it was. Use it for 'anything weird this month', 'any charges I should check'.",
      none,
      async () => {
        const unusual = await api.listUnusualCharges();
        return {
          data: forModel({ count: unusual.length, charges: unusual.slice(0, 8).map((u) => ({ merchant: u.merchant, amountCents: u.amountCents, usualCents: u.usualCents, timesTheUsual: u.ratio.toFixed(1) })) }),
          citation: "Unusual charges",
          summary: unusual.length === 0 ? ["No unusual charges."] : unusual.slice(0, 3).map((u) => `${u.merchant}: ${formatUsd(u.amountCents)}, ${u.ratio.toFixed(1)} times the usual ${formatUsd(u.usualCents)}.`),
          attachment: unusual.length === 0 ? undefined : listCard({
            title: "Unusual Charges",
            source: "Against each merchant's usual",
            total: null,
            rows: unusual.map((u) => ({ label: u.merchant, detail: `${u.ratio.toFixed(1)} times the usual ${formatUsd(u.usualCents)}`, valueCents: u.amountCents })),
          }),
        };
      },
    ),

    tool(
      "get_spending_pace",
      "How this month's spending compares with last month on the same day, what the month is on course to total, and the budgets added up. Use it for 'am I on pace', 'am I spending more than last month'.",
      none,
      async () => {
        const p = await api.getSpendingPace();
        const soFar = p.thisMonthCents.at(-1) ?? 0;
        const versus = `${formatUsd(Math.abs(p.aheadByCents))} ${p.aheadByCents >= 0 ? "more" : "less"} than`;
        return {
          data: forModel({
            month: p.month,
            throughDate: p.through,
            soFarCents: soFar,
            lastMonthSameDayCents: p.lastMonthSameDayCents,
            // Worked out here so the model never subtracts or picks a direction.
            thisMonthVersusLastMonth: `${versus} last month at this point`,
            onCourseForCents: p.projectedCents,
            budgetsAddedUpCents: p.budgetCents,
          }),
          citation: "Spending pace",
          summary: [`${formatUsd(soFar)} so far, ${versus} last month at this point. On course for ${formatUsd(p.projectedCents)}.`],
          attachment: listCard({
            title: "Spending Pace",
            source: `Through ${shortDay(p.through)}`,
            total: { label: "On Course For", valueCents: p.projectedCents },
            rows: [
              { label: "So Far This Month", detail: null, valueCents: soFar },
              { label: "Last Month, Same Day", detail: null, valueCents: p.lastMonthSameDayCents },
              { label: "Versus Last Month", detail: null, valueCents: 0, valueText: `${versus.replace(" than", "")}` },
              ...(p.budgetCents === null ? [] : [{ label: "Budgets Added Up", detail: null, valueCents: p.budgetCents }]),
            ],
          }),
        };
      },
    ),
  ];
}
