"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ASSET_CLASS_LABEL, formatUsd, type AllocationSlice, type AssetClass, type InvestmentView } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { percent } from "./parts";

/** Color follows the asset class, so switching accounts never repaints a slice. Cash is neutral. */
const SLICE_COLOR: Record<AssetClass, string> = {
  us_stocks: "var(--series-1)",
  international: "var(--series-2)",
  bonds: "var(--series-3)",
  crypto: "var(--series-4)",
  cash: "var(--ink-light)",
};

function SliceTooltip({ slice }: { slice: AllocationSlice | undefined }) {
  if (!slice) return null;
  return (
    <div className="rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg">
      <p className="text-subtle">{ASSET_CLASS_LABEL[slice.assetClass]}</p>
      <p className="font-poppins text-sm font-bold tabular-nums">{formatUsd(slice.valueCents)}</p>
    </div>
  );
}

export function AllocationCard({ view }: { view: InvestmentView }) {
  return (
    <Card noPad className="invest-rise invest-rise-4">
      <div className="flex h-full flex-col px-5 py-4">
        <h2 className="font-poppins text-base font-bold text-ink">Allocation</h2>
        <p className="text-xs text-muted">Share of this view&apos;s value</p>
        <div className="flex flex-1 items-center gap-5 pt-3">
          <div className="relative h-32 w-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart key={view.id}>
                <Pie data={view.allocation} dataKey="valueCents" nameKey="assetClass" innerRadius="68%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="var(--surface-card)" strokeWidth={2} cornerRadius={4} animationDuration={700} animationEasing="ease-out">
                  {view.allocation.map((slice) => <Cell key={slice.assetClass} fill={SLICE_COLOR[slice.assetClass]} />)}
                </Pie>
                <Tooltip content={(props) => <SliceTooltip slice={props.payload?.[0]?.payload as AllocationSlice | undefined} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <strong className="font-poppins text-sm text-ink tabular-nums">{formatUsd(view.totalValueCents)}</strong>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {view.allocation.map((slice) => (
              <li key={slice.assetClass} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="flex min-w-0 items-center gap-2 text-ink-secondary">
                  <i aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SLICE_COLOR[slice.assetClass] }} />
                  <span className="truncate">{ASSET_CLASS_LABEL[slice.assetClass]}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-ink">{percent(slice.weight)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
