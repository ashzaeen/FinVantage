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
    avg >= 0.75 ? "var(--gain)" :
    avg >= 0.5  ? "var(--warning-text)" :
    "var(--loss)";

  // Lead with a word when the whole range is high, so a row of 98% badges still tells goals apart
  // from the ones that are not. The range and the disclaimer stay beside it (rule 7).
  const onTrack = low >= 0.9;

  return (
    <div>
      <p className="text-sm font-semibold" style={{ color }}>
        {onTrack && <span>On track · </span>}
        {formatPercent(low) === formatPercent(high) ? `About ${formatPercent(low)}` : `${formatPercent(low)} – ${formatPercent(high)}`} likely
      </p>
      {note && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>
          Educational estimate, not a guarantee.
        </p>
      )}
    </div>
  );
}
