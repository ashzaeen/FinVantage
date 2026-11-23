import type { AdvisorVisual } from "@finvantage/contracts";

/** One line of a side-by-side: a label and the figure from each scenario, in cents. Null when a scenario has none. */
export interface CompareRow {
  label: string;
  a: number | null;
  b: number | null;
}

/**
 * The headline figures to set side by side for two scenarios of the same kind of visual. Every
 * figure was worked out by the API; this only picks which ones to show. Mismatched kinds give no rows.
 */
export function compareRows(a: AdvisorVisual, b: AdvisorVisual): CompareRow[] {
  if (a.kind === "loan_explorer" && b.kind === "loan_explorer") {
    return [
      { label: "Monthly Payment", a: a.monthlyPaymentCents, b: b.monthlyPaymentCents },
      { label: "Total Interest", a: a.totalInterestCents, b: b.totalInterestCents },
      { label: "Total Cost", a: a.totalCostCents, b: b.totalCostCents },
    ];
  }
  if (a.kind === "goal_plan" && b.kind === "goal_plan") {
    return [{ label: "Needed a Month", a: a.monthlyNeededCents, b: b.monthlyNeededCents }];
  }
  if (a.kind === "growth_compare" && b.kind === "growth_compare") {
    const last = (v: typeof a) => v.series.at(-1);
    const count = Math.min(a.inputs.rates.length, b.inputs.rates.length);
    return Array.from({ length: count }, (_, i) => ({
      label: `Final Value, ${a.inputs.rates[i]!.label}`,
      a: last(a)?.valuesCents[i] ?? null,
      b: last(b)?.valuesCents[i] ?? null,
    }));
  }
  if (a.kind === "card_evaluator" && b.kind === "card_evaluator") {
    return [
      { label: "Rewards a Year", a: a.figures.annualRewardsCents, b: b.figures.annualRewardsCents },
      { label: "Fee a Year", a: a.figures.annualFeeCents, b: b.figures.annualFeeCents },
      { label: "Net a Year", a: a.figures.netCents, b: b.figures.netCents },
    ];
  }
  return [];
}

/** B minus A, or null when either is missing. Positive means B is higher. */
export function difference(row: CompareRow): number | null {
  return row.a === null || row.b === null ? null : row.b - row.a;
}
