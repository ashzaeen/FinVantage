import type { CopilotAction } from "@finvantage/contracts";
import type { EvaluateReply, ExtensionMessage } from "../messages";
import { extractContext } from "./detect";
import { showCard, showNoDataPrompt } from "./overlay";

async function main() {
  const context = extractContext(document, location);
  if (!context) return;

  const site = location.hostname;
  const request: ExtensionMessage = { type: "evaluate", context, site };
  const reply = (await chrome.runtime.sendMessage(request)) as EvaluateReply;
  if (reply.kind === "silent") return;

  if (reply.result.status === "no_data") {
    showNoDataPrompt(reply.webUrl);
    return;
  }

  const { eventId, card, simulationPath } = reply.result;
  const send = (action: CopilotAction) => {
    const message: ExtensionMessage = { type: "action", eventId, action, site };
    void chrome.runtime.sendMessage(message);
  };
  showCard(card, `${reply.webUrl}${simulationPath}`, {
    onDismiss: () => send("dismissed"),
    onSnooze: () => send("snoozed"),
    onOpen: () => send("opened"),
  });
}

void main();
