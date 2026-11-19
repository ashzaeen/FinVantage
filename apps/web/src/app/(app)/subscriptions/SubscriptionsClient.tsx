"use client";

import { useState } from "react";
import { formatUsd, type Subscription, type SubscriptionTotals } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { needsLook, SORT_LABEL, sortSubscriptions, type SubscriptionSort } from "@/lib/subscriptions";
import { SubscriptionRow } from "./SubscriptionRow";

type Filter = "all" | "look" | "cancelling";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "look", label: "Needs a Look" },
  { id: "cancelling", label: "Cancelling" },
];

const EMPTY: Record<Filter, { subscriptions: string; bills: string }> = {
  all: { subscriptions: "No subscriptions found.", bills: "No bills found." },
  look: { subscriptions: "None of your subscriptions needs a look right now.", bills: "None of your bills needs a look right now." },
  cancelling: { subscriptions: "You are not cancelling any subscriptions.", bills: "You are not cancelling any bills." },
};

function apply(items: Subscription[], filter: Filter) {
  if (filter === "look") return needsLook(items);
  if (filter === "cancelling") return items.filter((i) => i.status === "cancelling");
  return items;
}

function List({ items, labels, empty }: { items: Subscription[]; labels: Record<string, string>; empty: string }) {
  if (items.length === 0) return <p className="text-sm" style={{ color: "var(--ink-muted)" }}>{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <SubscriptionRow key={item.id} item={item} categoryLabel={item.category ? (labels[item.category] ?? item.category) : "Uncategorized"} index={i} />
      ))}
    </ul>
  );
}

/** The two lists, with a filter and a sort. Both only reorder or hide what the API sent. */
export function SubscriptionsClient({
  subscriptions,
  bills,
  cancelled,
  billTotals,
  savedSoFarCents,
  labels,
}: {
  subscriptions: Subscription[];
  bills: Subscription[];
  cancelled: Subscription[];
  billTotals: SubscriptionTotals;
  savedSoFarCents: number;
  labels: Record<string, string>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SubscriptionSort>("cost");

  const shown = sortSubscriptions(apply(subscriptions, filter), sort);
  const shownBills = sortSubscriptions(apply(bills, filter), sort);

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <Card
        title="All Subscriptions"
        subtitle="Things you chose to pay for, which you can cancel"
        lift={false}
        action={
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SubscriptionSort)}
              className="rounded-lg border px-2 py-1 text-xs font-medium"
              style={{ borderColor: "var(--border)", background: "var(--surface-raised)", color: "var(--ink)" }}
            >
              {(Object.keys(SORT_LABEL) as SubscriptionSort[]).map((id) => (
                <option key={id} value={id}>{SORT_LABEL[id]}</option>
              ))}
            </select>
          </label>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
              style={filter === f.id ? { background: "var(--accent)", color: "#fff" } : { background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <List items={shown} labels={labels} empty={EMPTY[filter].subscriptions} />
      </Card>

      <Card
        title="Bills"
        subtitle={`Repeating payments you owe · ${formatUsd(billTotals.monthlyCents)} a month`}
        lift={false}
      >
        <List items={shownBills} labels={labels} empty={EMPTY[filter].bills} />
      </Card>

      {cancelled.length > 0 && (
        <Card
          title="Cancelled"
          subtitle={`What you cancelled · ${formatUsd(savedSoFarCents)} saved so far`}
          lift={false}
          className="md:col-span-2"
        >
          <List items={sortSubscriptions(cancelled, "name")} labels={labels} empty="Nothing cancelled." />
        </Card>
      )}
    </div>
  );
}
