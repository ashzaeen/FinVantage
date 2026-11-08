import type { CopilotAction, CopilotContext } from "@finvantage/contracts";
import type { EvaluateReply, ExtensionMessage } from "../messages";
import { extractContext } from "./detect";
import { isCardOpen, removeOverlay, showCard, showNoDataPrompt } from "./overlay";

/** Wait for the page to settle before re-evaluating, so typing an amount sends one request. */
const RECHECK_DELAY_MS = 600;

// Dismiss and snooze are per site. The demo pages all share localhost, so there each page
// (and each product, which differ only by ?id=) counts as its own site; otherwise closing one
// demo card would silence the others.
const site =
  location.hostname === "localhost"
    ? `${location.host}${location.pathname}${location.search}`
    : location.hostname;

let lastKey: string | null = null;
let latestRequest = 0;

async function evaluate(context: CopilotContext) {
  const requestId = ++latestRequest;
  const keepOpen = isCardOpen();
  const request: ExtensionMessage = { type: "evaluate", context, site };
  const reply = (await chrome.runtime.sendMessage(request)) as EvaluateReply;
  // A newer price arrived while this one was in flight: its card would be stale.
  if (requestId !== latestRequest) return;
  if (reply.kind === "silent") {
    removeOverlay();
    return;
  }

  if (reply.result.status === "no_data") {
    showNoDataPrompt(reply.webUrl);
    return;
  }

  const { eventId, card, metrics, simulationPath } = reply.result;
  const send = (action: CopilotAction) => {
    const message: ExtensionMessage = { type: "action", eventId, action, site };
    void chrome.runtime.sendMessage(message);
  };
  showCard(
    card,
    metrics,
    `${reply.webUrl}${simulationPath}`,
    {
      onDismiss: () => send("dismissed"),
      onSnooze: () => send("snoozed"),
      onOpen: () => send("opened"),
    },
    { open: keepOpen },
  );
}

/** Reads the page's price and asks again only when it changed. */
function check() {
  const context = extractContext(document, location);
  const key = context ? JSON.stringify(context) : null;
  if (key === lastKey) return;
  lastKey = key;
  if (!context) {
    // The price went away or became unclear: show nothing rather than a stale card.
    latestRequest++;
    removeOverlay();
    return;
  }
  void evaluate(context);
}

check();

// Follow the page as the user changes it, such as picking a different payment amount. Only the
// rule's price element is read; the observer just says when to look again.
let timer: ReturnType<typeof setTimeout> | undefined;
new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(check, RECHECK_DELAY_MS);
}).observe(document.body, { subtree: true, childList: true, characterData: true });
