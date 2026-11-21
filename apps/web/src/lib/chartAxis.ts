/**
 * Evenly spaced y-axis ticks that always include zero. Recharts' "auto" domain picks odd steps
 * (0.9%, 0, -0.9%, -2%, -3%); this rounds the step to 1, 2, 2.5 or 5 times a power of ten.
 * It only places gridlines. It never changes a plotted value.
 */
export function niceTicks(values: number[], target = 4): { domain: [number, number]; ticks: number[] } {
  const finite = values.filter(Number.isFinite);
  const lo0 = Math.min(0, ...finite);
  const hi0 = Math.max(0, ...finite);
  if (hi0 === lo0) return { domain: [-0.01, 0.01], ticks: [-0.01, 0, 0.01] };
  const raw = (hi0 - lo0) / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw);
  const clean = (n: number) => Math.round(n * 1e9) / 1e9;
  const lo = clean(Math.floor(lo0 / step) * step);
  const hi = clean(Math.ceil(hi0 / step) * step);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(clean(t));
  return { domain: [lo, hi], ticks };
}

/** "2%" or "2.5%": whole numbers lose the decimal. */
export function tickPercent(rate: number): string {
  const pct = Math.round(rate * 100 * 1e6) / 1e6;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}
