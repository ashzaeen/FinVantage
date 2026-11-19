"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CancellationGuide, Subscription, SubscriptionDraft, SubscriptionDraftAction, UpdateSubscription } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/subscriptions";

type Step =
  | { kind: "menu" }
  | { kind: "confirm"; status: "cancelling" | "cancelled" }
  | { kind: "guide" }
  | { kind: "draft"; action: SubscriptionDraftAction };

/** Today in UTC, which is the day the server counts, so a date picked here is never in its future. */
const todayUtc = () => new Date().toISOString().slice(0, 10);

const buttonStyle = { background: "var(--accent-soft)", color: "var(--accent)" } as const;
const primaryStyle = { background: "var(--accent)", color: "#fff" } as const;

const DRAFT_LABEL: Record<SubscriptionDraftAction, string> = {
  cancel: "Write a Cancellation Message",
  lower_bill: "Ask for a Lower Bill",
  dispute: "Write a Dispute Message",
};

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * The choices a person can make about one subscription, and the help for acting on it. Each choice
 * is a button they press; cancelling asks first. FinVantage never cancels, sends or pays anything:
 * the guide is steps to follow, a drafted message is text to copy, and a status only records what
 * the person did, and the wording says so.
 */
export function SubscriptionActions({ item }: { item: Subscription }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "menu" });
  const [cancelledOn, setCancelledOn] = useState(todayUtc);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [guide, setGuide] = useState<CancellationGuide | null>(null);
  const [draft, setDraft] = useState<SubscriptionDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<"yes" | "manual" | null>(null);
  const draftBox = useRef<HTMLTextAreaElement>(null);
  /** The latest request, so an answer that arrives after the person moved on is ignored. */
  const request = useRef(0);

  const goTo = (next: Step) => {
    request.current += 1;
    setStep(next);
    setError(null);
    setLoading(false);
    setCopied(null);
  };

  const close = () => {
    setOpen(false);
    setGuide(null);
    setDraft(null);
    goTo({ kind: "menu" });
  };

  const save = async (body: UpdateSubscription) => {
    setError(null);
    try {
      await api.updateSubscription({ params: { id: item.id }, body });
      close();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(message(e, "Could not save that. Try again."));
    }
  };

  const showGuide = async () => {
    goTo({ kind: "guide" });
    const mine = request.current;
    setGuide(null);
    setLoading(true);
    try {
      const result = await api.getSubscriptionGuide({ params: { id: item.id } });
      if (request.current === mine) setGuide(result);
    } catch (e) {
      if (request.current === mine) setError(message(e, "Could not load the steps. Try again."));
    } finally {
      if (request.current === mine) setLoading(false);
    }
  };

  const showDraft = async (action: SubscriptionDraftAction) => {
    goTo({ kind: "draft", action });
    const mine = request.current;
    setDraft(null);
    setLoading(true);
    try {
      const result = await api.draftSubscriptionMessage({ params: { id: item.id }, body: { action } });
      if (request.current === mine) setDraft(result);
    } catch (e) {
      if (request.current === mine) setError(message(e, "Could not write the message. Try again."));
    } finally {
      if (request.current === mine) setLoading(false);
    }
  };

  const copy = async () => {
    draftBox.current?.select();
    try {
      await navigator.clipboard.writeText(draft?.text ?? "");
      setCopied("yes");
    } catch {
      // The text stays selected, so Ctrl+C or the share menu works.
      setCopied("manual");
    }
  };

  const hasRise = item.flags.some((f) => f.type === "price_up");
  const chargedAgain = item.flags.some((f) => f.type === "still_charging");
  const otherKind = item.kind === "bill" ? "subscription" : "bill";
  type Choice = { label: string; run: () => void };

  // A bill is something you owe, such as a mortgage or a phone plan, so it is not offered a
  // cancellation here. It can be kept, moved to subscriptions if it is really one, or questioned
  // if its price went up.
  const cancelHelp: Choice[] =
    item.kind === "bill"
      ? []
      : [
          { label: "How to Cancel", run: () => void showGuide() },
          { label: DRAFT_LABEL.cancel, run: () => void showDraft("cancel") },
        ];
  const cancellable: Choice[] =
    item.kind === "bill"
      ? []
      : [
          { label: "Mark as Cancelling", run: () => setStep({ kind: "confirm", status: "cancelling" }) },
          { label: "Mark as Cancelled", run: () => setStep({ kind: "confirm", status: "cancelled" }) },
        ];
  const priceHelp: Choice[] = hasRise ? [{ label: DRAFT_LABEL.lower_bill, run: () => void showDraft("lower_bill") }] : [];

  const choices: Choice[] =
    item.status === "active"
      ? [
          { label: "Keep It", run: () => void save({ status: "keep" }) },
          ...priceHelp,
          ...cancelHelp,
          ...cancellable,
          { label: item.kind === "bill" ? "Move to Subscriptions" : "Move to Bills", run: () => void save({ kind: otherKind }) },
        ]
      : item.status === "keep"
        ? [{ label: "Stop Keeping It", run: () => void save({ status: "active" }) }, ...cancelHelp]
        : item.status === "cancelling"
          ? [
              ...cancelHelp,
              { label: "Mark as Cancelled", run: () => setStep({ kind: "confirm", status: "cancelled" }) },
              { label: "Back to Active", run: () => void save({ status: "active" }) },
            ]
          : [
              ...(chargedAgain ? [{ label: DRAFT_LABEL.dispute, run: () => void showDraft("dispute") }, { label: "How to Cancel", run: () => void showGuide() }] : []),
              { label: "Back to Active", run: () => void save({ status: "active" }) },
            ];

  const back = (
    <button type="button" onClick={() => goTo({ kind: "menu" })} className="rounded-full px-3 py-1.5 text-xs font-medium" style={buttonStyle}>
      Go Back
    </button>
  );

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
          {step.kind === "menu" && (
            <div className="flex flex-wrap gap-2">
              {choices.map((choice) => (
                <button key={choice.label} type="button" disabled={pending} onClick={choice.run} className="rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-60" style={buttonStyle}>
                  {choice.label}
                </button>
              ))}
            </div>
          )}

          {step.kind === "confirm" && (
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
                {back}
              </div>
            </div>
          )}

          {step.kind === "guide" && (
            <div className="space-y-3">
              {loading && <p className="text-xs" style={{ color: "var(--ink-muted)" }}>Loading the steps…</p>}
              {guide && (
                <>
                  <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{guide.title}</p>
                  <ol className="list-decimal space-y-1 pl-5 text-xs" style={{ color: "var(--ink-secondary)" }}>
                    {guide.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  {guide.url?.startsWith("https://") && (
                    <a href={guide.url} target="_blank" rel="noopener noreferrer" className="inline-block rounded-full px-3 py-1.5 text-xs font-medium" style={primaryStyle}>
                      Open the Cancellation Page
                    </a>
                  )}
                  <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                    These steps may be out of date, so check them on the provider&apos;s site.{" "}
                    {guide.source === "catalog" && (guide.lastChecked ? `Last checked ${shortDate(guide.lastChecked)}.` : "Nobody has checked them recently.")}
                  </p>
                  <p className="text-xs" style={{ color: "var(--ink-muted)" }}>FinVantage does not cancel anything. You do it, then mark it cancelled here.</p>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {guide && item.status !== "cancelled" && item.kind !== "bill" && (
                  <button type="button" onClick={() => setStep({ kind: "confirm", status: "cancelled" })} className="rounded-full px-3 py-1.5 text-xs font-medium" style={buttonStyle}>
                    Mark as Cancelled
                  </button>
                )}
                {back}
              </div>
            </div>
          )}

          {step.kind === "draft" && (
            <div className="space-y-3">
              <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{DRAFT_LABEL[step.action]}</p>
              {loading && <p className="text-xs" style={{ color: "var(--ink-muted)" }}>Writing your message…</p>}
              {draft && (
                <>
                  <textarea
                    ref={draftBox}
                    readOnly
                    rows={9}
                    value={draft.text}
                    aria-label="Drafted message"
                    className="w-full rounded-lg border p-2 text-xs"
                    style={{ borderColor: "var(--border)", background: "var(--surface-inset)", color: "var(--ink)" }}
                  />
                  <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                    {draft.source === "model"
                      ? "Written by an AI model from your charges. Every number in it was checked against your own data."
                      : "A standard message with your figures filled in."}{" "}
                    Read it before you send it. FinVantage does not send it for you: copy it and send it yourself.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void copy()} className="rounded-full px-3 py-1.5 text-xs font-medium" style={primaryStyle}>
                      Copy Message
                    </button>
                    {copied === "yes" && <span role="status" className="text-xs" style={{ color: "var(--gain)" }}>Copied.</span>}
                    {copied === "manual" && <span role="status" className="text-xs" style={{ color: "var(--ink-muted)" }}>Select the text and copy it.</span>}
                  </div>
                </>
              )}
              <div className="flex flex-wrap gap-2">{back}</div>
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
