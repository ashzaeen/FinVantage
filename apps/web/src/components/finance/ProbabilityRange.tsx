import { formatPercent } from "@finvantage/contracts";

/**
 * The only way to show a probability. It renders a range and the disclaimer together,
 * because the PRD requires the disclaimer near every probability.
 */
export function ProbabilityRange({ low, high }: { low: number; high: number }) {
  const avg = (low + high) / 2;
  const color =
    avg >= 0.75 ? "var(--good)" :
    avg >= 0.5  ? "var(--warning)" :
    "var(--critical)";

  return (
    <div>
      <p className="text-sm font-semibold" style={{ color }}>
        {formatPercent(low)} – {formatPercent(high)} likely
      </p>
      <p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>
        Educational estimate, not a guarantee.
      </p>
    </div>
  );
}
