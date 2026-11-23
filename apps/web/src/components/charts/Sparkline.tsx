/**
 * A tiny line with no axes, for rows and tiles. `values` run oldest to newest. With `step` the line
 * holds each value until the next, which is how a price behaves. It draws what it is given; the
 * words for screen readers come from `label`.
 */
export function Sparkline({
  values,
  label,
  step = false,
  width = 72,
  height = 24,
  color = "var(--series-1)",
}: {
  values: readonly number[];
  label: string;
  step?: boolean;
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => (max === min ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2));
  const points = values.flatMap((v, i) => (step && i > 0 ? [`${x(i)},${y(values[i - 1]!)}`, `${x(i)},${y(v)}`] : [`${x(i)},${y(v)}`]));
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label} className="shrink-0 overflow-visible">
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(values[last]!)} r={2.5} fill={color} />
    </svg>
  );
}
