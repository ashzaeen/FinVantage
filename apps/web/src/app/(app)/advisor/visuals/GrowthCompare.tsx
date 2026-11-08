"use client";

import { useState } from "react";
import { ExternalLink, Globe, Landmark, LineChart, Minus, Plus, User, X } from "lucide-react";
import { formatUsd, type GrowthCompare as GrowthCompareVisual, type GrowthRate } from "@finvantage/contracts";
import { Chips, Eyebrow, FanArea, Slider, TableToggle, Ticker, useVisual, VisualCard } from "./shared";

/** How each account works, in plain words. Education, not tax advice: no figures, no instructions. */
const ACCOUNTS = [
  {
    id: "roth",
    name: "Roth IRA",
    lines: ["Pay tax on the money now", "Withdrawals in retirement can be tax-free", "Your contributions can come out early; earnings usually wait until retirement", "Often weighed by people who expect a higher tax rate later"],
  },
  {
    id: "traditional",
    name: "Traditional IRA",
    lines: ["May lower your taxes now", "Withdrawals in retirement are taxed as income", "Early withdrawals usually carry a penalty", "Often weighed by people who expect a lower tax rate later"],
  },
  {
    id: "taxable",
    name: "Taxable Account",
    lines: ["No tax break going in", "Gains are taxed when you sell", "Take money out any time, no penalty", "Often used for goals before retirement"],
  },
] as const;

const YEARS = [5, 10, 20, 30] as const;
const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const MAX_RATES = 4;

const SOURCE = {
  user: { label: "Your Rate", icon: User },
  web: { label: "From the Web", icon: Globe },
  assumed: { label: "Assumed", icon: null },
} as const;

/** One rate in the legend: its swatch, name, where it came from, and controls to change it. */
function RateRow({
  rate,
  color,
  valueCents,
  onChange,
  onRemove,
}: {
  rate: GrowthRate;
  color: string;
  valueCents: number;
  onChange: (rate: GrowthRate) => void;
  onRemove: (() => void) | null;
}) {
  const source = SOURCE[rate.source];
  const Icon = source.icon;
  // Any change the user makes turns the rate into theirs.
  const set = (percent: number) => onChange({ ...rate, annualReturnPercent: Math.max(-50, Math.min(50, Math.round(percent * 10) / 10)), source: "user" });
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-1.5 hover:bg-inset">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{rate.label}</span>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${rate.source === "assumed" ? "bg-warning-bg text-warning" : "bg-accent-soft text-accent"}`}>
        {Icon && <Icon size={10} aria-hidden />} {source.label}
      </span>
      <span className="inline-flex items-center rounded-lg border border-line">
        <button type="button" onClick={() => set(rate.annualReturnPercent - 0.5)} className="px-1.5 py-1 text-muted hover:text-ink" aria-label={`Lower ${rate.label}`}>
          <Minus size={12} />
        </button>
        <input
          type="number"
          step={0.1}
          min={-50}
          max={50}
          value={rate.annualReturnPercent}
          onChange={(e) => e.target.value !== "" && set(Number(e.target.value))}
          className="w-12 bg-transparent text-center text-xs tabular-nums text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={`${rate.label} yearly return, percent`}
        />
        <span className="pr-1 text-xs text-muted">%</span>
        <button type="button" onClick={() => set(rate.annualReturnPercent + 0.5)} className="px-1.5 py-1 text-muted hover:text-ink" aria-label={`Raise ${rate.label}`}>
          <Plus size={12} />
        </button>
      </span>
      <span className="w-20 text-right text-sm font-medium tabular-nums text-ink">{formatUsd(valueCents)}</span>
      {onRemove ? (
        <button type="button" onClick={onRemove} className="rounded-md p-1 text-subtle hover:text-critical" aria-label={`Remove ${rate.label}`}>
          <X size={14} />
        </button>
      ) : (
        <span className="w-[22px]" aria-hidden />
      )}
    </li>
  );
}

export function GrowthCompare({ initial }: { initial: GrowthCompareVisual }) {
  const { visual: v, update, pending, failed } = useVisual(initial);
  const { inputs, series } = v;
  const rates = inputs.rates;
  const [account, setAccount] = useState<(typeof ACCOUNTS)[number]["id"]>("roth");
  const chosen = ACCOUNTS.find((a) => a.id === account)!;
  const last = series.at(-1)!;
  const lead = rates.length === 1 ? last.valuesCents[0] ?? 0 : null;
  const finals = last.valuesCents;
  const held = rates.find((r) => r.source !== "assumed")?.label ?? "An index fund";
  const hasAssumed = rates.some((r) => r.source === "assumed");

  const setRates = (next: GrowthRate[]) => update({ ...inputs, rates: next });
  const addRate = () => {
    const base = rates.at(-1)?.annualReturnPercent ?? 7;
    setRates([...rates, { label: `My rate ${rates.length + 1}`, annualReturnPercent: Math.min(50, base + 1), source: "user" }]);
  };

  return (
    <VisualCard pending={pending} failed={failed} label="Investment growth comparison">
      <Eyebrow>An IRA is the account. A fund such as an index fund is what it holds.</Eyebrow>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist" aria-label="Account types">
        {ACCOUNTS.map((a) => {
          const active = a.id === account;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setAccount(a.id)}
              className={`rounded-2xl border-2 p-2.5 text-left transition-all ${
                active ? "border-accent bg-accent-soft/60 shadow-[var(--shadow-hover)]" : "border-dashed border-line hover:border-[var(--ink-light)]"
              }`}
            >
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${active ? "text-accent" : "text-ink"}`}>
                <Landmark size={13} aria-hidden /> {a.name}
              </span>
              <span className={`mt-2 flex items-center gap-1.5 truncate rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition-colors ${active ? "bg-accent text-white" : "bg-inset text-[var(--ink-secondary)]"}`}>
                <LineChart size={12} aria-hidden /> {held}
              </span>
            </button>
          );
        })}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2" role="tabpanel" aria-label={chosen.name}>
        {chosen.lines.map((line) => (
          <li key={line} className="flex gap-2 text-[var(--ink-secondary)]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Growth either way, inside or outside an IRA</Eyebrow>
            {lead !== null ? (
              <p className="mt-1 font-poppins text-3xl font-semibold tracking-tight text-ink">
                <span className="text-base font-normal text-muted">about </span>
                <Ticker value={lead} format={formatUsd} />
                <span className="ml-1 text-base font-normal text-muted">at {rates[0]!.annualReturnPercent}%</span>
              </p>
            ) : (
              <p className="mt-1 font-poppins text-3xl font-semibold tracking-tight text-ink">
                <Ticker value={Math.min(...finals)} format={formatUsd} />
                <span className="mx-1.5 text-base font-normal text-muted">to</span>
                <Ticker value={Math.max(...finals)} format={formatUsd} />
              </p>
            )}
            <p className="mt-0.5 text-xs tabular-nums text-muted">
              after {inputs.years} years · {formatUsd(last.contributedCents)} put in
            </p>
          </div>
          <Chips label="Years" options={YEARS} value={inputs.years as (typeof YEARS)[number]} onChange={(years) => update({ ...inputs, years })} render={(y) => `${y} yr`} />
        </div>

        <FanArea
          fit
          ariaLabel={`Growth over ${inputs.years} years: ${rates.map((r, i) => `${r.label} at ${r.annualReturnPercent}% ends near ${formatUsd(finals[i] ?? 0)}`).join("; ")}`}
          count={series.length}
          bands={rates.length > 1 ? [{ lower: series.map((p) => Math.min(...p.valuesCents)), upper: series.map((p) => Math.max(...p.valuesCents)), fill: "var(--fan-outer)" }] : []}
          lines={[
            ...rates.map((_, i) => ({ values: series.map((p) => p.valuesCents[i] ?? 0), stroke: COLORS[i]! })),
            { values: series.map((p) => p.contributedCents), stroke: "var(--ink-light)", width: 1.5 },
          ]}
          markers={rates.map((_, i) => ({ index: series.length - 1, value: finals[i] ?? 0, emphasis: true, color: COLORS[i] }))}
          startLabel="Today"
          endLabel={`Year ${inputs.years}`}
          defaultCaption="Gray: what you put in. Hover the chart to compare any year. Past returns don't predict future ones."
          caption={(i) => {
            const p = series[i]!;
            return `Year ${p.year}: ${formatUsd(p.contributedCents)} put in · ${rates.map((r, j) => `${r.label} ${formatUsd(p.valuesCents[j] ?? 0)}`).join(" · ")}`;
          }}
        />

        <ul className="mt-2 space-y-0.5" aria-label="Rates compared">
          {rates.map((rate, i) => (
            <RateRow
              key={i}
              rate={rate}
              color={COLORS[i]!}
              valueCents={finals[i] ?? 0}
              onChange={(next) => setRates(rates.map((r, j) => (j === i ? next : r)))}
              onRemove={rates.length > 1 ? () => setRates(rates.filter((_, j) => j !== i)) : null}
            />
          ))}
        </ul>
        {rates.length < MAX_RATES && (
          <button type="button" onClick={addRate} className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft">
            <Plus size={13} aria-hidden /> Add a Rate
          </button>
        )}

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Slider
            label="Starting amount"
            value={inputs.initialCents}
            min={0}
            max={Math.max(1_000_000, initial.inputs.initialCents * 4)}
            step={5_000}
            display={formatUsd(inputs.initialCents)}
            onChange={(initialCents) => update({ ...inputs, initialCents })}
          />
          <Slider
            label="Added each month"
            value={inputs.monthlyCents}
            min={0}
            max={Math.max(100_000, initial.inputs.monthlyCents * 4)}
            step={2_500}
            display={formatUsd(inputs.monthlyCents)}
            onChange={(monthlyCents) => update({ ...inputs, monthlyCents })}
          />
        </div>

        {(inputs.sources ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs text-muted">Web rates from</span>
            {(inputs.sources ?? []).map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                {s.title} <ExternalLink size={11} aria-hidden />
              </a>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted">
          {hasAssumed ? "Assumed rates are placeholders, not published figures: set your own above. " : ""}
          Past returns don&apos;t predict future ones, and markets can fall. Account rules and limits change; check them before you decide. Educational only, not tax advice.
        </p>
        <TableToggle
          caption="Growth by year"
          head={["Year", "Put in", ...rates.map((r) => `${r.label} (${r.annualReturnPercent}%)`)]}
          rows={series.map((p) => [p.year, formatUsd(p.contributedCents), ...p.valuesCents.map((c) => formatUsd(c))])}
        />
      </div>
    </VisualCard>
  );
}
