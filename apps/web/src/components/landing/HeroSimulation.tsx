"use client";

import { ArrowRight, Lightbulb, RotateCcw, Sofa } from "lucide-react";
import { useState } from "react";
import { formatUsd } from "@finvantage/contracts";
import { ExampleTag } from "./layout-parts";
import { useCountTo, useStages } from "./motion";

const PRICE_CENTS = 280_000;
const GOALS = [
  { label: "House Down Payment", before: 62, after: 57, color: "bg-lp-primary" },
  { label: "Emergency Fund", before: 81, after: 81, color: "bg-gain" },
] as const;

/** Four beats, played once on load: the price lands, goals fill, their dates shift, a smart move appears.
 * Scripted example figures, labeled as such. Reduced motion shows the finished state. */
export function HeroSimulation() {
  const [run, setRun] = useState(0);
  const stage = useStages(true, [450, 1100, 1100, 900], run);
  const price = useCountTo(PRICE_CENTS, stage >= 1, 1000);
  const shifted = stage >= 3;

  return (
    <div className="lp-rise mx-auto w-full max-w-[540px]" style={{ "--d": "180ms" } as React.CSSProperties} role="group" aria-label="Example of a purchase check">
      <div className="rounded-[28px] border border-lp-line bg-lp-surface p-5 shadow-lp-float sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-lp-text">Before You Buy</h2>
            <p className="mt-0.5 text-sm text-lp-text-2">A purchase, viewed through your goals.</p>
          </div>
          <div className="flex items-center gap-1">
            <ExampleTag />
            <button
              type="button"
              onClick={() => setRun((n) => n + 1)}
              aria-label="Replay the example"
              disabled={stage < 4}
              className="flex h-11 w-11 items-center justify-center rounded-full text-lp-muted transition-colors hover:bg-lp-tint-50 hover:text-lp-primary-dark disabled:opacity-40"
            >
              <RotateCcw size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="lp-pop mt-5 flex items-center justify-between gap-4 rounded-2xl bg-lp-bg p-4" data-on={stage >= 1}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lp-surface text-lp-ink shadow-sm">
              <Sofa size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-lp-muted">Considering</p>
              <p className="truncate text-sm font-semibold text-lp-text">Living Room Sofa</p>
            </div>
          </div>
          <p className="shrink-0 text-xl font-semibold tabular-nums text-lp-text">{formatUsd(Math.round(price))}</p>
        </div>

        <div className="mt-6 space-y-4">
          {GOALS.map((goal, i) => {
            const width = stage < 2 ? 0 : shifted ? goal.after : goal.before;
            const delta = goal.before - goal.after;
            return (
              <div key={goal.label}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-lp-text-2">{goal.label}</span>
                  <span className="tabular-nums text-lp-muted">
                    {shifted && delta > 0 ? (
                      <>
                        <span className="text-lp-warn-text">{goal.after}% funded</span>
                        <span className="ml-1.5 text-[11px]">was {goal.before}%</span>
                      </>
                    ) : (
                      <>{stage >= 2 ? goal.before : 0}% funded{shifted ? " · No change" : ""}</>
                    )}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-lp-line-soft">
                  <div
                    className={`lp-fill h-full w-full rounded-full ${goal.color}`}
                    style={{ transform: `scaleX(${width / 100})`, transitionDelay: stage === 2 ? `${i * 120}ms` : "0ms" }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="lp-pop rounded-2xl border border-lp-line-soft p-4" data-on={stage >= 2}>
            <p className="text-xs text-lp-muted">House goal date</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm font-semibold tabular-nums text-lp-text">
              <span className={shifted ? "text-lp-muted line-through decoration-1" : ""}>Feb 2030</span>
              {shifted && (
                <>
                  <ArrowRight size={14} className="text-lp-muted" aria-hidden="true" />
                  <span className="text-lp-warn-text">May 2030</span>
                </>
              )}
            </p>
            <p className="lp-fade mt-1 text-xs text-lp-warn-text" data-on={shifted}>About 3 months later</p>
          </div>
          <div className="lp-pop rounded-2xl bg-lp-tint-50 p-4" data-on={stage >= 4}>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-lp-primary-dark">
              <Lightbulb size={14} aria-hidden="true" /> Smart Move
            </p>
            <p className="mt-2 text-sm leading-5 text-lp-primary-dark">Split it over two months. The date moves 1 month, not 3.</p>
          </div>
        </div>

        <p className="mt-5 text-[11px] leading-4 text-lp-muted">Illustrative figures only. Your results depend on your accounts and assumptions.</p>
      </div>
    </div>
  );
}
