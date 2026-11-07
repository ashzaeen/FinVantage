import { LIFE_EVENT_LABEL, formatUsd } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { LifeEventEntry } from "./LifeEventEntry";

export default async function LifeEventsPage() {
  const [events, goals] = await Promise.all([api.listLifeEvents(), api.listGoals()]);

  return (
    <>
      <PageHeader title="Life events" tier="P0" prd="8" />
      <div className="grid gap-4 lg:grid-cols-2">
        <LifeEventEntry goals={goals} />
        <Card title="Logged events">
          {events.length === 0 && <p className="text-sm text-muted">Nothing logged yet.</p>}
          <ul className="divide-y divide-line text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex justify-between py-2">
                <span>
                  {LIFE_EVENT_LABEL[event.type]}
                  <span className="block text-xs text-muted">{event.date}</span>
                </span>
                <span className="tabular-nums">{formatUsd(event.dollarImpactCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
