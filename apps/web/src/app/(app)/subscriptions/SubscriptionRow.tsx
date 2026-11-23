import type { CSSProperties } from "react";
import { formatUsd, type Subscription } from "@finvantage/contracts";
import { Sparkline } from "@/components/charts/Sparkline";
import { CategoryIcon } from "@/components/spending/CategoryIcon";
import { CADENCE_LABEL, FLAG_LABEL, FLAG_TONE, flagDetail, shortDate, type FlagTone } from "@/lib/subscriptions";
import { SubscriptionActions } from "./SubscriptionActions";

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
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: TONE_BG[tone], color: "var(--ink)" }}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_COLOR[tone] }} />
      {FLAG_LABEL[type]}
    </span>
  );
}

/** Where the user has put a charge, when it is not simply active. */
function StatusChip({ status }: { status: Subscription["status"] }) {
  if (status !== "keep" && status !== "cancelling") return null;
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
      {status === "keep" ? "Keeping" : "Cancelling"}
    </span>
  );
}

/** One subscription or bill: what it is, what it costs, when it next charges, and anything flagged. */
export function SubscriptionRow({ item, categoryLabel, index }: { item: Subscription; categoryLabel: string; index: number }) {
  const showMonthly = item.cadence !== "monthly" && item.monthlyCents !== null;
  const cancelled = item.status === "cancelled";
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
        {/* A price that never moved is a flat line and says nothing: draw it only when it changed. */}
        {item.kind === "subscription" && new Set(item.priceHistory).size > 1 && (
          <span className="ml-auto hidden sm:block">
            <Sparkline
              values={item.priceHistory}
              step
              label={`Price over the last ${item.priceHistory.length} charges: ${item.priceHistory.map((c) => formatUsd(c)).join(", ")}`}
              color="var(--flow-out)"
            />
          </span>
        )}
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>
            {formatUsd(Math.abs(item.amountCents))}
            {" "}<span className="text-xs font-medium" style={{ color: "var(--ink-muted)" }}>{CADENCE_LABEL[item.cadence]}</span>
          </span>
          <span className="block text-xs" style={{ color: "var(--ink-muted)" }}>
            {cancelled ? (
              item.cancelledOn && `Cancelled ${shortDate(item.cancelledOn)}`
            ) : (
              <>
                Next {shortDate(item.nextDate)}
                {showMonthly && ` · ${formatUsd(item.monthlyCents!)} a month`}
              </>
            )}
          </span>
          {cancelled && item.savedSoFarCents !== null && (
            <span className="block text-xs font-medium" style={{ color: "var(--gain)" }}>Saved {formatUsd(item.savedSoFarCents)} so far</span>
          )}
        </span>
      </div>
      {(item.flags.length > 0 || item.status === "keep" || item.status === "cancelling") && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-[3.25rem]">
          <StatusChip status={item.status} />
          {item.flags.map((flag) => (
            <FlagChip key={flag.type} type={flag.type} />
          ))}
        </div>
      )}
      {cancelled && item.flags.map((flag) => (
        <p key={flag.type} className="mt-1.5 pl-[3.25rem] text-xs" style={{ color: "var(--ink-secondary)" }}>{flagDetail(flag, item)}</p>
      ))}
      <SubscriptionActions item={item} />
    </li>
  );
}
