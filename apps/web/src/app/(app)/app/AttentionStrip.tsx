"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, CircleAlert, Info } from "lucide-react";
import type { AttentionFeed } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { buttonClass } from "@/components/ui/Button";

const storageKey = (asOf: string) => `fv-attention-dismissed:${asOf}`;

/**
 * The first thing on the Overview: the few things worth a look today, most urgent first. The API
 * ranks them and writes each sentence from the figures, so this only lays them out. Severity is a
 * mark and a word, never colour alone. Dismiss hides an item for the rest of the day, in this
 * browser only. `next` is the next dated thing, shown when nothing needs a look.
 */
export function AttentionStrip({ feed, next }: { feed: AttentionFeed; next?: string | null }) {
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(feed.asOf));
      if (raw) setDismissed(JSON.parse(raw) as string[]);
    } catch {
      /* private mode or blocked storage: nothing is hidden */
    }
  }, [feed.asOf]);

  function dismiss(id: string) {
    const nextList = [...dismissed, id];
    setDismissed(nextList);
    try {
      window.localStorage.setItem(storageKey(feed.asOf), JSON.stringify(nextList));
    } catch {
      /* the item still hides for this visit */
    }
  }

  const items = feed.items.filter((item) => !dismissed.includes(item.id));
  const hidden = feed.items.length - items.length;

  return (
    <Card title="Needs Attention Today" subtitle="Across your accounts, budgets and subscriptions" lift={false} action={items.length > 0 ? <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink">{items.length} {items.length === 1 ? "item" : "items"}</span> : undefined}>
      {items.length === 0 ? (
        <div className="text-sm text-muted">
          <p>{hidden > 0 ? "Nothing else needs you today." : "Nothing needs you today. Bills, budgets and subscriptions are all in order."}</p>
          {next && <p className="mt-1">Next: <span className="font-medium text-ink">{next}</span></p>}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2">
              <Link href={item.href} className="flex min-h-11 min-w-0 flex-1 items-start gap-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink">
                <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.severity === "action" ? "bg-warning-bg text-warning-text" : "bg-info-bg text-info-text"}`}>
                  {item.severity === "action" ? <CircleAlert size={12} aria-hidden="true" /> : <Info size={12} aria-hidden="true" />}
                  {item.severity === "action" ? "Do Soon" : "Heads Up"}
                </span>
                <span className="min-w-0 flex-1 text-ink">{item.message}</span>
                <ChevronRight size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-ink" />
              </Link>
              <button type="button" onClick={() => dismiss(item.id)} aria-label={`Dismiss for today: ${item.message}`} className={buttonClass({ variant: "quiet", size: "sm" }, "shrink-0")}>
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && items.length > 0 && <p className="mt-2 text-xs text-muted">{hidden} hidden for today.</p>}
    </Card>
  );
}
