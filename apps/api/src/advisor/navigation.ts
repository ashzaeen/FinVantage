import { z } from "zod";
import { APP_PAGE_KEYS, MAX_SEARCH_LENGTH, navigationSpeech, pageByKey, pageHref } from "@finvantage/contracts";
import type { AdvisorTool } from "@finvantage/llm";
import { tool } from "./tool-kit";

/**
 * Opens a page of the app. The page comes from a fixed list, so the Advisor can send the user
 * only to somewhere the app really has. It changes nothing: on a call the page just opens.
 */
export function navigationTools(): AdvisorTool[] {
  return [
    tool(
      "open_page",
      "Open a page of the app for the user, such as 'open Subscriptions' or 'show my goals'. For Transactions you can add a search, such as 'show my Starbucks transactions'. Use this instead of describing the page. It only opens the page and changes nothing.",
      z.object({
        page: z.enum(APP_PAGE_KEYS).describe("Which page."),
        search: z.string().max(MAX_SEARCH_LENGTH).optional().describe("Only for transactions: the merchant or words to search for."),
      }),
      async (a) => {
        const page = pageByKey(a.page)!;
        const search = page.key === "transactions" ? a.search?.trim() || undefined : undefined;
        return {
          data: { opening: page.label, ...(search ? { searchingFor: search } : {}) },
          citation: "Navigation",
          summary: [navigationSpeech(page, search)],
          attachment: { kind: "navigate", href: pageHref(page, search), label: page.label },
        };
      },
    ),
  ];
}
