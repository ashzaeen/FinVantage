"use client";

import { useEffect, useState } from "react";
import { formatUsd, type RetirementProjection } from "@finvantage/contracts";
import { FanChart } from "@/components/finance/FanChart";
import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { api } from "@/lib/api";
import { longDate } from "@/lib/format";

const field = "mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3 text-base tabular-nums text-ink outline-none focus:border-accent-ink";

/** A range for a retirement balance at the age you choose. A stated simplification, not a forecast. */
export function RetirementFanCard() {
  const [age, setAge] = useState("35");
  const [retireAt, setRetireAt] = useState("65");
  const [monthly, setMonthly] = useState("500");
  const [fan, setFan] = useState<RetirementProjection | null>(null);
  const [error, setError] = useState("");

  const years = Math.floor(Number(retireAt) - Number(age));
  const contribution = Math.round(Number(monthly) * 100);
  const valid = Number.isFinite(years) && years >= 1 && years <= 60 && Number.isFinite(contribution) && contribution >= 0;

  useEffect(() => {
    if (!valid) return;
    let live = true;
    const timer = setTimeout(() => {
      api.projectRetirement({ body: { years, monthlyContributionCents: contribution } })
        .then((r) => { if (live) { setFan(r); setError(""); } })
        .catch(() => { if (live) setError("Could not work out the range right now."); });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [valid, years, contribution]);

  const last = fan?.points.at(-1);
  return (
    <Card title="Retirement Range" subtitle="What your retirement accounts could be worth" action={<MockedBadge />} lift={false}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-ink">Your Age<input type="number" inputMode="numeric" min={18} max={90} value={age} onChange={(e) => setAge(e.target.value)} className={field} /></label>
        <label className="block text-sm font-medium text-ink">Retire At<input type="number" inputMode="numeric" min={19} max={90} value={retireAt} onChange={(e) => setRetireAt(e.target.value)} className={field} /></label>
        <label className="block text-sm font-medium text-ink">Monthly Contribution ($)<input type="number" inputMode="numeric" min={0} step={50} value={monthly} onChange={(e) => setMonthly(e.target.value)} className={field} /></label>
      </div>
      {!valid && <p className="mt-3 text-sm text-muted">Enter a retirement age one to sixty years after your age, and a contribution of $0 or more.</p>}
      {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--critical)" }}>{error}</p>}
      {valid && fan && last && (
        <div className="mt-4" aria-live="polite">
          <p className="text-sm text-ink">
            By {longDate(last.date)}, about {years} years from now, your retirement accounts are likely worth between <strong>{formatUsd(last.p10Cents)}</strong> and <strong>{formatUsd(last.p90Cents)}</strong>. The middle case is about {formatUsd(last.p50Cents)}.
          </p>
          <FanChart points={fan.points} height={200} className="mt-3" />
          <p className="mt-2 text-xs text-muted">
            Starts from {fan.startingFromAccounts ? `your retirement accounts today (${formatUsd(fan.startingCents)})` : "$0, because no retirement account is linked"}, adds {formatUsd(fan.monthlyContributionCents)} a month, and grows at an assumed 6% a year with ups and downs. No taxes, no inflation, and a fixed contribution. A range is shown because nobody knows the market in advance.
          </p>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Educational estimate, not a guarantee. Nothing is saved.</p>
    </Card>
  );
}
