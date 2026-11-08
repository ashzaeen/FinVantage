import { z } from "zod";
import { Cents, IsoDate, Probability } from "./common";
import { FanPoint, GoalImpact } from "./simulation";

/*
 * Interactive results the Advisor shows inside the chat. Every figure is computed by the API. A
 * visual sends changed inputs to `POST /v1/advisory/visuals` and gets the whole visual back, so
 * the browser never does financial math.
 */

const Source = z.object({ title: z.string(), url: z.string() });

// ---------- Loan explorer ----------

export const LoanExplorerInputs = z.object({
  label: z.string().min(1).max(60),
  priceCents: Cents.positive(),
  downPaymentCents: Cents.nonnegative(),
  aprPercent: z.number().min(0).max(60),
  termMonths: z.number().int().min(6).max(120),
});
export type LoanExplorerInputs = z.infer<typeof LoanExplorerInputs>;

export const LoanExplorer = z.object({
  kind: z.literal("loan_explorer"),
  inputs: LoanExplorerInputs,
  financedCents: Cents,
  monthlyPaymentCents: Cents,
  totalInterestCents: Cents,
  /** Down payment plus every payment. */
  totalCostCents: Cents,
  /** Share of everything paid that is interest, from 0 to 1. */
  interestShare: z.number(),
  amortization: z.array(z.object({ year: z.number().int(), principalCents: Cents, interestCents: Cents, balanceCents: Cents })),
  /** Interest paid so far at the end of each year, from year 0. */
  interestToDate: z.array(z.object({ year: z.number().int(), cents: Cents })),
  /** The same loan at each common term. */
  terms: z.array(z.object({ termMonths: z.number().int(), monthlyPaymentCents: Cents, totalInterestCents: Cents })),
  /** The same loan at a typical rate, to show what the rate costs. */
  typical: z.object({
    aprPercent: z.number(),
    monthlyPaymentCents: Cents,
    totalInterestCents: Cents,
    interestDifferenceCents: Cents,
    /** Interest paid so far at the end of each year at the typical rate, from year 0. */
    interestToDate: z.array(z.object({ year: z.number().int(), cents: Cents })),
  }),
  debtToIncome: z.object({ before: z.number(), after: z.number(), guideline: z.number() }),
  cushion: z.object({ liquidCashCents: Cents, afterDownPaymentCents: Cents, bufferTargetCents: Cents }),
  monthlySavings: z.object({ beforeCents: Cents, afterCents: Cents }),
  goalImpacts: z.array(GoalImpact),
});
export type LoanExplorer = z.infer<typeof LoanExplorer>;

// ---------- Goal planner ----------

export const GoalPlanInputs = z.object({
  name: z.string().min(1).max(60),
  targetCents: Cents.positive(),
  savedCents: Cents.nonnegative(),
  targetDate: IsoDate,
  /** Funded before the user's other goals, or after them. Defaults to first. */
  fundFirst: z.boolean().optional(),
  /** Spending categories the user chose to cut. Omitted means every suggested cut. */
  selectedCuts: z.array(z.string()).optional(),
});
export type GoalPlanInputs = z.infer<typeof GoalPlanInputs>;

export const GoalPlanVisual = z.object({
  kind: z.literal("goal_plan"),
  inputs: GoalPlanInputs,
  today: IsoDate,
  monthsLeft: z.number().int(),
  /** Null once the date has passed. */
  monthlyNeededCents: Cents.nullable(),
  path: z.array(z.object({ date: IsoDate, savedCents: Cents })),
  /** The new goal's simulated balance range over time, from a run that was not stored. */
  fan: z.array(FanPoint),
  probabilityLow: Probability.nullable(),
  probabilityHigh: Probability.nullable(),
  otherGoals: z.array(GoalImpact),
  currentMonthlySavingsCents: Cents,
  cuts: z.array(z.object({
    categoryId: z.string(),
    label: z.string(),
    averageMonthlyCents: Cents,
    cutCents: Cents,
    selected: z.boolean(),
  })),
  coverage: z.object({ coveredCents: Cents, share: z.number().nullable() }),
  /** What the cuts are sized from: the last three full months, or this month when there is no earlier spending. */
  cutsBasis: z.enum(["full_months", "this_month"]),
});
export type GoalPlanVisual = z.infer<typeof GoalPlanVisual>;

// ---------- Growth comparison ----------

/** One growth rate to project, and where it came from. */
export const GrowthRate = z.object({
  label: z.string().min(1).max(60),
  /** A yearly return as a percent, such as 10.5. Can be negative. */
  annualReturnPercent: z.number().min(-50).max(50),
  /** The user's own rate, a published figure from a web search, or a labeled fallback. */
  source: z.enum(["user", "web", "assumed"]),
});
export type GrowthRate = z.infer<typeof GrowthRate>;

export const GrowthCompareInputs = z.object({
  initialCents: Cents.nonnegative(),
  monthlyCents: Cents.nonnegative(),
  years: z.number().int().min(1).max(50),
  rates: z.array(GrowthRate).min(1).max(4),
  /** Where web rates came from. */
  sources: z.array(Source).default([]),
});
export type GrowthCompareInputs = z.input<typeof GrowthCompareInputs>;

export const GrowthCompare = z.object({
  kind: z.literal("growth_compare"),
  inputs: GrowthCompareInputs,
  /** Per year: what was put in, and one value per rate in `inputs.rates` order. Assumptions, not forecasts. */
  series: z.array(z.object({ year: z.number().int(), contributedCents: Cents, valuesCents: z.array(Cents) })),
});
export type GrowthCompare = z.infer<typeof GrowthCompare>;

// ---------- Card evaluator ----------

export const CardEvaluatorInputs = z.object({
  cardName: z.string().min(1).max(80),
  rewardsPercent: z.number().min(0).max(10),
  annualFeeCents: Cents.nonnegative(),
  aprPercent: z.number().min(0).max(60),
  /** Null uses the user's average monthly card spending. */
  monthlySpendCents: Cents.nonnegative().nullable(),
  paysInFull: z.boolean(),
  /** Where the card's terms came from. */
  sources: z.array(Source).default([]),
});
export type CardEvaluatorInputs = z.input<typeof CardEvaluatorInputs>;

export const CardEvaluator = z.object({
  kind: z.literal("card_evaluator"),
  inputs: CardEvaluatorInputs,
  averageMonthlyCardSpendCents: Cents,
  /** Where the default spending came from: the user's cards, or their everyday spending when the cards show none. */
  spendBasis: z.enum(["cards", "everyday"]),
  /** The default monthly spending, from `spendBasis`. */
  defaultMonthlySpendCents: Cents,
  monthlySpendCents: Cents,
  figures: z.object({
    annualSpendCents: Cents,
    annualRewardsCents: Cents,
    annualFeeCents: Cents,
    annualInterestCents: Cents,
    netCents: Cents,
    rewardsBeatFee: z.boolean(),
  }),
  carriedBalanceCents: Cents,
  cards: z.array(z.object({ name: z.string(), aprPercent: z.number().nullable(), balanceCents: Cents })),
  /** Plain checks written in code, each with a status the UI shows with an icon. */
  checks: z.array(z.object({ label: z.string(), status: z.enum(["good", "warning", "critical", "info"]), detail: z.string() })),
  creditScore: z.object({ score: z.number().int(), mocked: z.literal(true) }).nullable(),
});
export type CardEvaluator = z.infer<typeof CardEvaluator>;

// ---------- Union ----------

export const AdvisorVisual = z.discriminatedUnion("kind", [LoanExplorer, GoalPlanVisual, GrowthCompare, CardEvaluator]);
export type AdvisorVisual = z.infer<typeof AdvisorVisual>;

/** What a visual sends when the user changes something. */
export const AdvisorVisualRequest = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("loan_explorer"), inputs: LoanExplorerInputs }),
  z.object({ kind: z.literal("goal_plan"), inputs: GoalPlanInputs }),
  z.object({ kind: z.literal("growth_compare"), inputs: GrowthCompareInputs }),
  z.object({ kind: z.literal("card_evaluator"), inputs: CardEvaluatorInputs }),
]);
export type AdvisorVisualRequest = z.input<typeof AdvisorVisualRequest>;
