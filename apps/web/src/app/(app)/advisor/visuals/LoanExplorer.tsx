"use client";

import { CheckCircle2, Car, AlertTriangle } from "lucide-react";
import { formatPercent, formatUsd, type LoanExplorer as LoanExplorerVisual } from "@finvantage/contracts";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { Chips, Eyebrow, FanArea, Slider, Strip, TableToggle, Ticker, useTween, useVisual, VisualCard } from "./shared";

const TERMS = [36, 48, 60, 72] as const;

/** Debt-to-income on a track, with the lender guideline marked. */
function DtiMeter({ before, after, guideline }: { before: number; after: number; guideline: number }) {
  const scale = Math.max(guideline * 1.6, after * 1.1, 0.01);
  const [b, a] = useTween([before, after]);
  const over = after > guideline;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted">Debt-to-income</span>
        <span className="tabular-nums text-ink">
          {formatPercent(before)} <span className="text-subtle">→</span>{" "}
          <span className={`font-semibold ${over ? "text-critical" : "text-ink"}`}>{formatPercent(after)}</span>
        </span>
      </div>
      <div className="relative mt-2 h-2.5 rounded-full bg-accent-soft">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, ((a ?? after) / scale) * 100)}%`, background: over ? "var(--critical)" : "var(--fan-inner)" }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.min(100, ((b ?? before) / scale) * 100)}%` }} />
        <div className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ left: `${(guideline / scale) * 100}%` }} aria-hidden />
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
        {over ? <AlertTriangle size={12} className="text-critical" aria-hidden /> : <CheckCircle2 size={12} className="text-good" aria-hidden />}
        {over ? `Above the ${formatPercent(guideline)} many lenders use` : `Under the ${formatPercent(guideline)} many lenders use`}
      </p>
    </div>
  );
}

export function LoanExplorer({ initial }: { initial: LoanExplorerVisual }) {
  const { visual: v, update, pending, failed } = useVisual(initial);
  const { inputs } = v;
  const cushionOk = v.cushion.afterDownPaymentCents >= v.cushion.bufferTargetCents;
  const years = v.amortization.length;
  const yours = v.interestToDate.map((p) => p.cents);
  const typical = v.typical.interestToDate.map((p) => p.cents);
  const [share] = useTween([v.interestShare]);
  const maxTermInterest = Math.max(1, ...v.terms.map((t) => t.totalInterestCents));

  return (
    <VisualCard pending={pending} failed={failed} label={`${inputs.label} explorer`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>
            <span className="inline-flex items-center gap-1.5"><Car size={13} aria-hidden /> {inputs.label} · {inputs.aprPercent}% APR</span>
          </Eyebrow>
          <p className="mt-1 font-poppins text-4xl font-semibold tracking-tight text-ink">
            <Ticker value={v.monthlyPaymentCents} format={formatUsd} />
            <span className="ml-1 text-base font-normal text-muted">/month</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatUsd(v.financedCents)} borrowed · {formatUsd(v.totalInterestCents)} interest · {formatUsd(v.totalCostCents)} all in
          </p>
        </div>
        {/* Price versus interest, as one ring. */}
        <div className="relative shrink-0" aria-label={`${formatPercent(v.interestShare)} of the total cost is interest`}>
          <svg width={64} height={64} viewBox="0 0 64 64" className="-rotate-90" aria-hidden>
            <circle cx={32} cy={32} r={26} fill="none" stroke="var(--fan-outer)" strokeWidth={8} />
            <circle cx={32} cy={32} r={26} fill="none" stroke="var(--accent)" strokeWidth={8} strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 26 * (share ?? v.interestShare)} ${2 * Math.PI * 26}`} />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center text-[10px] leading-tight text-muted">
            <span className="font-semibold tabular-nums text-ink">{formatPercent(v.interestShare)}</span>interest
          </span>
        </div>
      </div>

      <div className="mt-4">
        <Chips label="Loan term" options={TERMS} value={inputs.termMonths as (typeof TERMS)[number]} onChange={(termMonths) => update({ ...inputs, termMonths })} render={(t) => `${t} mo`} />
      </div>

      <Strip>
        <DtiMeter before={v.debtToIncome.before} after={v.debtToIncome.after} guideline={v.debtToIncome.guideline} />
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted">Cash cushion after down payment</span>
            <span className="font-semibold tabular-nums text-ink">{formatUsd(v.cushion.afterDownPaymentCents)}</span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            {cushionOk ? <CheckCircle2 size={14} className="text-good" aria-hidden /> : <AlertTriangle size={14} className="text-warning" aria-hidden />}
            {cushionOk ? "Stays above" : "Drops below"} your {formatUsd(v.cushion.bufferTargetCents)} target
          </p>
          <p className="mt-1 text-xs text-muted">
            Monthly savings {formatUsd(v.monthlySavings.beforeCents)} → <span className="font-medium text-ink">{formatUsd(v.monthlySavings.afterCents)}</span>
          </p>
        </div>
      </Strip>

      <FanArea
        ariaLabel={`Interest paid over ${years} years: ${formatUsd(v.totalInterestCents)} at ${inputs.aprPercent}%, against ${formatUsd(v.typical.totalInterestCents)} at ${v.typical.aprPercent}%`}
        count={yours.length}
        bands={[
          { lower: yours.map(() => 0), upper: yours, fill: "var(--fan-outer)" },
          { lower: typical.map(() => 0), upper: typical, fill: "var(--fan-inner)" },
        ]}
        lines={[
          { values: yours, stroke: "var(--fan-line)" },
          { values: typical, stroke: "var(--ink-light)", width: 1.5 },
        ]}
        markers={[{ index: yours.length - 1, value: yours.at(-1) ?? 0, emphasis: true }]}
        startLabel="Today"
        endLabel={`Year ${years}`}
        defaultCaption={
          v.typical.interestDifferenceCents > 0
            ? `Interest paid over time. At a typical ${v.typical.aprPercent}% APR (gray line) you'd pay ${formatUsd(v.typical.interestDifferenceCents)} less`
            : `Interest paid over time, against a typical ${v.typical.aprPercent}% APR (gray line)`
        }
        caption={(i) => `Year ${i}: ${formatUsd(yours[i] ?? 0)} interest paid at ${inputs.aprPercent}%, ${formatUsd(typical[i] ?? 0)} at ${v.typical.aprPercent}%`}
      />

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Slider
          label="Down payment"
          value={inputs.downPaymentCents}
          min={0}
          max={Math.round(inputs.priceCents / 2 / 50_000) * 50_000}
          step={50_000}
          display={formatUsd(inputs.downPaymentCents)}
          onChange={(downPaymentCents) => update({ ...inputs, downPaymentCents })}
        />
        <Slider
          label="APR"
          value={inputs.aprPercent}
          min={0}
          max={30}
          step={0.25}
          display={`${inputs.aprPercent}%`}
          onChange={(aprPercent) => update({ ...inputs, aprPercent })}
        />
      </div>

      <div className="mt-4 space-y-1.5">
        <Eyebrow>Interest by term</Eyebrow>
        {v.terms.map((t) => (
          <button
            key={t.termMonths}
            type="button"
            onClick={() => update({ ...inputs, termMonths: t.termMonths })}
            className="group grid w-full grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-lg px-1 py-0.5 text-left text-xs hover:bg-inset"
          >
            <span className={t.termMonths === inputs.termMonths ? "font-semibold text-ink" : "text-muted"}>{t.termMonths} mo</span>
            <span className="h-2 rounded-r-[4px] bg-accent-soft">
              <span
                className="block h-2 rounded-r-[4px] transition-all duration-300"
                style={{ width: `${(t.totalInterestCents / maxTermInterest) * 100}%`, background: t.termMonths === inputs.termMonths ? "var(--accent)" : "var(--fan-inner)" }}
              />
            </span>
            <span className="tabular-nums text-ink">{formatUsd(t.monthlyPaymentCents)}/mo · {formatUsd(t.totalInterestCents)}</span>
          </button>
        ))}
      </div>

      {v.goalImpacts.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-line pt-3">
          <Eyebrow>Your goals with this loan</Eyebrow>
          {v.goalImpacts.map((g) => (
            <div key={g.goalId} className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className="text-sm text-ink">{g.goalName}</span>
              <ProbabilityRange low={g.probabilityLowAfter} high={g.probabilityHighAfter} note={false} />
            </div>
          ))}
          <p className="text-[11px] text-muted">Educational estimates, not guarantees.</p>
        </div>
      )}

      <TableToggle
        caption="Loan balance by year"
        head={["Year", "Principal paid", "Interest paid", "Still owed"]}
        rows={v.amortization.map((y) => [y.year, formatUsd(y.principalCents), formatUsd(y.interestCents), formatUsd(y.balanceCents)])}
      />
    </VisualCard>
  );
}
