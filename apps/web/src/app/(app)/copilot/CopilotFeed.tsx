"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { formatUsd, type CopilotEvent } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { useLiveEvents } from "@/lib/useLiveEvents";

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
          <p className="font-poppins font-bold text-base text-[#16192c]">No Copilot events yet</p>
          <p className="font-roboto text-xs text-[#8d94a8] mt-1">
            Open any online store or demo listing page with the Chrome extension active to see real-time guidance.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-roboto text-sm text-[#4b5268]">
          {events.length} {events.length === 1 ? "intervention" : "interventions"}
        </p>
        {confirmingClear ? (
          <div className="flex items-center gap-2 font-roboto text-sm" role="group" aria-label="Confirm clearing all">
            <span className="text-[#16192c]">Delete all {events.length}?</span>
            <button
              type="button"
              onClick={clearAll}
              disabled={busy === "all"}
              className="rounded-full bg-[#d14343] px-3 py-1.5 font-semibold text-white disabled:opacity-60"
            >
              {busy === "all" ? "Deleting…" : "Delete all"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              className="rounded-full border border-[#edf0f7] bg-white px-3 py-1.5 text-[#4b5268]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            className="rounded-full border border-[#edf0f7] bg-white px-3 py-1.5 font-roboto text-sm text-[#4b5268] hover:border-[#d14343] hover:text-[#d14343]"
          >
            Clear all
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="font-roboto text-sm text-[#d14343]">
          {error}
        </p>
      )}
      {events.map((event) => (
        <Card
          key={event.id}
          title={`${event.merchant} · ${formatUsd(event.extractedPriceCents)}`}
          action={
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#eef1fc] px-3 py-1 font-roboto text-[11px] font-semibold text-[#544af7]">
                Copilot Intervention
              </span>
              <button
                type="button"
                onClick={() => remove(event.id)}
                disabled={busy === event.id}
                aria-label={`Delete the ${event.merchant} ${formatUsd(event.extractedPriceCents)} intervention`}
                title="Delete"
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-[#8d94a8] hover:bg-[#fdecec] hover:text-[#d14343] disabled:opacity-50"
              >
                ×
              </button>
            </div>
          }
        >
          <div className="rounded-2xl bg-[#f8f9fd] p-4 border border-[#edf0f7]">
            <p className="font-roboto text-sm font-medium text-[#16192c]">{event.card.impact}</p>
            <p className="font-roboto text-xs text-[#544af7] font-semibold mt-2">{event.card.smartMove}</p>
          </div>
          <Link
            href={`/advisor?copilotEvent=${encodeURIComponent(event.id)}`}
            className="mt-3 inline-flex items-center gap-1.5 font-roboto text-xs font-semibold text-accent hover:underline"
          >
            <Sparkles size={13} aria-hidden /> Ask the Advisor About This
          </Link>
        </Card>
      ))}
    </div>
  );
}
