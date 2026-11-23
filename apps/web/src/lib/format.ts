/** Small display helpers shared by the dashboard's charts and cards. Pure: they format, never compute. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "2026-12-04" -> "Dec 4". Anything that is not an ISO date comes back unchanged. */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  return name && day ? `${name} ${Number(day)}` : iso;
}

/** "2026-12" -> "Dec". */
export function monthName(key: string): string {
  return MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
}

/** "2028-03-14" -> "Mar 2028". Anything that is not an ISO date comes back unchanged. */
export function monthYear(iso: string): string {
  const [year, month] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  return name && year ? `${name} ${year}` : iso;
}

/** "$1.2K","$38.5K", "$1.2M": for chart axes and tight tiles. Whole dollars below $1,000. */
export function compactUsd(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  const sign = cents < 0 ? "−" : "";
  if (dollars >= 1_000_000) return `${sign}$${(dollars / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (dollars >= 1_000) return `${sign}$${(dollars / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}$${Math.round(dollars)}`;
}

/** "1 day", "3 days". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Whole days from one ISO date to another (negative when `to` is earlier). Both are calendar days. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "in 3 days", "today", "tomorrow", "2 days ago": for countdowns. */
export function relativeDays(from: string, to: string): string {
  const days = daysBetween(from, to);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${plural(days, "day")}` : `${plural(-days, "day")} ago`;
}

/** "2028-03-14" -> "Mar 14, 2028". Anything that is not an ISO date comes back unchanged. */
export function longDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  return name && year && day ? `${name} ${Number(day)}, ${year}` : iso;
}

/** "debt_payments" -> "Debt Payments". For an id shown where no label came with it. */
export function humanize(id: string): string {
  return id.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
