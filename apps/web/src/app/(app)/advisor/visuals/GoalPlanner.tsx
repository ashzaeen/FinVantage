"use client";

import { useEffect, useState } from "react";
import { Check, Plane, Plus } from "lucide-react";
import { formatPercent, formatUsd, type GoalPlanVisual } from "@finvantage/contracts";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { api } from "@/lib/api";
import { remember, remembered } from "../draft-state";
import { Chips, Eyebrow, FanArea, Ring, Slider, Strip, TableToggle, Ticker, useVisual, VisualCard } from "./shared";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const short = (iso: string) => MONTH.format(new Date(`${iso}T00:00:00Z`));
const long = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`));

/** A calendar date `months` after `iso`. A date, not a financial figure. */
function monthsAfter(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function GoalPlanner({ initial, id }: { initial: GoalPlanVisual; id: string }) {
  const { visual: v, update, pending, failed } = useVisual(initial);
  const { inputs } = v;
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [budgetMax] = useState(() => Math.max(50_000, Math.ceil((initial.inputs.targetCents * 3) / 5_000) * 5_000));

  useEffect(() => {
    if (remembered(id) === "saved") setSaveState("saved");
  }, [id]);

  // The slider holds the user's choice until the recomputed plan arrives.
  const [chosenMonths, setChosenMonths] = useState<number | null>(null);
  useEffect(() => setChosenMonths(null), [v.monthsLeft]);

  const selected = new Set(v.cuts.filter((c) => c.selected).map((c) => c.categoryId));
  const toggle = (categoryId: string) => {
    const next = new Set(selected);
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);
    update({ ...inputs, selectedCuts: [...next] });
  };

  const fundFirst = inputs.fundFirst !== false;

  async function save() {
    setSaveState("saving");
    try {
      const goals = await api.listGoals();
      // Funding it first means it goes to the top, and the user's other goals move down one.
      if (fundFirst) {
        for (const { id: goalId, userId: _owner, ...goal } of goals) {
          await api.updateGoal({ params: { id: goalId }, body: { ...goal, priorityRank: goal.priorityRank + 1 } });
        }
      }
      await api.createGoal({
        body: {
          name: inputs.name,
          targetCents: inputs.targetCents,
          currentCents: inputs.savedCents,
          targetDate: inputs.targetDate,
          priorityRank: fundFirst ? 1 : goals.length + 1,
          flexibility: "flexible",
          linkedAccountId: null,
        },
      });
      setSaveState("saved");
      remember(id, "saved");
    } catch {
      setSaveState("error");
    }
  }

  const fan = v.fan;
  const months = chosenMonths ?? Math.max(1, v.monthsLeft);

  return (
    <VisualCard pending={pending} failed={failed} label={`${inputs.name} plan`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>{inputs.name}</Eyebrow>
          {v.monthlyNeededCents === null ? (
            <p className="mt-1 font-poppins text-2xl font-semibold text-ink">That date has passed</p>
          ) : (
            <p className="mt-1 font-poppins text-4xl font-semibold tracking-tight text-ink">
              <Ticker value={v.monthlyNeededCents} format={formatUsd} />
              <span className="ml-1 text-base font-normal text-muted">/month</span>
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted">
            for {v.monthsLeft} {v.monthsLeft === 1 ? "month" : "months"} · {formatUsd(inputs.targetCents)} by {long(inputs.targetDate)}
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saveState === "saving" || saveState === "saved"}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
            saveState === "saved" ? "bg-good-bg text-good" : "bg-accent text-white hover:opacity-90"
          } disabled:cursor-default`}
        >
          {saveState === "saved" ? <Check size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
          {saveState === "saved" ? "Saved as Goal" : saveState === "saving" ? "Saving…" : "Save as Goal"}
        </button>
      </div>
      {saveState === "error" && <p role="alert" className="mt-1 text-xs text-critical">That didn&apos;t save. Please try again.</p>}

      <div className="mt-4">
        <Chips
          label="Priority"
          options={["first", "after"] as const}
          value={fundFirst ? "first" : "after"}
          onChange={(o) => update({ ...inputs, fundFirst: o === "first" })}
          render={(o) => (o === "first" ? "Fund It First" : "After My Other Goals")}
        />
        <p className="mt-1.5 text-[11px] text-muted">
          {fundFirst
            ? "Your savings go here before your other goals, so they may slow down."
            : "Your other goals are funded first, and this gets what's left."}
        </p>
      </div>

      <Strip>
        <div>
          <Eyebrow>Chance you&apos;ll have it in time</Eyebrow>
          <div className="mt-1">
            {v.probabilityLow !== null && v.probabilityHigh !== null
              ? <ProbabilityRange low={v.probabilityLow} high={v.probabilityHigh} />
              : <p className="text-sm text-muted">Not enough data yet.</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Eyebrow>Your other goals with it</Eyebrow>
          {v.otherGoals.length === 0 && <p className="text-sm text-muted">No other goals.</p>}
          {v.otherGoals.slice(0, 3).map((g) => (
            <div key={g.goalId} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-xs text-ink">{g.goalName}</span>
              <ProbabilityRange low={g.probabilityLowAfter} high={g.probabilityHighAfter} note={false} />
            </div>
          ))}
        </div>
      </Strip>

      {fan.length > 1 && (
        <div className="relative">
          <div className="pointer-events-none absolute right-0 top-9 flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
            <Plane size={12} aria-hidden /> {formatUsd(inputs.targetCents)}
          </div>
          <FanArea
            ariaLabel={`Projected savings for ${inputs.name} from ${short(fan[0]!.date)} to ${short(fan.at(-1)!.date)}`}
            count={fan.length}
            bands={[
              { lower: fan.map((p) => p.p10Cents), upper: fan.map((p) => p.p90Cents), fill: "var(--fan-outer)" },
              { lower: fan.map((p) => p.p25Cents), upper: fan.map((p) => p.p75Cents), fill: "var(--fan-inner)" },
            ]}
            lines={[{ values: fan.map((p) => p.p50Cents), stroke: "var(--fan-line)" }]}
            markers={fan.map((p, i) => ({ index: i, value: p.p50Cents, emphasis: i === fan.length - 1 }))}
            startLabel={short(fan[0]!.date)}
            endLabel={short(fan.at(-1)!.date)}
            defaultCaption="Saved toward it: the likely path, with 25-75 and 10-90 percentile bands"
            caption={(i) => {
              const p = fan[i]!;
              return `${short(p.date)}: about ${formatUsd(p.p50Cents)} saved, range ${formatUsd(p.p10Cents)} to ${formatUsd(p.p90Cents)}`;
            }}
          />
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Slider
          label="Budget"
          value={inputs.targetCents}
          min={5_000}
          max={budgetMax}
          step={5_000}
          display={formatUsd(inputs.targetCents)}
          onChange={(targetCents) => update({ ...inputs, targetCents })}
        />
        <Slider
          label="When"
          value={months}
          min={1}
          max={36}
          step={1}
          display={`${short(inputs.targetDate)} · ${months} mo`}
          onChange={(m) => {
            setChosenMonths(m);
            update({ ...inputs, targetDate: monthsAfter(v.today, m) });
          }}
        />
      </div>

      {v.cuts.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <Eyebrow>Where it could come from</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-2">
            {v.cuts.map((c) => (
              <button
                key={c.categoryId}
                type="button"
                onClick={() => toggle(c.categoryId)}
                aria-pressed={c.selected}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-all ${
                  c.selected ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-card text-[var(--ink-secondary)] hover:border-[var(--ink-light)]"
                }`}
              >
                {c.selected && <Check size={14} aria-hidden />}
                {c.label}
                <span className="tabular-nums text-muted">−{formatUsd(c.cutCents)}</span>
              </button>
            ))}
          </div>
          {v.coverage.share !== null && (
            <div className="mt-3 flex items-center gap-3">
              <Ring share={v.coverage.share} />
              <p className="text-sm text-ink">
                {v.coverage.coveredCents === 0
                  ? "Pick a cut to see how much of the monthly amount it covers."
                  : <>These cover <span className="font-semibold tabular-nums">{formatPercent(v.coverage.share)}</span> of the monthly amount, {formatUsd(v.coverage.coveredCents)} a month.</>}
              </p>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted">
            Suggested from your {v.cutsBasis === "full_months" ? "last three months" : "spending so far this month"} on flexible categories, never more than half of a category.
          </p>
        </div>
      )}

      <TableToggle
        caption={`Projected savings for ${inputs.name}`}
        head={["Date", "Likely", "Low", "High"]}
        rows={fan.map((p) => [short(p.date), formatUsd(p.p50Cents), formatUsd(p.p10Cents), formatUsd(p.p90Cents)])}
      />
    </VisualCard>
  );
}
