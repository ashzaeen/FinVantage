# Decisions

Append here when you make a call others need to know about. Do not rewrite history: add a new entry that replaces the old one.

## Stack

| Decision | Why |
| --- | --- |
| TypeScript for the whole backend, including the simulator | Answers the PRD's open question. One set of types shared with both clients |
| One npm-workspaces monorepo | Contracts change in one place during a 24-hour build |
| Hono for the API | Small, with built-in SSE and CORS support |
| Packages export TypeScript source | No build step between packages |
| Zod for contracts | One definition gives types and runtime validation |
| esbuild for the extension | Each bundle is one script, which Manifest V3 content scripts need |

## Where the PRD conflicted

| Issue | Resolution |
| --- | --- |
| Savings goals are P1 in section 3, but the P0 simulator needs them and section 12.3 lists goals as P0 | Goals are P0 |
| The life-event form is P0 in sections 8 and 12.3, but missing from the section 3 table | The form is P0 |
| "Six account types" against seven stored values | Store seven (`AccountType`), and group into six for display (`AccountCategory`). Auto and personal are one type, split by `loanKind` |
| "Seven entities" counts Copilot Event and Recommendation as one row | They are separate contracts, since they have different shapes and lifecycles |
| The PRD does not place every entity in a database | Tiger Data: User, income profile, Account, Transaction, Goal. Atlas: Life Event, Simulation Run, Copilot Event, Recommendation, Quarterly Report |
| Auth is a P0 chunk, but nothing says how the extension identifies a user | Stub: one shared demo token maps to the demo user. Handlers only read `userId`, so real auth can replace it in one middleware |
| "Every run stores its inputs" against sliders that must feel instant | `persist: false` for slider previews. Saved runs store everything |
| The 8090.AI Legacy Data Adapter is a stretch entry | Not in the skeleton, by team lead decision |

## Conventions

| Decision | Why |
| --- | --- |
| Money is integer cents | Avoids float errors in a product where every figure must match exactly |
| Account balances are always positive | One rule for sums. `isLiability` gives direction |
| `LlmClient` mock always throws | Fallback paths run by default, so the app needs no key |
| Only the service worker calls the API | Host permissions apply there, and the content script stays simple |
| Ledger and document backends can be selected independently | Quarterly reports can use MongoDB Atlas while the unfinished Tiger adapter remains in memory |
| Quarterly-report PDFs live on the API server | MongoDB stores the report and artifact metadata; authenticated API routes serve the local PDF |
| Quarterly reports use the configured Gemini Flash model | One model setting is simpler for the demo; deterministic evidence and output validation remain unchanged |
| Goal pathway labels use probability-range thresholds | Low bound at least 60% is on track; otherwise a high bound at least 40% is watch; lower ranges need attention. Labels are estimates, never guarantees |
| Invalid MongoDB configuration falls back to memory only in development | A malformed local secret should not take down the whole demo; production still fails closed so persistence is never silently lost |
| Gemini calls time out after 15 seconds | Report and Copilot requests must reach their deterministic fallback instead of hanging when the provider is unavailable |
| Advisor chat retrieves only the current user's stored financial context on the server | Context stays behind the API boundary; the browser sends only conversation messages, and Gemini credentials remain server-side |
| Spending summaries, category totals, and recurring charge lists are derived from ledger transactions | Dashboard aggregates should share transaction data as their source of truth; budget limits remain explicit demo defaults until users can configure budgets |
| A quarterly report may establish a one-quarter baseline | New users should receive a useful report immediately; comparisons and largest-change analysis appear only when a prior-quarter run exists |
| Report PDFs embed Poppins and categorize goal suggestions | The artifact matches the dashboard identity while keeping maintain, review, and explore prompts visibly distinct |
| An external cron invokes the persistent API for scheduled report email | The planned Vultr API already owns Gmail credentials. MongoDB leases due schedules atomically, which survives restarts and prevents two API instances from claiming the same occurrence |
| Quarterly UI charts use report-owned monthly transaction aggregates | Recharts renders responsive bars and trends, while every displayed cent remains computed by the API from ledger transactions rather than by the browser or Gemini |

## Platform, decided 2026-11-07

These replace the Tiger Data and Vultr lines above, and the "Spacetime: enter or skip?" open question.

| Decision | Why |
| --- | --- |
| SpacetimeDB on Maincloud holds the relational data: users, income profiles, accounts, transactions, goals | Platform owner's call, after talking to the Spacetime team. Replaces Tiger Data, so the Tiger Data track is dropped |
| SpacetimeDB also handles live updates. The dashboard subscribes with the Spacetime TypeScript SDK | The Spacetime team recommended building around live subscriptions. It also fixes live updates on serverless, where the in-process SSE bus cannot reach other instances |
| MongoDB Atlas holds every document record, as the PRD says. The quarterly-agent owner writes the store | Unchanged from the PRD. Platform only adds the connection |
| The web app and the API both run on Vercel. The API is bundled into one function with esbuild | One platform, deploy on push, a preview per PR. Spacetime cannot run a server-rendered Next.js site. Replaces Vultr, so the Vultr track is dropped |
| The API reaches Spacetime over its HTTP API (SQL and reducer calls), not the WebSocket SDK | Serverless functions cannot hold a connection between requests. The browser holds the SDK connection instead |
| Spacetime subscriptions only tell the dashboard to refetch through `api`. Figures always come from the API | Keeps math first and contract validation for every number |
| `WEB_ORIGIN` is a comma-separated list, and `*` matches one subdomain label | Lets production and Vercel preview URLs call the API |
| Deploys run from GitHub Actions with the Vercel CLI, into the platform owner's Vercel account. The only repo secret is `VERCEL_TOKEN` | The repo owner is a different person, and only they can install the Vercel GitHub app or add secrets. One secret is the smallest ask |
| The Spacetime module is published from the platform owner's laptop, not CI | The schema changes rarely, and it needs no extra repo secret |
| CI is manual-only for now | It failed on Linux in the build step, the logs weren't visible without signing in, and deploys don't depend on it |
| Sign-in is our own email + password, not SpacetimeAuth. The API issues RS256 tokens and publishes its key at `/.well-known/jwks.json`. Accounts live in a private Spacetime `credential` table, with scrypt hashes | SpacetimeAuth only offers magic link, anonymous, and social logins, and the team wanted email + password. Our tokens are OpenID-shaped, so SpacetimeDB can still accept them as identities for live subscriptions |

## Open questions

| Question | Who decides | Notes |
| --- | --- | --- |
| How is a goal's probability range derived? | Simulator | Monte Carlo gives one estimate. Decide what the range means |
| How does the vehicle scenario get its loan term? | Copilot backend and extension | `CopilotContext` has price only, and the PRD limits the payload to price, item type, and merchant. Either assume 60 months or agree a change to the privacy rule |
| Does a rental replace current housing or add to it? | Copilot backend | The demo profile has a mortgage and also goes apartment hunting. Decide what the scenario means, then adjust the fixture |
| Should extension settings sync with the API? | Extension and platform | `User.extensionSettings` exists, but the extension uses `chrome.storage` only |
| Spacetime: enter or skip? | Team | Slot exists. Needs one owner who spikes it in the first hours |
| Gemini model names, free-tier limits, track rules | Copilot backend | Confirm at the Google Cloud sponsor table |
| Sponsor rules generally | Team | The PRD read these from slides only. Confirm each before relying on it |
| Final P1/P2 line | Team | Revisit after the first build hours |

## Simulator and Copilot (browser agent)

Answers to the open questions above. These replace those rows.

| Decision | Why |
| --- | --- |
| **Probability range = assumption terciles.** Each path draws an assumption level that shifts its average market return and raise rate. Low end: success rate in the most pessimistic third of paths. High end: the most optimistic third | A confidence interval at 5,000 paths is about ±1%, which is false precision. This range says "if returns and raises come in below average, X%; above average, Y%", which is honest and explainable |
| Monthly steps, seeded mulberry32, fixed draws per month | Same seed means same output, and a baseline and a what-if share their randomness, so the difference is caused by the purchase alone |
| One-time purchases create a cash shortfall that monthly savings rebuild before goals get new money | A laptop is paid from cash, not from a goal. The delay shows up as goals waiting while cash recovers |
| Goals are funded "on pace" in priority order: each gets what it needs to land on its date, then leftovers speed up goals in order | Matches the PRD's joint simulation. A purchase often shows as lower odds rather than a later date, so cards can lead with either |
| **A rental replaces current housing.** The simulator applies rent minus the current mortgage payment | The demo profile owns a condo and goes apartment hunting. Adding rent on top of a mortgage makes every goal impossible and is not what a mover does |
| **Safe rent** = current housing payment + monthly savings not needed by non-negotiable goals, rounded down to $50 | Ties the threshold to the user's must-hit goals, which is what the card says it protects |
| **Vehicle**: assume 60 months at 7% APR, whole-dollar payment, total cost includes interest | The privacy rule limits the payload to price, so terms are assumed and named on the card ("at an assumed 7% over 60 months") |
| **Checkout Smart Move**: pay from checking down to the buffer target, put the rest on the 0% promo card, pay off in equal whole-dollar amounts before the promo ends | The PRD's example card. No plan when checking covers it or no usable promo card exists |
| **The headline is chosen in code** (`pickHeadline` in math-core): one month of delay scores like a 10-point drop in odds; tiny changes are ignored; a goal that becomes unreachable wins; a goal that was already unreachable only leads when nothing else moved | Keeps "math first": the model words the headline but never picks it. The LLM card is rejected if it does not name the headline goal |
| `GoalImpact` gains `probabilityLowAfter` and `probabilityHighAfter`; `CopilotMetrics` gains `currentHousingCents`, `monthlyChangeCents`, `vehicle`, `splitPlan`, `headline` | Additive. Cards say "from 93–94% to 76%", which needs the after values |
| Demo profile gains a "Japan trip" goal (priority 2, $4,500 by June 2027) | Gives the checkout demo a concrete, relatable goal to lead with |
| Extension rejects dollar prices tagged with another currency ("$1,499 CAD", "CA$1,499") | PRD: skip non-USD and never guess |

## Good-move cards

| Decision | Why |
| --- | --- |
| Every card has a **verdict**, chosen in code: `caution` (hurts a goal or the cash cushion), `good` (fits the plan or beats the alternatives), `neutral` | The Copilot advises in both directions. The model words the stance but never picks it. The overlay colors the card by verdict (red, green, blue) |
| New page type `debt_payment` (item `credit_card_payment`) | Paying off debt is the clearest good move. The payload stays price, item type, and merchant only |
| A card payment is matched to the **highest-rate card with a balance**, paid from checking | The page cannot send which card (privacy rule), and the highest-rate card is the one a payment helps most |
| Interest saved = amount paid × the card's rate, for a year, in whole dollars. Paying in full frees the minimum payment, which the simulator returns to savings each month | Honest, explainable figures. A partial payment frees only the interest |
| **Alternatives** rank where a dollar earns the most: each debt at its rate, investing at the assumed 7%, the best savings account at its rate | Lets a card say why a choice beats the others ("a 23% guaranteed return, better than investing or savings") |
| An affordable checkout (no goal hit, cushion intact) is `good`: the card affirms it and steers payment away from high-rate card debt | Reinforces good habits instead of staying silent |
| Headline gains a `gain` kind (a goal gets sooner or more likely), used only when nothing got worse | Positive changes deserve a mention, but a loss always outranks a gain |
| `CopilotCard` gains `lead`, the one figure shown large and on the badge | Works for both directions: a goal's odds, interest saved, or "on track" |
| Goal likelihood is shown as **plain status words**, chosen in code (`GOAL_STATUS` in math-core): on track (90%+), likely (80-90%), at risk (50-80%), unlikely (10-50%), out of reach (under 10%). Cards never say "odds". The percentage range stays in a small "Chance" row near the disclaimer | "Odds" read like gambling. Words land faster for a bank audience, and keeping the range on the card honors rule 7 |

## Demo store

| Decision | Why |
| --- | --- |
| The demo runs on a believable store (Circuit & Co.: 12 products from $15 to $3,299) plus the rental, car, and bank sites, opened from a plain browser start page with no scenario hints | Judges see the Copilot reach different verdicts live from the same data, instead of a scripted outcome per page |
| The Copilot appears on product pages (when you look at an item) and again at checkout | Advice at the moment of decision. Both pages send only the price |
| On localhost, dismiss and snooze are keyed by path and query, so each product counts separately | Products share one page and differ only by `?id=` |
| When a purchase makes a goal unlikely or out of reach, the Smart Move points to a cheaper option or waiting, never to financing | A split payment protects the cash cushion, not the goal. Suggesting financing there would be bad advice |
| The demo server also serves `.js` files from `mock-pages/` | The store's catalog lives in one shared script (`store.js`) |
| The Copilot **re-evaluates when the page's price changes** (a MutationObserver, debounced 600 ms; it still reads only the rule's price element). An open card updates in place; a price that disappears removes the card; stale replies are dropped | Picking a different payment amount or quantity should change the advice live. That is the "actively guiding" moment of the demo |
| A card payment of no more than the minimum is `neutral`: the card shows the interest still charged on the rest and, when checking can cover the full balance above the cushion, suggests paying it all. A partial payment above the minimum stays `good` but makes the same suggestion | Calling a minimum payment a "great move" would be bad advice |
| `GeminiClient` uses the REST API through `fetch`, not the SDK | No new dependency, and every request and failure is visible in one file. Structured output sends `responseMimeType: application/json` with the schema's types upper-cased |
| Copilot cards wait at most 2 seconds for Gemini, then show the template card | The PRD requires a card within 3 seconds |
| Copilot cards ask Gemini for `thinking: "minimal"` (`LlmRequest.thinking`, sent as `thinkingConfig.thinkingLevel`). Other calls keep the model default | Tested live on 2026-11-07: with default thinking, `gemini-3-flash-preview` took over 15 s on the card prompt, so every card fell back. With minimal thinking it answers in about 1.1 s and passes the guardrail. The figures are fixed, so there is nothing to reason out |
| The demo key uses `gemini-3-flash-preview` for both tiers | It is an AI Studio free-tier key (5 requests a minute per model). 3.5-flash was close to that limit and slower. 3.6, 3.7, and 3.8 flash returned 503s or hung, and 2.5-flash is closed to new users |
| Demo-site submit buttons (place order, schedule payment, credit application) say "Demo site: nothing was sent" instead of doing nothing | No dead buttons during judging, and nothing pretends to be a real transaction |
