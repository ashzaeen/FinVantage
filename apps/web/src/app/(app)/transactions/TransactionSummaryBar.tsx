"use client";

import { useEffect, useState } from "react";
import { formatUsd, type TransactionSummary } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { compactUsd, monthName } from "@/lib/format";

/**
 * Money in, money out and net for the rows the list is showing, with the last six months of each.
 * The totals come from the API for exactly these ids, so a filter and its figures cannot disagree.
 * It says nothing if the request fails: the list does not depend on it.
 */
export function TransactionSummaryBar({ ids, filtered }: { ids: string[]; filtered: boolean }) {
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    let cancelled = false;
    // Typing in the search box changes the ids on every key: wait for a pause.
    const timer = setTimeout(() => {
      api.summarizeTransactions({ body: { ids } })
        .then((result) => { if (!cancelled) setSummary(result); })
        .catch(() => { if (!cancelled) setSummary(null); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
    // `key` stands for `ids`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!summary || summary.count === 0) return null;
  const peak = Math.max(1, ...summary.byMonth.flatMap((m) => [m.inCents, m.outCents]));
  const net = summary.netCents;

  return (
    <div className="mx-5 mb-4 grid grid-cols-1 gap-4 rounded-2xl bg-inset p-4 sm:mx-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end" aria-label={filtered ? "Totals for the matching transactions" : "Totals for all transactions"}>
      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-muted">Money In</dt>
          <dd className="font-poppins text-base font-bold tabular-nums text-gain">{formatUsd(summary.inCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Money Out</dt>
          <dd className="font-poppins text-base font-bold tabular-nums text-ink">{formatUsd(summary.outCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Net</dt>
          <dd className={`font-poppins text-base font-bold tabular-nums ${net >= 0 ? "text-gain" : "text-ink"}`}>{net >= 0 ? "+" : "−"}{formatUsd(Math.abs(net))}</dd>
        </div>
      </dl>
      <div className="flex items-end gap-1.5" role="img" aria-label={`Last six months. ${summary.byMonth.map((m) => `${monthName(m.month)}: in ${formatUsd(m.inCents)}, out ${formatUsd(m.outCents)}`).join("; ")}.`}>
        {summary.byMonth.map((m, i) => (
          <div key={m.month} className="flex flex-col items-center gap-1" title={`${monthName(m.month)}: in ${compactUsd(m.inCents)}, out ${compactUsd(m.outCents)}`}>
            <div className="flex h-10 items-end gap-0.5" aria-hidden="true">
              <span className="bar-grow w-2 rounded-t-sm" style={{ height: `${Math.max(2, (m.inCents / peak) * 100)}%`, background: "var(--flow-in)", ["--i" as string]: i }} />
              <span className="bar-grow w-2 rounded-t-sm" style={{ height: `${Math.max(2, (m.outCents / peak) * 100)}%`, background: "var(--flow-out)", ["--i" as string]: i }} />
            </div>
            <span className="text-xs text-muted" aria-hidden="true">{monthName(m.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
