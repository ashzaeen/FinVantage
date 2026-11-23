"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { formatUsd, type CopilotContext, type CopilotEvent } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { buttonClass } from "@/components/ui/Button";

/**
 * A sample purchase, sent through the same route the extension uses, so the page can show what a
 * card looks like without the extension. Only the four fields the extension sends; the name says
 * it is an example.
 */
const EXAMPLE_PURCHASE: CopilotContext = {
  pageType: "checkout",
  itemType: "retail_purchase",
  priceCents: 32_900,
  merchant: "Northwind Store (Example)",
};

/** One card per event, newest first, even if the same event arrives twice. */
function unique(events: CopilotEvent[]): CopilotEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => !seen.has(e.id) && seen.add(e.id));
}

export function CopilotFeed({ initial }: { initial: CopilotEvent[] }) {
  const [events, setEvents] = useState(() => unique(initial));
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A push is a signal to refetch, never data to show (see useLiveEvents). The live channel can
  // replay old pushes when it connects, including for events already deleted, so the list always
  // comes from the API. Bursts of pushes collapse into one refetch.
  useLiveEvents((message) => {
    if (message.type !== "copilot.event") return;
    clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      void api
        .listCopilotEvents()
        .then((fresh) => setEvents(unique(fresh)))
        .catch(() => {});
    }, 400);
  });

  async function tryExample() {
    setBusy("example");
    setError(null);
    try {
      await api.evaluateCopilot({ body: EXAMPLE_PURCHASE });
      setEvents(unique(await api.listCopilotEvents()));
    } catch {
      setError("Couldn't run the example. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api.deleteCopilotEvent({ params: { id } });
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError("Couldn't delete that one. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function clearAll() {
    setBusy("all");
    setError(null);
    try {
      await api.clearCopilotEvents();
      setEvents([]);
      setConfirmingClear(false);
    } catch {
      setError("Couldn't clear the activity. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (events.length === 0) {
    return (
      <Card>
        <div className="py-10 text-center">
          <span className="text-3xl mb-2 block">⚡️</span>
          <p className="font-poppins font-bold text-base text-ink">No Copilot events yet</p>
          <p className="font-roboto text-xs text-muted mt-1">
            Open any online store or demo listing page with the Chrome extension active to see real-time guidance.
          </p>
          <p className="font-roboto text-xs text-muted mt-3">Or see what a card looks like first: we will check a sample $329 purchase against your goals.</p>
          <button
            type="button"
            onClick={tryExample}
            disabled={busy === "example"}
            className={buttonClass({}, "mt-4")}
          >
            {busy === "example" ? "Checking…" : "Try It Now"}
          </button>
          {error && (
            <p role="alert" className="mt-3 font-roboto text-sm text-loss">
              {error}
            </p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={tryExample}
          disabled={busy === "example"}
          className="min-h-11 rounded-full border border-line bg-raised px-3 py-1.5 font-roboto text-sm text-ink-secondary hover:border-accent-ink hover:text-accent-ink disabled:opacity-60 lg:min-h-0"
        >
          {busy === "example" ? "Checking…" : "Try an Example"}
        </button>
        {confirmingClear ? (
          <div className="flex items-center gap-2 font-roboto text-sm" role="group" aria-label="Confirm clearing all">
            <span className="text-ink">Delete all {events.length}?</span>
            <button
              type="button"
              onClick={clearAll}
              disabled={busy === "all"}
              className="rounded-full bg-loss px-3 py-1.5 font-semibold text-white disabled:opacity-60"
            >
              {busy === "all" ? "Deleting…" : "Delete all"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              className="rounded-full border border-line bg-raised px-3 py-1.5 text-ink-secondary"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            className="rounded-full border border-line bg-raised px-3 py-1.5 font-roboto text-sm text-ink-secondary hover:border-loss hover:text-loss"
          >
            Clear all
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="font-roboto text-sm text-loss">
          {error}
        </p>
      )}
      {events.map((event) => (
        <Card
          key={event.id}
          title={`${event.merchant} · ${formatUsd(event.extractedPriceCents)}`}
          action={
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent-soft px-3 py-1 font-roboto text-xs font-semibold text-accent-ink">
                Copilot Intervention
              </span>
              <button
                type="button"
                onClick={() => remove(event.id)}
                disabled={busy === event.id}
                aria-label={`Delete the ${event.merchant} ${formatUsd(event.extractedPriceCents)} intervention`}
                title="Delete"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-critical-bg hover:text-loss disabled:opacity-50"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          }
        >
          <div className="rounded-2xl bg-inset p-4 border border-line">
            <p className="font-roboto text-sm font-medium text-ink">{event.card.impact}</p>
            <p className="font-roboto text-xs text-accent-ink font-semibold mt-2">{event.card.smartMove}</p>
          </div>
          <Link
            href={`/advisor?copilotEvent=${encodeURIComponent(event.id)}`}
            className="mt-3 inline-flex items-center gap-1.5 font-roboto text-xs font-semibold text-accent-ink hover:underline"
          >
            <Sparkles size={13} aria-hidden /> Ask the Advisor About This
          </Link>
        </Card>
      ))}
    </div>
  );
}
