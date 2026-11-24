import type { AdvisorAttachment, PeriodSummary } from "@finvantage/contracts";

export type DataCard = Extract<AdvisorAttachment, { kind: "data_card" }>;

/** Rows a card lists. The Advisor says the top three aloud; the rest are here to read. */
export const CARD_ROWS = 10;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 1" from 2026-10-01. */
export function shortDay(iso: string): string {
  const [, month, day] = iso.split("-").map(Number) as [number, number, number];
  return `${MONTHS[month - 1]} ${day}`;
}

/** "Oct 1 to Oct 31, 2026", or with both years when the range crosses one. */
export function rangeLabel(from: string, to: string): string {
  const fromYear = from.slice(0, 4);
  const toYear = to.slice(0, 4);
  return fromYear === toYear ? `${shortDay(from)} to ${shortDay(to)}, ${toYear}` : `${shortDay(from)}, ${fromYear} to ${shortDay(to)}, ${toYear}`;
}

/** A list of figures written in code from a tool result. Rows beyond `CARD_ROWS` are counted, not listed. */
export function listCard(input: {
  title: string;
  source: string;
  total: { label: string; valueCents: number; valueText?: string } | null;
  rows: Array<{ label: string; detail?: string | null; valueCents: number; valueText?: string }>;
  /** Rows that exist beyond `rows`, when the caller cut the list itself. */
  extra?: number;
}): DataCard {
  const shown = input.rows.slice(0, CARD_ROWS);
  return {
    kind: "data_card",
    title: input.title,
    source: input.source,
    total: input.total,
    rows: shown.map((r) => ({ label: r.label, detail: r.detail ?? null, valueCents: r.valueCents, ...(r.valueText !== undefined ? { valueText: r.valueText } : {}) })),
    moreCount: input.rows.length - shown.length + (input.extra ?? 0),
  };
}

const KIND: Record<PeriodSummary["kind"], { noun: string; total: string }> = {
  spent: { noun: "Spending", total: "Total Spent" },
  income: { noun: "Income", total: "Total Income" },
  saved: { noun: "Saved", total: "Total Saved" },
};

/**
 * The card for a period total. With no category or merchant asked for it lists the biggest
 * categories; with one it lists the biggest transactions behind the total.
 */
export function periodCard(summary: PeriodSummary, merchant?: string): DataCard {
  const kind = KIND[summary.kind];
  const filtered = summary.matchedCategories.length > 0 || !!merchant;
  const subject = merchant ? merchant : summary.matchedCategories.slice(0, 2).join(", ");
  return listCard({
    title: filtered ? `${kind.noun}: ${subject}` : kind.noun,
    source: rangeLabel(summary.from, summary.to),
    total: { label: kind.total, valueCents: summary.totalCents },
    rows: filtered
      ? summary.transactions.map((t) => ({ label: t.merchant, detail: `${shortDay(t.date)} · ${t.label}`, valueCents: t.amountCents }))
      : summary.byCategory.map((c) => ({ label: c.label, detail: `${c.count} ${c.count === 1 ? "transaction" : "transactions"}`, valueCents: c.totalCents })),
    extra: filtered ? Math.max(0, summary.count - summary.transactions.length) : 0,
  });
}
