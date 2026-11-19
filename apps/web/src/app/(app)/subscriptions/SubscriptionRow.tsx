import type { CSSProperties } from "react";
import { formatUsd, type Subscription } from "@finvantage/contracts";
import { CategoryIcon } from "@/components/spending/CategoryIcon";
import { CADENCE_LABEL, FLAG_LABEL, FLAG_TONE, shortDate, type FlagTone } from "@/lib/subscriptions";

const TONE_COLOR: Record<FlagTone, string> = {
  warning: "var(--warning)",
  info: "var(--info)",
  critical: "var(--critical)",
};

const TONE_BG: Record<FlagTone, string> = {
  warning: "var(--warning-bg)",
  info: "var(--info-bg)",
  critical: "var(--critical-bg)",
};

/** A flag as a small pill. The dot carries the tone; the text stays dark so it reads on either background. */
export function FlagChip({ type }: { type: Subscription["flags"][number]["type"] }) {
  const tone = FLAG_TONE[type];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: TONE_BG[tone], color: "var(--ink)" }}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_COLOR[tone] }} />
      {FLAG_LABEL[type]}
    </span>
  );
}

/** One subscription or bill: what it is, what it costs, when it next charges, and anything flagged. */
export function SubscriptionRow({ item, categoryLabel, index }: { item: Subscription; categoryLabel: string; index: number }) {
  const showMonthly = item.cadence !== "monthly" && item.monthlyCents !== null;
  return (
    <li className="row-cascade tile-lift rounded-xl px-3 py-2.5" style={{ background: "var(--surface-inset)", "--i": index } as CSSProperties}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <CategoryIcon id={item.category} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{item.merchant}</span>
            <span className="block truncate text-xs" style={{ color: "var(--ink-muted)" }}>
              {categoryLabel} · {item.source === "bank" ? "From Your Bank" : "Estimated"}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>
            {formatUsd(Math.abs(item.amountCents))}
            <span className="ml-1 text-xs font-medium" style={{ color: "var(--ink-muted)" }}>{CADENCE_LABEL[item.cadence]}</span>
          </span>
          <span className="block text-xs" style={{ color: "var(--ink-muted)" }}>
            Next {shortDate(item.nextDate)}
            {showMonthly && ` · ${formatUsd(item.monthlyCents!)} a month`}
          </span>
        </span>
      </div>
      {item.flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-[3.25rem]">
          {item.flags.map((flag) => (
            <FlagChip key={flag.type} type={flag.type} />
          ))}
        </div>
      )}
    </li>
  );
}
