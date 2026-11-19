"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Subscription, UpdateSubscription } from "@finvantage/contracts";
import { api } from "@/lib/api";

type Step = { kind: "menu" } | { kind: "confirm"; status: "cancelling" | "cancelled" };

/** Today in UTC, which is the day the server counts, so a date picked here is never in its future. */
const todayUtc = () => new Date().toISOString().slice(0, 10);

const buttonStyle = { background: "var(--accent-soft)", color: "var(--accent)" } as const;
const primaryStyle = { background: "var(--accent)", color: "#fff" } as const;

/**
 * The choices a person can make about one subscription. Each is a button they press; cancelling
 * asks first. FinVantage never cancels anything at the provider, so the wording says plainly that
 * this only records what the person did.
 */
export function SubscriptionActions({ item }: { item: Subscription }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "menu" });
  const [cancelledOn, setCancelledOn] = useState(todayUtc);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setStep({ kind: "menu" });
    setError(null);
  };

  const save = async (body: UpdateSubscription) => {
    setError(null);
    try {
      await api.updateSubscription({ params: { id: item.id }, body });
      close();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that. Try again.");
    }
  };

  const otherKind = item.kind === "bill" ? "subscription" : "bill";
  // A bill is something you owe, such as a mortgage or a phone plan, so it is not offered a
  // cancellation here. It can be kept, or moved to subscriptions if it is really one.
  const cancellable: { label: string; run: () => void }[] =
    item.kind === "bill"
      ? []
      : [
          { label: "Mark as Cancelling", run: () => setStep({ kind: "confirm", status: "cancelling" }) },
          { label: "Mark as Cancelled", run: () => setStep({ kind: "confirm", status: "cancelled" }) },
        ];
  const choices: { label: string; run: () => void }[] =
    item.status === "active"
      ? [
          { label: "Keep It", run: () => void save({ status: "keep" }) },
          ...cancellable,
          { label: item.kind === "bill" ? "Move to Subscriptions" : "Move to Bills", run: () => void save({ kind: otherKind }) },
        ]
      : item.status === "keep"
        ? [{ label: "Stop Keeping It", run: () => void save({ status: "active" }) }]
        : item.status === "cancelling"
          ? [
              { label: "Mark as Cancelled", run: () => setStep({ kind: "confirm", status: "cancelled" }) },
              { label: "Back to Active", run: () => void save({ status: "active" }) },
            ]
          : [{ label: "Back to Active", run: () => void save({ status: "active" }) }];

  return (
    <div className="mt-2 pl-[3.25rem]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="text-xs font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--accent)" }}
      >
        {open ? "Close" : "Manage"}
      </button>

      {open && (
        <div className="mt-2 rounded-xl p-3" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }} role="group" aria-label={`Manage ${item.merchant}`}>
          {step.kind === "menu" ? (
            <div className="flex flex-wrap gap-2">
              {choices.map((choice) => (
                <button key={choice.label} type="button" disabled={pending} onClick={choice.run} className="rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-60" style={buttonStyle}>
                  {choice.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: "var(--ink)" }}>
                {step.status === "cancelled" ? `Mark ${item.merchant} as cancelled?` : `Mark ${item.merchant} as cancelling?`}
              </p>
              <p className="text-xs" style={{ color: "var(--ink-secondary)" }}>
                FinVantage does not cancel anything for you. This only records what you did.{" "}
                {step.status === "cancelled"
                  ? "It comes off your monthly total, and if a charge posts after you cancelled, you will see it flagged."
                  : "It keeps counting toward your totals until you mark it cancelled."}
              </p>
              {step.status === "cancelled" && (
                <label className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                  When did you cancel?
                  <input
                    type="date"
                    value={cancelledOn}
                    max={todayUtc()}
                    onChange={(e) => setCancelledOn(e.target.value)}
                    className="rounded-lg border px-2 py-1 text-xs"
                    style={{ borderColor: "var(--border)", background: "var(--surface-raised)", color: "var(--ink)" }}
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || (step.status === "cancelled" && !cancelledOn)}
                  onClick={() => void save(step.status === "cancelled" ? { status: "cancelled", cancelledOn } : { status: "cancelling" })}
                  className="rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                  style={primaryStyle}
                >
                  Confirm
                </button>
                <button type="button" onClick={() => setStep({ kind: "menu" })} className="rounded-full px-3 py-1.5 text-xs font-medium" style={buttonStyle}>
                  Go Back
                </button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs" style={{ color: "var(--loss)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
