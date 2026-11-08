import { z } from "zod";
import { Cents, Id, IsoDateTime } from "./common";
import { GoalImpact } from "./simulation";

export const PageType = z.enum(["rental", "checkout", "vehicle_financing", "debt_payment"]);
export type PageType = z.infer<typeof PageType>;

export const ItemType = z.enum([
  "rent_monthly",
  "home_listing",
  "retail_purchase",
  "vehicle",
  "credit_card_payment",
]);
export type ItemType = z.infer<typeof ItemType>;

/**
 * Everything the extension may send. Strict on purpose: an extra field is a 400, which
 * enforces the privacy rule that no page content beyond these fields leaves the browser.
 */
export const CopilotContext = z.strictObject({
  pageType: PageType,
  itemType: ItemType,
  priceCents: Cents.positive(),
  merchant: z.string().max(100),
});
export type CopilotContext = z.infer<typeof CopilotContext>;

/** Every figure the user sees comes from here. Null means not relevant to this page type. */
export const CopilotMetrics = z.object({
  fixedCostRatioBefore: z.number().nullable(),
  fixedCostRatioAfter: z.number().nullable(),
  debtToIncomeBefore: z.number().nullable(),
  debtToIncomeAfter: z.number().nullable(),
  runwayDaysBefore: z.number().nullable(),
  runwayDaysAfter: z.number().nullable(),
  liquidBufferAfterCents: Cents.nullable(),
  bufferTargetCents: Cents,
  daysUntilPayday: z.number().int().nullable(),
  safeRentThresholdCents: Cents.nullable(),
  totalCostOfOwnershipCents: Cents.nullable(),
  opportunityCostCents: Cents.nullable(),
  opportunityHorizonYears: z.number().int().nullable(),
  goalImpacts: z.array(GoalImpact),
  /** Rental: the housing payment the new rent would replace. */
  currentHousingCents: Cents.nullable(),
  /** Rental and vehicle: the change in monthly costs that the simulator applied. */
  monthlyChangeCents: Cents.nullable(),
  /** Vehicle: the assumed financing terms, so the card can explain them. */
  vehicle: z
    .object({
      termMonths: z.number().int(),
      annualRate: z.number(),
      monthlyPaymentCents: Cents,
      totalInterestCents: Cents,
    })
    .nullable(),
  /**
   * Checkout or card payment: move money from savings that no goal is using into checking first,
   * so checking stays at the safety cushion. Null when checking covers it or no such savings exist.
   */
  transfer: z
    .object({ fromAccountName: z.string(), amountCents: Cents })
    .nullable()
    .default(null),
  /**
   * Checkout: how big the purchase is next to the user's money. Shares are fractions (0.5 = half);
   * null when there is no income or no spare cash to compare with. `big` makes an affordable
   * purchase "neutral" (worth a look) instead of "good".
   */
  purchaseSize: z
    .object({
      monthlyIncomeShare: z.number().nullable(),
      spareCashShare: z.number().nullable(),
      big: z.boolean(),
      /** Debt owed outside a mortgage (cards, auto, student, personal loans). */
      nonMortgageDebtCents: Cents.default(0),
      /** Debt outside a mortgage is at least a year's income. */
      heavyDebt: z.boolean().default(false),
      /**
       * A stretch for this person: big while carrying heavy debt, or a full month's income or more,
       * or half their spare cash or more. Makes the purchase "caution" even if it is affordable.
       */
      stretch: z.boolean().default(false),
    })
    .nullable()
    .default(null),
  /** Rental: rent as a share of monthly income, and the common 30%-of-income guideline in cents. */
  rentIncomeShare: z.number().nullable().default(null),
  rentGuidelineCents: Cents.nullable().default(null),
  /** Checkout: the highest-rate card or personal loan above the assumed investing return, to pay first. */
  payFirst: z
    .object({ accountName: z.string(), balanceCents: Cents, annualRate: z.number() })
    .nullable()
    .default(null),
  /** Checkout: pay part from checking down to the buffer, the rest on a 0% promo card. */
  splitPlan: z
    .object({
      fromCheckingCents: Cents,
      onPromoCardCents: Cents,
      promoCardName: z.string(),
      monthlyPaymentCents: Cents,
      payoffMonths: z.number().int(),
      promoEndsOn: z.string(),
    })
    .nullable(),
  /**
   * The one goal hit the card leads with, chosen in code. "odds" when the purchase mostly
   * changes the chance of hitting the date, "delay" when it moves the date, "out_of_reach" when
   * the goal stops being reachable, "gain" when a goal gets more likely or sooner, "none" when no
   * goal moves enough to mention. For "gain", `delayMonths` is negative (sooner).
   */
  headline: z.object({
    kind: z.enum(["delay", "odds", "out_of_reach", "gain", "none"]),
    goalName: z.string().nullable(),
    delayMonths: z.number().nullable(),
    oddsBeforeLow: z.number().nullable(),
    oddsBeforeHigh: z.number().nullable(),
    oddsAfterLow: z.number().nullable(),
    oddsAfterHigh: z.number().nullable(),
    /** Plain-language status before and after, such as "on track" and "at risk". */
    statusBefore: z.string().nullable(),
    statusAfter: z.string().nullable(),
  }),
  /**
   * The card's stance, decided in code: "caution" when the move hurts a goal or the cash cushion,
   * "good" when it fits the plan or beats the alternatives, "neutral" otherwise.
   */
  verdict: z.enum(["caution", "good", "neutral"]),
  /** Debt payment: which debt it pays, and what that is worth. */
  debtPayment: z
    .object({
      accountName: z.string(),
      annualRate: z.number(),
      balanceCents: Cents,
      paidCents: Cents,
      paysOffInFull: z.boolean(),
      annualInterestSavedCents: Cents,
      /** The minimum payment that goes to goals once the balance is cleared, else 0. */
      freedMonthlyCents: Cents,
      remainingCents: Cents,
      checkingAfterCents: Cents,
      /** The payment is no more than the card's minimum. */
      isMinimumOnly: z.boolean(),
      /** Paying the whole balance from checking would still leave the buffer target. */
      canPayInFull: z.boolean(),
      /** Interest a year on what stays on the card, and on the whole balance. */
      remainingAnnualInterestCents: Cents,
      fullAnnualInterestCents: Cents,
    })
    .nullable(),
  /**
   * Where this money earns the most, best first: paying each debt (its rate), investing (the
   * assumed return), or savings (the account's rate). Lets cards compare the choice to others.
   */
  alternatives: z.array(
    z.object({
      kind: z.enum(["debt", "invest", "savings"]),
      label: z.string(),
      annualRate: z.number(),
    }),
  ),
});
export type CopilotMetrics = z.infer<typeof CopilotMetrics>;

export const CopilotCard = z.object({
  impact: z.string(),
  tradeOff: z.string(),
  smartMove: z.string(),
  keyFigures: z.array(z.object({ label: z.string(), value: z.string() })),
  /** The one figure the card leads with, such as a goal's odds or the interest saved. */
  lead: z.object({ label: z.string(), value: z.string() }).nullable(),
  /** "template" means the LLM failed or was rejected by the guardrail. */
  source: z.enum(["llm", "template"]),
});
export type CopilotCard = z.infer<typeof CopilotCard>;

export const CopilotEvaluateResponse = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    eventId: Id,
    metrics: CopilotMetrics,
    card: CopilotCard,
    /** Path in the web app, for the "open full simulation" link. */
    simulationPath: z.string(),
  }),
  /** No linked data: the card prompts the user to load the demo profile. */
  z.object({ status: z.literal("no_data") }),
]);
export type CopilotEvaluateResponse = z.infer<typeof CopilotEvaluateResponse>;

export const CopilotAction = z.enum(["dismissed", "opened", "snoozed"]);
export type CopilotAction = z.infer<typeof CopilotAction>;

export const CopilotEvent = z.object({
  id: Id,
  userId: Id,
  pageType: PageType,
  merchant: z.string(),
  extractedPriceCents: Cents,
  metrics: CopilotMetrics,
  card: CopilotCard,
  userAction: CopilotAction.nullable(),
  createdAt: IsoDateTime,
});
export type CopilotEvent = z.infer<typeof CopilotEvent>;
