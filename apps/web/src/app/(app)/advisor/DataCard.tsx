import { formatUsd, type AdvisorAttachment } from "@finvantage/contracts";

type Card = Extract<AdvisorAttachment, { kind: "data_card" }>;

/**
 * The figures behind something the Advisor said: a total and a short list, written in code from
 * what its tools read. It sits beside the answer so a number heard or read can be checked.
 */
export function DataCard({ card }: { card: Card }) {
  return (
    <section aria-label={card.title} className="w-full rounded-2xl border border-line bg-card p-4 text-left">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="text-sm font-semibold text-ink">{card.title}</h3>
        <p className="text-xs text-muted">{card.source}</p>
      </div>
      {card.total && (
        <p className="mt-2 flex items-baseline justify-between gap-3 border-b border-line pb-2">
          <span className="text-xs font-medium text-muted">{card.total.label}</span>
          <span className="font-poppins text-lg font-bold tabular-nums text-ink">{card.total.valueText ?? formatUsd(card.total.valueCents)}</span>
        </p>
      )}
      {card.rows.length > 0 && (
        <ul className="mt-1 divide-y divide-line">
          {card.rows.map((row, i) => (
            <li key={`${row.label}-${i}`} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-ink">{row.label}</span>
                {row.detail && <span className="block truncate text-xs text-muted">{row.detail}</span>}
              </span>
              <span className="shrink-0 text-right tabular-nums text-ink">{row.valueText ?? formatUsd(row.valueCents)}</span>
            </li>
          ))}
        </ul>
      )}
      {card.moreCount > 0 && <p className="mt-1 text-xs text-muted">And {card.moreCount} more not shown. Ask the Advisor to read them.</p>}
    </section>
  );
}
