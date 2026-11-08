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
      {events.map((event) => (
        <Card
          key={event.id}
          title={`${event.merchant} · ${formatUsd(event.extractedPriceCents)}`}
          action={
            <span className="rounded-full bg-[#eef1fc] px-3 py-1 font-roboto text-[11px] font-semibold text-[#544af7]">
              Copilot Intervention
            </span>
          }
        >
          <div className="rounded-2xl bg-[#f8f9fd] p-4 border border-[#edf0f7]">
            <p className="font-roboto text-sm font-medium text-[#16192c]">{event.card.impact}</p>
            <p className="font-roboto text-xs text-[#544af7] font-semibold mt-2">{event.card.smartMove}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
