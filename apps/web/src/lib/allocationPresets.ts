import type { AssetClass, TargetAllocation } from "@finvantage/contracts";

/** Plain names for the five asset classes. */
export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  us_stocks: "US Stocks",
  international: "International",
  bonds: "Bonds",
  crypto: "Crypto",
  cash: "Cash",
};

/** Starting points a person can pick from. Each adds to 1. They are examples, not advice. */
export const ALLOCATION_PRESETS: { id: string; label: string; mix: TargetAllocation }[] = [
  { id: "growth", label: "Growth", mix: { us_stocks: 0.55, international: 0.25, bonds: 0.1, crypto: 0.05, cash: 0.05 } },
  { id: "balanced", label: "Balanced", mix: { us_stocks: 0.4, international: 0.2, bonds: 0.3, crypto: 0.02, cash: 0.08 } },
  { id: "conservative", label: "Conservative", mix: { us_stocks: 0.25, international: 0.1, bonds: 0.5, crypto: 0, cash: 0.15 } },
];
