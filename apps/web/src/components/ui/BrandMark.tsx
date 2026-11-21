/**
 * The FinVantage mark: a white drop on an indigo tile. One component for the landing page, the
 * dashboard sidebar, the phone top bar and (as `app/icon.svg`) the browser tab, so they never drift.
 * `tone="brand"` is for light backgrounds. `tone="onBrand"` flips it (white tile, indigo drop) for
 * the indigo sidebar and top bar, where an indigo tile would disappear.
 */
export function BrandMark({ size = 36, tone = "brand" }: { size?: number; tone?: "brand" | "onBrand" }) {
  const onBrand = tone === "onBrand";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl ${onBrand ? "bg-white" : "bg-accent"}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <path d="M12 2C8.5 6 6 9.5 6 13.5a6 6 0 0 0 12 0c0-4-2.5-7.5-6-11.5z" fill={onBrand ? "var(--accent)" : "white"} />
        <circle cx="12" cy="14" r="2.5" fill={onBrand ? "white" : "var(--accent)"} />
      </svg>
    </span>
  );
}
