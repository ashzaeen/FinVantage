/**
 * The one categorical chart palette ("Indigo Core"). Six colors, in fixed order, never cycled.
 * Validated for lightness, chroma, colorblind separation and 3:1 contrast on white; see
 * docs/DECISIONS.md. A seventh or later slice folds into a neutral "Other" instead of a new hue.
 * The values live in globals.css as --series-1 to --series-6.
 */
export const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
] as const;

export const OTHER_COLOR = "var(--chart-other)";

/** Color for the nth category. Past the sixth it is the neutral "Other" gray. */
export function seriesColor(index: number): string {
  return SERIES_COLORS[index] ?? OTHER_COLOR;
}

/** Color follows the asset class, so a slice keeps its color on every page and every account view. */
export const ASSET_CLASS_COLOR = {
  us_stocks: SERIES_COLORS[0],
  international: SERIES_COLORS[1],
  bonds: SERIES_COLORS[2],
  crypto: SERIES_COLORS[3],
  cash: OTHER_COLOR,
} as const;
