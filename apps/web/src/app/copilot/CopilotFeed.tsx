"use client";

import { useState } from "react";
import { formatUsd, type CopilotEvent } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { useLiveEvents } from "@/lib/useLiveEvents";

export function CopilotFeed({ initial }: { initial: CopilotEvent[] }) {
  const [events, setEvents] = useState(initial);

  useLiveEvents((message) => {
    if (message.type === "copilot.event") setEvents((prev) => [message.event, ...prev]);
  });

  if (events.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">No Copilot events yet. Open a demo page with the extension on.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <Card key={event.id} title={`${event.merchant} · ${formatUsd(event.extractedPriceCents)}`}>
          <p className="text-sm">{event.card.impact}</p>
          <p className="mt-1 text-sm text-muted">{event.card.smartMove}</p>
        </Card>
      ))}
    </div>
  );
}
