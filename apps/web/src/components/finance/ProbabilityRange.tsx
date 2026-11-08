import { formatPercent } from "@finvantage/contracts";

/**
 * The only way to show a probability. It renders a range and the disclaimer together,
 * because the PRD requires the disclaimer near every probability. Pass `note={false}` only when
 * another range right beside it already shows the disclaimer.
 */
export function ProbabilityRange({
  low,
  high,
  note = true,
}: {
  low: number;
  high: number;
  note?: boolean;
}) {
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
      {note && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>
          Educational estimate, not a guarantee.
        </p>
      )}
    </div>
  );
}
