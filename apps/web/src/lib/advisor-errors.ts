import { ApiError } from "@finvantage/contracts";

/** What went wrong sending a message, in words the visitor can act on. */
export function sendErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "You're sending messages quickly. Wait a minute, then try again.";
    if (err.status === 401 || err.code === "demo_read_only") return "Your session ended. Reload the page to start a new one, then send your message again.";
    if (err.status === 400 || err.status === 413) return "That message couldn't be sent. Try shortening or rewording it.";
  }
  return "I couldn't reach the Advisor. Please try sending your message again.";
}
