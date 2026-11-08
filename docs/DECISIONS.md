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
