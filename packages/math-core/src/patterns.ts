import type { MerchantSpend, SpendingPatterns, TransactionSummary } from "@finvantage/contracts";

/** One purchase, already judged to be spending by the caller: money out, as a positive amount. */
export interface SpendRow {
  date: string;
  merchant: string;
  cents: number;
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

const shiftMonth = (month: string, by: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

/** Days in the average-by-weekday window. About three months smooths out one odd week. */
export const WEEKDAY_WINDOW_DAYS = 90;
/** How many merchants the leaderboard lists. */
export const TOP_MERCHANTS = 5;

/**
 * How a month's spending falls across days, weekdays and merchants. `rows` may reach back past the
 * month: the weekday averages and the streak use them. `month` must not be after `today`.
 */
export function spendingPatterns(rows: readonly SpendRow[], month: string, today: string): SpendingPatterns {
  const through = month === today.slice(0, 7) ? today : lastDayOf(month);

  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.cents);

  const monthRows = rows.filter((r) => r.date.slice(0, 7) === month && r.date <= through);
  const dailyCents: Record<string, number> = {};
  for (const r of monthRows) dailyCents[r.date] = (dailyCents[r.date] ?? 0) + r.cents;
  const spentCents = monthRows.reduce((sum, r) => sum + r.cents, 0);

  // Days with nothing spent, and the longest run of them, inside the month.
  const firstOfMonth = `${month}-01`;
  let noSpendDays = 0;
  let longest = 0;
  let run = 0;
  for (let d = firstOfMonth; d <= through; d = addDays(d, 1)) {
    if ((dailyCents[d] ?? 0) === 0) {
      noSpendDays += 1;
      run += 1;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  // The streak ending at `through` may reach back into earlier months.
  let current = 0;
  for (let d = through; (byDate.get(d) ?? 0) === 0 && current < 366; d = addDays(d, -1)) current += 1;

  // Average per kind of day over the window.
  const windowStart = addDays(through, -(WEEKDAY_WINDOW_DAYS - 1));
  const totals = Array.from({ length: 7 }, () => 0);
  const counts = Array.from({ length: 7 }, () => 0);
  for (let d = windowStart; d <= through; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    totals[dow]! += byDate.get(d) ?? 0;
    counts[dow]! += 1;
  }
  const average = (days: number[]) => {
    const n = days.reduce((sum, d) => sum + counts[d]!, 0);
    return n === 0 ? 0 : Math.round(days.reduce((sum, d) => sum + totals[d]!, 0) / n);
  };

  const merchants = new Map<string, { merchant: string; totalCents: number; visits: number }>();
  for (const r of monthRows) {
    const key = r.merchant.trim().toLowerCase();
    const entry = merchants.get(key) ?? { merchant: r.merchant.trim(), totalCents: 0, visits: 0 };
    entry.totalCents += r.cents;
    entry.visits += 1;
    merchants.set(key, entry);
  }
  const topMerchants: MerchantSpend[] = [...merchants.values()]
    .sort((a, b) => b.totalCents - a.totalCents || a.merchant.localeCompare(b.merchant))
    .slice(0, TOP_MERCHANTS)
    .map((m) => ({ ...m, share: spentCents > 0 ? m.totalCents / spentCents : 0 }));

  return {
    month,
    through,
    spentCents,
    dailyCents,
    noSpendDays,
    currentNoSpendStreak: current,
    longestNoSpendStreak: longest,
    weekday: totals.map((_, day) => ({ day, averageCents: average([day]) })),
    weekdayAverageCents: average([1, 2, 3, 4, 5]),
    weekendAverageCents: average([0, 6]),
    topMerchants,
    topMerchantsShare: spentCents > 0 ? topMerchants.reduce((sum, m) => sum + m.totalCents, 0) / spentCents : 0,
  };
}

/** Money in and out across a set of transactions, and the last six months of it. Raw ledger sums. */
export function transactionSummary(rows: readonly { date: string; amountCents: number }[], today: string): TransactionSummary {
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(today.slice(0, 7), i - 5));
  const byMonth = new Map(months.map((month) => [month, { month, inCents: 0, outCents: 0 }]));
  let inCents = 0;
  let outCents = 0;
  for (const r of rows) {
    const isIn = r.amountCents > 0;
    if (isIn) inCents += r.amountCents;
    else outCents += -r.amountCents;
    const bucket = byMonth.get(r.date.slice(0, 7));
    if (bucket) {
      if (isIn) bucket.inCents += r.amountCents;
      else bucket.outCents += -r.amountCents;
    }
  }
  return { count: rows.length, inCents, outCents, netCents: inCents - outCents, byMonth: months.map((m) => byMonth.get(m)!) };
}
