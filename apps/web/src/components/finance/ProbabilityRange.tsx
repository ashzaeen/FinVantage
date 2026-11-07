import { formatPercent } from "@finvantage/contracts";

/**
 * The only way to show a probability. It renders a range and the disclaimer together, because
 * the PRD requires the disclaimer near every probability.
 */
export function ProbabilityRange({ low, high }: { low: number; high: number }) {
  return (
    <p className="text-sm">
      <span className="font-medium tabular-nums">
        {formatPercent(low)} to {formatPercent(high)} likely
      </span>
      <span className="block text-xs text-muted">Educational estimate, not a guarantee.</span>
    </p>
  );
}
