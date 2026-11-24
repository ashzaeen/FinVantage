import { MAX_SEARCH_LENGTH, navigationSpeech, pageByKey, pageByName, pageHref, type AppPage } from "@finvantage/contracts";

/**
 * Instant navigation: a clear command like "open Spending" is handled in the browser, with no wait
 * for the Advisor. Only a whole utterance counts, and only for the app's own pages, so something
 * vaguer ("show me where my money goes") still goes to the Advisor, which can pick a page itself.
 */
export interface SpokenNavigation {
  href: string;
  page: AppPage;
  /** What is said back. */
  said: string;
}

// Longest first: a regex takes the first alternative that works, so "show" would beat "show me".
const VERB = "(?:go over to|navigate to|take me to|bring up|switch to|jump to|show me|pull up|go to|open|show)";
const NAMED = new RegExp(`^${VERB}(?: (?:the|my))? (.+)$`);
const SEARCH_AFTER = /^(?:show|find|search|look up|pull up)(?: me)?(?: (?:my|the|all|all my|all of my))? (.+?) transactions$/;
const SEARCH_FOR = /^(?:search|look)(?: (?:my|the))? transactions? for (.+)$/;
/** Words that describe transactions without naming one, so "show my recent transactions" is just the page. */
const NOT_A_SEARCH = new Set(["recent", "latest", "all", "old", "older", "new", "my", "the", "past", "last", "every"]);

const clean = (text: string) => text.toLowerCase().replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim();

function result(page: AppPage, search?: string): SpokenNavigation {
  return { href: pageHref(page, search), page, said: navigationSpeech(page, search) };
}

export function spokenNavigation(text: string): SpokenNavigation | null {
  const said = clean(text);
  if (!said) return null;
  const transactions = pageByKey("transactions")!;

  const searchFor = SEARCH_FOR.exec(said);
  if (searchFor) return searchTerm(searchFor[1]!, transactions);

  // "show my Starbucks transactions", but "show my transactions" is the page itself.
  const searchAfter = SEARCH_AFTER.exec(said);
  if (searchAfter) return NOT_A_SEARCH.has(searchAfter[1]!) ? result(transactions) : searchTerm(searchAfter[1]!, transactions);

  const named = NAMED.exec(said);
  const page = named ? pageByName(named[1]!) : undefined;
  return page ? result(page) : null;
}

function searchTerm(raw: string, page: AppPage): SpokenNavigation | null {
  const term = raw.replace(/^(?:my|the|all)\s+/, "").trim();
  if (!term || term.length > MAX_SEARCH_LENGTH || NOT_A_SEARCH.has(term)) return null;
  return result(page, term);
}
