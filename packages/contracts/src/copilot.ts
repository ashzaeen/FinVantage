import { z } from "zod";
import { Cents, Id, IsoDateTime } from "./common";
import { GoalImpact } from "./simulation";

export const PageType = z.enum(["rental", "checkout", "vehicle_financing"]);
export type PageType = z.infer<typeof PageType>;

export const ItemType = z.enum(["rent_monthly", "home_listing", "retail_purchase", "vehicle"]);
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
});
export type CopilotMetrics = z.infer<typeof CopilotMetrics>;

export const CopilotCard = z.object({
  impact: z.string(),
  tradeOff: z.string(),
  smartMove: z.string(),
  keyFigures: z.array(z.object({ label: z.string(), value: z.string() })),
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
