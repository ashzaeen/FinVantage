"use client";

import { useEffect, useState } from "react";
import { formatUsd, type Goal, type LifeEvent, type SimulationRun } from "@finvantage/contracts";
import { FanChart } from "@/components/finance/FanChart";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";

const DEBOUNCE_MS = 150;

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <label className="block font-roboto text-sm">
      <span className="flex justify-between items-center text-xs font-medium text-[#16192c]">
        <span>{label}</span>
        <span className="font-poppins font-bold tabular-nums text-[#544af7]">{format(value)}</span>
      </span>
      <input
        type="range"
        className="mt-2 w-full accent-[#544af7] h-1.5 bg-[#eef1fa] rounded-lg cursor-pointer"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SimulatorClient({ goals, lifeEvents }: { goals: Goal[]; lifeEvents: LifeEvent[] }) {
  const [savingsDelta, setSavingsDelta] = useState(0);
  const [purchase, setPurchase] = useState(0);
  const [shiftMonths, setShiftMonths] = useState(0);
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstEvent = lifeEvents[0];

  useEffect(() => {
    let stale = false;
    const timer = setTimeout(() => {
      api
        .runSimulation({
          body: {
            persist: false,
            whatIf: {
              monthlySavingsDeltaCents: savingsDelta,
              purchaseAmountCents: purchase,
              eventShifts: firstEvent ? [{ lifeEventId: firstEvent.id, shiftMonths }] : [],
            },
          },
        })
        .then((result) => {
          if (!stale) setRun(result);
        })
        .catch((e: Error) => {
          if (!stale) setError(e.message);
        });
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [savingsDelta, purchase, shiftMonths, firstEvent]);

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <Card title="What if" subtitle="Model adjustments to savings and events">
        <div className="space-y-6 pt-1">
          <Slider
            label="Monthly savings delta"
            value={savingsDelta}
            min={-100_000}
            max={100_000}
            step={5_000}
            format={(v) => `${v >= 0 ? "+" : ""}${formatUsd(v)}`}
            onChange={setSavingsDelta}
          />
          <Slider
            label="Purchase amount"
            value={purchase}
            min={0}
            max={5_000_000}
            step={50_000}
            format={formatUsd}
            onChange={setPurchase}
          />
          {firstEvent && (
            <Slider
              label="Event timing"
              value={shiftMonths}
              min={-24}
              max={24}
              step={1}
              format={(v) => `${v >= 0 ? "+" : ""}${v} months`}
              onChange={setShiftMonths}
            />
          )}
        </div>
      </Card>

      <div className="space-y-6">
        {error && <p className="font-roboto text-sm text-[#ff4d6d]">{error}</p>}
        {run?.goalOutcomes.map((outcome) => (
          <Card key={outcome.goalId} title={goals.find((g) => g.id === outcome.goalId)?.name}>
            <div className="rounded-2xl bg-[#f4f5fa] p-4 mb-4">
              <ProbabilityRange low={outcome.probabilityLow} high={outcome.probabilityHigh} />
            </div>
            <FanChart points={outcome.fan} className="mt-2" />
          </Card>
        ))}
      </div>
    </div>
  );
}
