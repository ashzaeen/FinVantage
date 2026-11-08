import { LIFE_EVENT_LABEL, formatUsd } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { LifeEventEntry } from "./LifeEventEntry";

const EVENT_ICONS: Record<string, string> = {
  job_change: "💼", new_baby: "👶", marriage: "💍", home_purchase: "🏠",
  retirement: "🌴", education: "🎓", divorce: "📋", medical: "🏥",
};

export default async function LifeEventsPage() {
  const [events, goals] = await Promise.all([api.listLifeEvents(), api.listGoals()]);

  return (
    <>
      <PageHeader title="Life Events" />
      <div className="grid gap-5 lg:grid-cols-2">
        <LifeEventEntry goals={goals} />

        <Card
          title="Logged Events"
          subtitle="Events affecting your financial plan"
        >
          {events.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="text-4xl">📅</span>
              <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                No life events logged yet. Add your first one.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-3"
                  style={{ background: "var(--surface-inset)" }}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                    style={{ background: "var(--accent-soft, #eceeff)" }}>
                    {EVENT_ICONS[event.type] ?? "✦"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                      {LIFE_EVENT_LABEL[event.type]}
                    </p>
                    <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{event.date}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color: "var(--critical)" }}>
                    −{formatUsd(Math.abs(event.dollarImpactCents))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
