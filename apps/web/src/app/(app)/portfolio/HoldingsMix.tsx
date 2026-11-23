import { formatUsd, type InvestmentView, type InvestmentsOverview } from "@finvantage/contracts";
import { BulletBar } from "@/components/charts/BulletBar";
import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { percent } from "./parts";

/**
 * Two questions allocation does not answer: how much rides on a few holdings, and how much of the
 * money sits in accounts that shelter its growth from tax. Both come from the API.
 */
export function HoldingsMix({ view, mix }: { view: InvestmentView; mix: InvestmentsOverview["accountMix"] }) {
  const { top, topShare } = view.concentration;
  const total = mix.taxAdvantagedCents + mix.taxableCents;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card title="Biggest Holdings" subtitle={`The top ${top.length || "few"} make up ${percent(topShare)} of ${view.id === "all" ? "everything you hold" : "this account"}`} className="invest-rise invest-rise-4">
        {top.length === 0 ? (
          <p className="text-sm text-muted">No holdings in this view.</p>
        ) : (
          <ul className="space-y-3">
            {top.map((h, i) => (
              <li key={h.symbol}>
                <BulletBar label={`${h.symbol} · ${h.name}`} valueText={percent(h.share)} fill={h.share} index={i} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">A fund can hold hundreds of companies, so a big share in one index fund is not the same risk as a big share in one stock. Two funds that track similar indexes overlap.</p>
      </Card>

      <Card title="Where the Money Sits" subtitle="Retirement accounts shelter growth from tax; taxable accounts do not" action={<MockedBadge />} className="invest-rise invest-rise-4">
        {total === 0 ? (
          <p className="text-sm text-muted">Nothing invested yet.</p>
        ) : (
          <>
            <ul className="space-y-3">
              <li><BulletBar label="Tax-Advantaged" valueText={formatUsd(mix.taxAdvantagedCents)} fill={mix.taxAdvantagedCents / total} tone="in" index={0} note="Roth IRA, 401(k) and similar" /></li>
              <li><BulletBar label="Taxable" valueText={formatUsd(mix.taxableCents)} fill={mix.taxableCents / total} index={1} note="Brokerage: you may owe tax on gains and dividends" /></li>
            </ul>
            <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs text-ink-secondary">
              {mix.accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{a.label}</span>
                  <span className="shrink-0 tabular-nums">{formatUsd(a.valueCents)} · {a.taxTreatment === "tax_advantaged" ? "Tax-advantaged" : "Taxable"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
