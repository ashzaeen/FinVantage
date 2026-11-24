/**
 * Where the Advisor may send the user. A reply can only point at one of these, so a model that is
 * confused, or fed bad text, can never open anything else. The web app's sidebar has the same
 * pages (a test keeps them equal).
 */
export const APP_PAGES = [
  { key: "overview", label: "Overview", href: "/app", aliases: ["overview", "home", "home page", "dashboard", "main page"] },
  { key: "advisor", label: "Advisor", href: "/advisor", aliases: ["advisor", "the advisor", "chat", "my chats", "conversations"] },
  { key: "copilot", label: "Copilot", href: "/copilot", aliases: ["copilot", "co pilot"] },
  { key: "life_events", label: "Life Events", href: "/life-events", aliases: ["life events", "life event", "life planner"] },
  { key: "subscriptions", label: "Subscriptions", href: "/subscriptions", aliases: ["subscriptions", "subscription", "recurring charges"] },
  { key: "reports", label: "Reports", href: "/reports", aliases: ["reports", "report", "quarterly report", "my report"] },
  { key: "accounts", label: "Accounts", href: "/accounts", aliases: ["accounts", "account", "my accounts", "net worth"] },
  { key: "transactions", label: "Transactions", href: "/transactions", aliases: ["transactions", "transaction", "my transactions", "activity"] },
  { key: "income", label: "Income", href: "/income", aliases: ["income", "my income", "earnings"] },
  { key: "spending", label: "Spending", href: "/spending", aliases: ["spending", "my spending", "expenses", "budgets", "budget"] },
  { key: "goals", label: "Goals", href: "/goals", aliases: ["goals", "goal", "my goals", "savings goals"] },
  { key: "credit", label: "Credit", href: "/credit", aliases: ["credit", "credit score", "credit cards", "my credit"] },
  { key: "investments", label: "Investments", href: "/portfolio", aliases: ["investments", "investment", "portfolio", "my investments"] },
  { key: "settings", label: "Settings", href: "/settings", aliases: ["settings", "preferences", "my settings"] },
] as const;

export type AppPage = (typeof APP_PAGES)[number];
export type AppPageKey = AppPage["key"];
export const APP_PAGE_KEYS = APP_PAGES.map((p) => p.key) as [AppPageKey, ...AppPageKey[]];

/** The longest search a link may carry. */
export const MAX_SEARCH_LENGTH = 60;

export function pageByKey(key: string): AppPage | undefined {
  return APP_PAGES.find((p) => p.key === key);
}

/** The page a spoken or typed name means, by exact name, ignoring case and a leading "the" or "my". */
export function pageByName(text: string): AppPage | undefined {
  const said = text.toLowerCase().replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim().replace(/ (?:page|tab|screen)$/, "");
  return APP_PAGES.find((p) => (p.aliases as readonly string[]).includes(said) || (p.aliases as readonly string[]).includes(said.replace(/^(?:the|my) /, "")));
}

/** A link to a page. Only Transactions takes a search, which fills its search box. */
export function pageHref(page: AppPage, search?: string): string {
  const term = search?.replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH);
  return page.key === "transactions" && term ? `${page.href}?search=${encodeURIComponent(term)}` : page.href;
}

/** Whether a link is one of the app's pages, with no query except a Transactions search. */
export function isAppHref(href: string): boolean {
  const [path, query, ...rest] = href.split("?");
  const page = APP_PAGES.find((p) => p.href === path);
  if (!page || rest.length > 0) return false;
  if (query === undefined) return true;
  const params = new URLSearchParams(query);
  return page.key === "transactions" && [...params.keys()].join() === "search" && (params.get("search") ?? "").length <= MAX_SEARCH_LENGTH;
}

/** What is said when the page opens. */
export function navigationSpeech(page: AppPage, search?: string): string {
  const term = search?.trim();
  return page.key === "transactions" && term ? `Searching your transactions for ${term}.` : `Opening ${page.label}.`;
}

/** What is said for a link an Advisor reply carries, or null if it is not one of the pages. */
export function speechForHref(href: string): string | null {
  if (!isAppHref(href)) return null;
  const [path, query] = href.split("?");
  const page = APP_PAGES.find((p) => p.href === path)!;
  return navigationSpeech(page, query ? new URLSearchParams(query).get("search") ?? undefined : undefined);
}
