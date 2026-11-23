"use client";

import { useEffect, useState } from "react";
import { formatPercent, formatUsd, type CreditCardRow, type CreditWhatIf as WhatIf } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { api } from "@/lib/api";

const pct = (v: number | null) => (v === null ? "N/A" : formatPercent(v));

/** Pick a card and a payment, and see utilization and an estimated score range change. Saves nothing. */
export function CreditWhatIf({ cards }: { cards: CreditCardRow[] }) {
  const payable = cards.filter((c) => c.balanceCents > 0);
  const [cardId, setCardId] = useState(payable[0]?.id ?? "");
  const [dollars, setDollars] = useState(0);
  const [result, setResult] = useState<WhatIf | null>(null);
  const [error, setError] = useState("");
  const card = payable.find((c) => c.id === cardId);
  const maxDollars = card ? Math.floor(card.balanceCents / 100) : 0;

  useEffect(() => {
    if (!card || dollars <= 0) { setResult(null); return; }
    let live = true;
    const timer = setTimeout(() => {
      api.creditWhatIf({ body: { cardId: card.id, paymentCents: dollars * 100 } })
        .then((r) => { if (live) { setResult(r); setError(""); } })
        .catch(() => { if (live) setError("Could not work this out right now."); });
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [card, dollars]);

  if (payable.length === 0) return null;

  return (
    <Card title="What If You Paid Down a Card?" subtitle="See how a payment could change utilization. Nothing is paid or saved." action={<MockedBadge />} lift={false}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">Card
          <select
            value={cardId}
            onChange={(e) => { setCardId(e.target.value); setDollars(0); }}
            className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none focus:border-accent-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            {payable.map((c) => <option key={c.id} value={c.id}>{c.name} · {formatUsd(c.balanceCents)}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">Payment: {formatUsd(dollars * 100)}
          <input
            type="range"
            min={0}
            max={maxDollars}
            step={Math.max(1, Math.round(maxDollars / 100))}
            value={dollars}
            onChange={(e) => setDollars(Number(e.target.value))}
            className="mt-2 block h-11 w-full accent-[var(--accent)]"
          />
        </label>
      </div>
      {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--critical)" }}>{error}</p>}
      <div role="status" aria-live="polite" className="mt-4">
        {result ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([["Before", result.before], ["After", result.after]] as const).map(([label, state]) => (
              <div key={label} className="rounded-xl p-3" style={{ background: "var(--surface-inset)" }}>
                <p className="text-xs font-semibold text-muted">{label}</p>
                <p className="mt-1 text-sm text-ink">All cards use <strong>{pct(state.totalUtilization)}</strong> of their limits. This card: <strong>{pct(state.cardUtilization)}</strong>.</p>
                <p className="mt-1 text-sm text-ink">Estimated score range: <strong className="tabular-nums">{state.scoreLow} to {state.scoreHigh}</strong></p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Move the slider to try a payment.</p>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">Demo estimate. Real scores vary by bureau and model.</p>
    </Card>
  );
}
