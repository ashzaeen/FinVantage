import { z } from "zod";
import { formatUsd } from "@finvantage/contracts";
import type { AdvisorTool } from "@finvantage/llm";
import { draftResult, findByName, type ChangeToolContext } from "./changes";
import { tool } from "./tool-kit";

/**
 * Proposals the user can only confirm with a tap, because they cannot be taken back or they leave
 * the app: emailing a report, deleting a chat, clearing Copilot history, deleting a life event.
 * Like every proposal here, none of them saves anything.
 */
export function tapOnlyTools({ api, deps, userId, conversationId }: ChangeToolContext): AdvisorTool[] {
  return [
    tool(
      "propose_email_report",
      "Propose emailing the user their quarterly report. It goes only to the address on their account, so it cannot be sent anywhere else. NOT sent: the user must tap Send Email, and it cannot be taken back. The latest report unless they name a quarter such as 2026-Q3.",
      z.object({ quarter: z.string().regex(/^\d{4}-Q[1-4]$/).optional().describe("Such as 2026-Q3. The latest if the user did not say.") }),
      async (a) => {
        const reports = [...(await api.listReports())].sort((x, y) => y.quarter.localeCompare(x.quarter));
        const report = a.quarter ? reports.find((r) => r.quarter === a.quarter) : reports[0];
        if (!report) throw new Error(a.quarter ? `There is no report for ${a.quarter}.` : "There is no report yet. One is built the first time the Reports page is opened.");
        return draftResult({
          title: "Email Report",
          lines: [{ label: "Report", value: `${report.quarter} Quarterly Report` }, { label: "Sent To", value: "The address on your account" }],
          readBack: `Email the ${report.quarter} quarterly report to the address on your account. Once sent, it can't be taken back.`,
          destructive: true,
          confirmLabel: "Send Email",
          undoable: false,
          request: { action: "email_report", id: report.id, quarter: report.quarter },
        });
      },
    ),

    tool(
      "propose_delete_conversation",
      "Propose deleting a chat with the Advisor: this one unless the user names another by its title. NOT deleted: the user must tap Confirm Removal, and it cannot be taken back.",
      z.object({ title: z.string().optional().describe("Part of the chat's title. Leave out for the current chat.") }),
      async (a) => {
        const chats = await deps.docs.listAdvisorConversations(userId);
        const chat = a.title ? findByName(chats, (c) => c.title, a.title, "chat") : chats.find((c) => c.id === conversationId);
        if (!chat) throw new Error(a.title ? "No chat matches that." : "This chat hasn't been saved yet, so there is nothing to delete.");
        return draftResult({
          title: "Delete Chat",
          lines: [{ label: "Chat", value: chat.title }],
          readBack: `Delete the chat called ${chat.title}, with everything in it. This can't be taken back.`,
          destructive: true,
          undoable: false,
          request: { action: "delete_conversation", id: chat.id },
        });
      },
    ),

    tool(
      "propose_clear_copilot_history",
      "Propose clearing every saved Copilot check. NOT cleared: the user must tap Confirm Removal, and it cannot be taken back.",
      z.object({}),
      async () => {
        const events = await api.listCopilotEvents();
        if (events.length === 0) throw new Error("There are no saved Copilot checks to clear.");
        const word = events.length === 1 ? "check" : "checks";
        return draftResult({
          title: "Clear Copilot History",
          lines: [{ label: "Saved Checks", value: `${events.length}` }],
          readBack: `Clear all ${events.length} saved Copilot ${word}. This can't be taken back.`,
          destructive: true,
          undoable: false,
          request: { action: "clear_copilot_events", count: events.length },
        });
      },
    ),

    tool(
      "propose_delete_life_event",
      "Propose deleting one of the user's life events, such as a planned move or a new baby. Goal odds are worked out again without it. NOT deleted: the user must tap Confirm Removal, and it cannot be taken back.",
      z.object({ event: z.string().min(1).describe("Part of the event's type, such as baby or move.") }),
      async (a) => {
        const events = await api.listLifeEvents();
        const kind = (e: (typeof events)[number]) => e.type.replace(/_/g, " ");
        const event = findByName(events, kind, a.event, "life event");
        const impact = `${formatUsd(Math.abs(event.dollarImpactCents))}${event.recurrence === "recurring" ? " a month" : ""}`;
        return draftResult({
          title: "Delete Life Event",
          lines: [{ label: "Event", value: kind(event) }, { label: "Date", value: event.date }, { label: event.dollarImpactCents < 0 ? "Cost" : "Adds", value: impact }],
          readBack: `Delete the ${kind(event)} life event on ${event.date}, ${event.dollarImpactCents < 0 ? "costing" : "adding"} ${impact}. Your goal odds are worked out again without it. This can't be taken back.`,
          destructive: true,
          undoable: false,
          request: { action: "delete_life_event", id: event.id },
        });
      },
    ),
  ];
}
