# FinVantage: Project Details

> **What this file is.** The single source of truth for FinVantage's final submission, as of **November 8, 2026**. It is written to be handed to an AI (or a person) to produce the Devpost write-up, landing-page copy, and the pitch deck. Everything here was checked against the repository on that date. Where something is still a stub, a sample, or unconfirmed, it says so. **Do not upgrade a "sample" or "stub" claim into a "live" claim when reusing this text.**
>
> Built at **HackUTD** for the **PNC 360 Financial Health Navigator** track, the **design** track, and the sponsor tracks listed in section 12.

---

## Contents

1. [Taglines and pitches](#1-taglines-and-pitches)
2. [The problem](#2-the-problem)
3. [The solution](#3-the-solution)
4. [Who it is for](#4-who-it-is-for)
5. [How we differ](#5-how-we-differ)
6. [Features, in detail](#6-features-in-detail)
7. [The safety story (rules the code enforces)](#7-the-safety-story-rules-the-code-enforces)
8. [How it works (architecture)](#8-how-it-works-architecture)
9. [Tech stack](#9-tech-stack)
10. [The demo profile](#10-the-demo-profile)
11. [Demo script](#11-demo-script)
12. [Sponsor and track usage](#12-sponsor-and-track-usage)
13. [Current status: what is live, sample, or stubbed](#13-current-status-what-is-live-sample-or-stubbed)
14. [By the numbers](#14-by-the-numbers)
15. [Challenges we ran into](#15-challenges-we-ran-into)
16. [Accomplishments we are proud of](#16-accomplishments-were-proud-of)
17. [What we learned](#17-what-we-learned)
18. [What is next](#18-whats-next)
19. [Team](#19-team)
20. [Links, running it, and access](#20-links-running-it-and-access)
21. [Ready-to-use copy blocks](#21-ready-to-use-copy-blocks)
22. [Pitch deck outline](#22-pitch-deck-outline)
23. [Claims to avoid](#23-claims-to-avoid)

---

## 1. Taglines and pitches

**Name:** FinVantage

**Primary tagline (used on the live landing page):**
> Know what a purchase does to your goals, **before you buy.**

**Alternates:**
- A financial advisor that shows up where money decisions actually happen.
- See your financial future as a range, not a guess.
- Your money, simulated forward.
- Math first, words last.

**One sentence:**
FinVantage is a web dashboard and a Chrome extension that simulate your financial future and step in at the moment of a money decision, on a checkout page, a rental listing, or a car quote, instead of showing you a chart after the money is gone.

**Thirty seconds:**
Most finance apps look backward. They tell you what you spent last month. FinVantage looks forward. It pulls every account you have (checking, savings, CDs, retirement, loans, credit cards, and a mortgage) into one picture, then runs 5,000 simulated futures to show how likely each of your goals is, as an honest range. Our Chrome extension, the Copilot, notices when you are about to make a big decision, such as a $1,499 laptop in your cart or a $1,950 apartment, and shows in about a second what it does to your goals, with a smarter way to do it. Every number comes from code, never from the AI. The AI only explains it.

**Two minutes (spoken pitch):**
People keep money in many places, and almost no one has a clear view of how they are doing or what to do next. The apps that exist, such as Mint, YNAB, and Credit Karma, all converged on the same thing: link your accounts, categorize, budget, show a net worth number. They share two gaps. They look backward, and they are passive. You only see the consequence after you have spent the money.

FinVantage fixes both. First, it simulates forward. A Monte Carlo engine runs 5,000 possible futures, with income, spending, and market returns all varying, and funds every goal together from the same pool of money, in priority order, the way real money works. You see each goal as a range, such as "76 to 89% likely", not one falsely precise number.

Second, it shows up where decisions happen. The FinVantage Copilot is a Chrome extension. On a checkout page, a rental listing, a car-financing page, or a credit card payment page, it reads one thing, the price, and asks our API what that decision does to you. A card slides in: what it does to your Japan trip, why, and what you could do instead, such as splitting the cost onto your 0% promo card with a payoff plan.

Third, it explains everything in plain language, and we built it so the AI cannot lie about money. Every figure is computed in code first. Google Gemini only writes the sentence, and a guardrail checks that every number in that sentence came from our math. If it fails, or Gemini is down, you get a template card built from the same math. The demo never shows an empty state.

Around that core is a full dashboard: accounts and net worth, transactions, spending with budgets and a Needs, Wants and Savings split, income, goals, investments, credit, a life-event planner, quarterly reports with PDF and email, and an AI Advisor you can ask any money question. It suggests only. It never moves money.

---

## 2. The problem

- People hold money in many places: checking, savings, CDs, IRAs, auto and personal loans, credit cards, and mortgages. Few have one clear view of how they are doing or what to do next.
- Existing apps (Mint, YNAB, Copilot Money, Rocket Money, Credit Karma) converged on linking accounts, categorizing, budgeting, and net worth. They share two gaps:
  1. **They look backward.** They report last month.
  2. **They are passive.** They live inside their own app, opened occasionally, and the user sees the consequence only after the money is spent.
- The moment that matters, the checkout button, the lease application, the car loan, happens somewhere else, with no advice in sight.
- When apps do project the future, they usually show one number, which reads as a guarantee it cannot be.

---

## 3. The solution

FinVantage has two clients and one brain:

1. **The web dashboard** shows the whole financial picture in one place and simulates the future as a range of outcomes.
2. **The Copilot Chrome extension** detects a high-impact money decision on the page you are viewing and shows its impact before you commit.
3. **One backend API** does all the work: a deterministic math core and a Monte Carlo simulator compute every figure, and an LLM layer (Google Gemini) only puts those figures into words.

The core design principle: **the math core computes every number before the LLM writes a word.**

---

## 4. Who it is for

Anyone managing their own money. Two reference personas drove design decisions:

- **The starter** (student or early career): few accounts, one or two loans, no budget habit. Needs plain-language explanations and a safe spending threshold.
- **The planner** (a few years into a career): several account types, saving toward a house or a car. Needs trade-off analysis and probability ranges on goals. The demo profile, Jordan Rivera, is a planner.

---

## 5. How we differ

| A typical finance app | FinVantage |
| --- | --- |
| Shows what happened last month | Simulates where finances are headed, as a range of outcomes |
| Lives inside its own app, opened occasionally | The Copilot appears on checkout, rental, car-financing, and card-payment pages at the moment of commitment |
| Tracks goals one at a time | Simulates goals together, competing for the same dollars by priority |
| Charts you must interpret | Plain-language explanation of every number and recommendation |
| An AI chatbot that may invent figures | Every figure computed in code; the AI only words it, and a guardrail rejects any number it did not receive |
| Passive | Proactive, but never acts without the user saying yes |

---

## 6. Features, in detail

### 6.1 The Copilot (Chrome extension), the headline feature

A Manifest V3 Chrome extension that notices a high-impact decision and shows a card with its effect on your finances.

**What it detects (page types):**
- **Checkout and product pages** (retail purchase)
- **Rental listings** (monthly rent)
- **Car-financing quotes** (vehicle)
- **Credit card payment pages** (debt payment, the clearest "good move")

**Where it works:**
- **Demo sites we built** (served locally on port 4100), opened from a plain browser start page with no scenario hints:
  - **Circuit & Co.**, a believable electronics store with 12 products from $15 to $3,299, categories, search, cart, and checkout
  - **Hearth Rentals**, an apartment listing
  - **Meridian Motors**, a car dealer with a financing quote
  - **Demo Bank**, a credit card payment page
  - Two edge-case pages: a rental with no price, and a checkout priced in Canadian dollars
- **Amazon.com product pages, live.** Checked on November 7, 2026 on 8 real products, including decoy prices and switching product options.
- Zillow, Apartments.com, Best Buy, Apple, and CarMax are in the manifest, but their price selectors are not written yet.

**The card:**
- A floating badge expands into a card rendered inside a **Shadow DOM**, so the host page's CSS cannot affect it.
- Every card has a **verdict chosen in code**, never by the AI:
  - **Looks good** (green): fits the plan, or beats the alternatives
  - **Worth a look** (blue): affordable but big for this person
  - **Heads up** (amber): a goal slips a little, or checking dips under the safety cushion
  - **Warning** (red): a goal ends at risk, unlikely, or out of reach, or the purchase is more than checking holds
- Layout, written for an everyday shopper: the verdict with an icon and a word, one plain sentence, the goal affected, **Why**, **What You Could Do**, then the numbers with plain labels. 15 px body text, nothing under 12 px.
- Goal likelihood shows as **plain status words** chosen in code: on track (90%+), likely (80 to 90%), at risk (50 to 80%), unlikely (10 to 50%), out of reach (under 10%). The percentage range stays in a small "Chance" row next to the disclaimer. The card never says "odds".
- A **"See the full picture"** link opens the dashboard.

**It updates live.** If the price on the page changes (a different product option, quantity, or payment amount), the card re-evaluates within about 600 ms and updates in place. Stale replies are dropped.

**User control:** close a card on one page, snooze a whole site, or turn the extension off. A popup shows who is signed in, opens the dashboard login, signs out of both, and offers "Reset dismissed cards".

**It follows your dashboard sign-in.** The extension reads the dashboard's session cookie (scoped to the web app's origin only). Signed in, cards use your own accounts and your linked bank. Signed out, they use the shared demo profile. The extension never sees a password.

**Install from the dashboard.** The dashboard's Copilot tab offers a zip download built from the current code and pointed at that deployment's API, loaded with Chrome's "Load unpacked".

**What the Copilot computes (all in code):**
- **Fixed-cost ratio and debt-to-income**, before and after
- **Liquid runway** and checking after the purchase versus the user's **safety cushion** ($2,500 in the demo)
- **Goal impact** from the simulator: the change in each goal's probability range and its funding date
- **Safe rent**: current housing payment plus monthly savings not needed by non-negotiable goals, rounded down to $50
- **Rent check**: rent above 30% of income is a heads-up
- **Vehicle**: assumes 60 months at 7% APR (named on the card), total cost including interest, and flags a loan that pushes debt payments above 36% of income
- **Checkout Smart Move**: pay from checking down to the cushion, put the rest on the 0% promo card, and pay it off in equal whole-dollar amounts before the promo ends. Offered only when it fits the card's remaining credit and the user's monthly savings
- **Spare cash first**: checking above the cushion and savings no goal is using are spent before goal money. If spare savings can cover it, the card says to move that amount first
- **Card payments**: matched to the highest-rate card with a balance; interest saved per year; a minimum-only payment is "neutral" and the card shows the interest still charged
- **Ranked alternatives**: where a dollar earns the most (each debt at its rate, investing at an assumed 7%, the best savings rate)
- **Big-purchase realism**: a purchase of at least half a month's income or a quarter of spare cash is "Worth a look", and a full month's income, half of spare cash, or heavy non-mortgage debt (a year's income or more) makes it a "Heads up" that suggests a cheaper option, waiting, or paying high-rate debt first
- **The headline**, chosen in code: one month of delay scores like a 10-point drop; a goal that becomes unreachable wins; a loss always outranks a gain

**Example card (checkout, demo profile):** a $1,499 laptop is an amber Heads up. It dips checking under the $2,500 cushion and nudges the House down payment, and the card suggests splitting it onto the 0% promo card with a payoff plan. A $3,299 laptop is a red Warning: the Japan trip goes from on track to unlikely, and the card suggests a cheaper option or waiting, never financing.

### 6.2 The Life-Event Simulator (Monte Carlo engine)

The engine behind the dashboard, the Copilot, the Advisor, and reports.

- **5,000 paths** by default, in monthly steps
- Each path samples **income changes, spending variation, and market returns**
- **Joint simulation**: all goals are funded together, in priority order, from the same monthly savings. Each goal gets what it needs to land on its date, then leftovers speed up goals in order
- **Life events** (one-time or recurring, with a duration) and **what-if** values (monthly savings change, a purchase, event timing) apply to every path
- **Output per goal**: a probability range and a **fan chart** (median plus percentile band) that widens over time
- **The probability range is honest.** Each path draws an assumption level for returns and raises. The low end is the success rate in the most pessimistic third of paths, and the high end is the most optimistic third. A confidence interval at 5,000 paths would be about plus or minus 1%, which is false precision
- **Deterministic**: seeded (mulberry32), so the same seed and inputs always give the same output. A baseline and a what-if share their randomness, so any difference is caused by the change alone
- **Fast**: a Copilot evaluation takes about 0.6 seconds
- **Snapshots**: a saved run stores its inputs, outputs, priorities, and the previous run's id, so any two runs can be diffed without recalculating

### 6.3 The AI Advisor (chat)

A saved, multi-turn chat built on **Gemini function calling**. It aims to answer any money question, grounded in the user's own data.

- **Retrieval by brief plus tools, not embeddings.** Each turn gets a compact brief computed in code (net worth, income, budgets at risk, bills, goals and their ranges, life events, the latest report, recent Copilot scans). Gemini reaches everything else through about 15 or more typed tools. Financial records are structured, so a filter answers "what did I spend at Amazon in October?" exactly, where similarity search would guess
- **Read tools** for accounts, transactions, spending, budgets, recurring charges and bills, income, goals, life events, Copilot scans, quarterly reports, simulation runs, and the portfolio and credit score. They call the app's own GET routes as the signed-in user, so the Advisor sees exactly what each page shows. Only GET routes are exposed, so a tool cannot change data
- **Compute tools**, all running in our math core, never in the model:
  - `simulate_scenario`: any mix of one-time and monthly changes, a loan, a savings change, a new goal, or a moved goal date, run through the real simulator
  - `finance_calc`: loan payments, growth ranges, payoff time, how much to save, time to a target
  - `plan_goal`, `find_savings` (3-month averages of "wants" categories, cuts capped at half a category, then a what-if), `check_purchase` (the Copilot pipeline, without saving an event), `evaluate_card`, and `calculate` (a hand-written arithmetic parser, no `eval`)
  - Each compute tool attaches its working, shown as "How These Numbers Were Worked Out"
- **Drafts, never saves**: `draft_life_event` and `draft_goal` return a draft the user saves with "Confirm and Save"
- **Web search with privacy**: `web_search` uses Gemini's Google Search grounding for things like a credit card's published terms. Code refuses any query that contains the user's name, email, a dollar amount, or one of their own figures. Web figures are labeled "From the Web" with sources
- **Interactive visuals in the chat**: a loan explorer, a goal planner, a growth comparison, and a card evaluator. Moving a slider recomputes on the server (`POST /v1/advisory/visuals`); the browser does no financial math. Every chart has a table view
- **Growth is always a range** across up to four rates, each labeled with its source: the user, the web, or an assumption (4%, 7%, 10% fallback)
- **Money guardrail**: every dollar amount in an answer must match a figure the model was given (within 3% or $1 for rounding). On failure it retries once, naming the bad numbers, then drops the offending sentences or shows a "Safe Answer" written in code. Answers are capped at 250 words
- Conversations are saved (MongoDB in production), and the last 20 messages are replayed
- Deep links: a Copilot scan or a simulation run opens a conversation about it
- `npm run eval:advisor` runs about 40 varied questions against real Gemini and reports which were answered and which fell back

### 6.4 Life Events

Two ways to log a life event, both producing the same structured record:

- **Pick from a list**: child, house purchase, job change, move, wedding, or custom, with a guided form
- **Type it out**: "We're having a baby in March" is parsed by Gemini into a structured draft. The parser only extracts dates, amounts, recurrence, and duration that are actually in the sentence; it never invents a dollar figure
- **Nothing saves until the user confirms.** A preview runs the simulator before and after with identical goals, seed, and path count, so the event's effect is isolated
- The **Life Simulator** page compares an event against every current goal, shows two impact charts and a funding-date timeline, rates each goal Low, Medium, or High impact with its own color, and saves and reopens named scenarios. Scenarios can be applied, confirmed, and undone
- **PDF export** of a scenario comparison, recalculated on the server

### 6.5 Dashboard (web app)

A responsive Next.js dashboard. The sidebar is grouped: **Overview**; **Intelligence** (Advisor, Copilot, Life Events, Reports); then **Accounts, Transactions, Goals, Income, Spending, Investments, Credit**; and **Settings**.

- **Overview**: the whole picture, with opening animations and count-up figures
- **Accounts**: net worth, assets, liabilities, balances by account type, a net worth trend, an expandable account directory with institution logos, account details (rates, payments, promo dates, recent transactions), manual add and edit, and a **Linked Banks** panel to connect a bank through Plaid Sandbox, refresh, or disconnect
- **Transactions**: one card with month groups and category colors; search and filter; add and edit (merchant, account, date, amount, currency, category, recurring); a cascading category picker; non-USD entries keep their original amount and use a historical exchange rate
- **Goals**: Kanban (To-do, In Progress, Achieved, with drag and drop), Cards, and Analysis views; create, edit, and delete goals with target, date, priority (High, Medium, Low), flexibility, and a linked account; each goal shows its simulated probability range
- **Income**: expected income, income by category, income versus spending, income-to-debt ratio, stability, and recent deposits
- **Spending**: categories with icons, a drill-down donut, budgets with pace (where the month will end at the current rate), the **Nature of Spending** card (Needs, Wants and Savings against a 50/30/20 split the user can change), top 10 expenses, recurring charges, and upcoming bills
- **Investments**: an All view plus one per account (Roth IRA, 401(k), Brokerage), tiles, chart ranges, allocation, holdings, a watchlist, markets, top movers, and a market news reader
- **Credit**: an interactive score gauge, a history chart, card tiles, and "What Shapes Your Score?". **The score is mocked and labeled**
- **Copilot**: the feed of interventions, updating live, with delete and clear-all, and the extension download with install steps
- **Reports**: quarterly reports (section 6.6)
- **Settings**: spending organization, custom categories, and merchant rules
- **Landing page**: hero, "Built Around Your Decisions" feature carousel, how it works, a Copilot section, and a trust section. Plus sign-up and sign-in, privacy, and terms pages

**Design language:** purple primary (#544af7), white surfaces, semantic green, amber, and red used only on verdicts with an icon and a label, Poppins headings, floating cards, pill chips, one-hue fan charts, and a colorblind-checked series palette. Title Case for labels, sentences for body copy. Every probability shows as a range with a disclaimer next to it (the `ProbabilityRange` component), and every mocked value carries a `MockedBadge`.

### 6.6 Quarterly Reports

- A quarter-over-quarter recap: what went well, what did not, why, a look ahead, and one or two next steps
- Figures are aggregated in code from stored simulation runs, Copilot events, recommendations, and transactions. **Gemini writes the prose only**, and every number is validated
- Names the cause of the largest change; when no prior quarter exists, it produces a one-quarter baseline instead of failing
- On a linked bank, income, spending, and savings come from the quarter's actual transactions, and transfers between the user's own accounts are excluded. The report says whether it is based on your linked bank or on sample data
- **Downloadable PDF** with the dashboard palette and Poppins: KPI cards, an asset-allocation pie, quarter-over-quarter range bars, a spending trend, goal pathways with uncertainty bands, categorized suggestions, and non-guarantee labels. PDF bytes are stored in MongoDB so any server instance can serve them
- **Email delivery** on a schedule the user picks (hourly, daily, weekly, monthly, quarterly), through Gmail SMTP (a mock provider by default). An external cron calls a protected endpoint every five minutes, and MongoDB leases each due schedule atomically so it is never sent twice. Every attempt is logged

### 6.7 Spending categories, budgets, and rules

- **Three layers**: Plaid's 127 detailed categories (hidden), about 20 FinVantage categories people budget against, and user subcategories up to three levels (Shopping, then Superstores, then Walmart)
- A test proves every Plaid category (v1 and v2) maps to a FinVantage category that exists
- Every category has a default bucket (Needs, Wants, Savings, or excluded). Income and Transfers, including credit card payments, are excluded so purchases are not double-counted
- **Merchant rules** ("always put Starbucks in Coffee") apply to new and bank-synced transactions; a transaction moved by hand keeps the user's choice
- Merchants Plaid cannot place get the "Unknown" category, never a blank

### 6.8 Bank linking (Plaid Sandbox)

- Real **Plaid Link** flow in Sandbox: link token, public token exchange, item, accounts, transactions sync (all pages, from a saved cursor), liabilities, recurring streams, investment holdings, and item removal
- Checked against Plaid's First Platypus Bank: all 14 accounts map, with card, mortgage, and student-loan terms and 13 holdings
- **Access tokens are encrypted** with AES-256-GCM in a private table and never returned to a client
- Once a user links a bank, it **replaces** their demo copy's accounts everywhere (Copilot, simulator, net worth, reports), so cash is never counted twice. Goals, income, and hand-added accounts stay
- Sandbox login: `user_good` / `pass_good`

### 6.9 Accounts and auth

- Email and password sign-up and sign-in. The API issues RS256 tokens, publishes its public key at `/.well-known/jwks.json`, and stores credentials in a private SpacetimeDB table with scrypt hashes. A wrong password and an unknown email return the same error in about the same time
- Each new user gets their own copy of the demo profile. Signed-out visitors use a shared demo user

---

## 7. The safety story (rules the code enforces)

These are not slide promises. Each is enforced in code and covered by tests.

1. **Math first.** Every figure a user sees is computed in code before any LLM call. The model only words those figures.
2. **The guardrail stays on.** A Copilot card is rejected if any number in it does not appear in its inputs, if it is over 60 words, if it skips the headline goal, if it uses finance jargon, or if it shows a negative dollar amount. Figures the math did not justify (for example the cushion on a rental) are withheld from the model, so the number check rejects any claim about them.
3. **Never an empty state.** If Gemini fails, times out (2 seconds for cards), is rate-limited, or is rejected, the user sees a deterministic template card built from the same math. The Advisor's equivalent is the "Safe Answer".
4. **Suggest only.** Nothing moves money, applies for credit, or clicks anything on a host page. Demo-site submit buttons say "Demo site: nothing was sent".
5. **Extension privacy.** Only four fields leave the browser: page type, item type, price, and merchant. The request schema is strict, so any extra field is rejected with a 400. No page text, browsing history, or screenshots.
6. **Secrets stay on the server.** The web app and extension never hold model or bank keys.
7. **Ranges, not numbers.** Probabilities are shown as ranges with a disclaimer nearby. Growth is shown across several rates.
8. **Mocks are labeled.** Portfolio share counts and the credit score are mocked. The API contract forces `mocked: true`, and the UI shows a Mocked badge.
9. **Confirm before saving.** A parsed life event or an Advisor draft never saves on its own.
10. **Sandbox only.** Synthetic data or Plaid Sandbox. No production bank connections.
11. **One LLM wrapper.** Only one file in the codebase may call a model provider.
12. **Deterministic simulator.** The same seed and inputs give the same output, so demos and tests repeat.
13. **Advisor web search is scrubbed.** A query with the user's name, email, a dollar amount, or one of their figures is refused before it leaves the server.

**Disclaimer used in the product:** FinVantage provides educational projections, not financial advice. Simulator outputs are ranges and estimates, not guarantees.

---

## 8. How it works (architecture)

```
Chrome extension ──┐                         ┌─────────────────────────┐ ──> SpacetimeDB (ledger, auth, live push)
  reads one price  │                         │  API (Hono, TypeScript) │
                   ├── typed client, HTTPS ─>│   math core             │ ──> MongoDB Atlas (documents)
Web dashboard ─────┘                         │   simulator             │
  Next.js           <── live updates ─────── │   LLM layer (words only)│ ──> Google Gemini
                                             └─────────────────────────┘ ──> Plaid Sandbox, Alpaca, FMP
```

**Two clients, one backend.** The dashboard and the extension import only the shared contracts package and reach everything else over HTTP.

**Contracts first.** Every entity and every API route is defined once with Zod. The server and the client are both typed from that table and validate at runtime. If a response drifts from its contract, the API returns a 500 (`contract_violation`) rather than sending bad data.

**Interfaces with stubs behind them.** Each external service sits behind an interface with a default that needs no setup. Environment variables choose the real one, in one file.

| Interface | Default (local, no keys) | Production |
| --- | --- | --- |
| Ledger store | In memory | SpacetimeDB |
| Document store | In memory | MongoDB Atlas |
| Bank data | Synthetic demo bank, same flow | Plaid Sandbox |
| LLM | Mock that always fails, so fallbacks run | Gemini |
| Live updates | In-process SSE | SpacetimeDB subscriptions |
| Market data | Sample prices, labeled | Alpaca and FMP |
| Email | Mock | Gmail SMTP |

**The Copilot flow, end to end:**
1. The content script matches a site rule and reads one price element.
2. It sends the four-field context to the extension's service worker.
3. The service worker checks on/off, snooze, and dismissal, then calls `POST /v1/copilot/evaluate`.
4. The API builds a snapshot of the user's finances from the stores.
5. The simulator computes goal impact (with and without the purchase, same seed).
6. The math core computes every figure, the verdict, and the headline.
7. Gemini words the card; the guardrail checks it; any failure uses the template card.
8. The API stores a Copilot event and publishes it live.
9. The overlay shows the card, and the dashboard's Copilot feed updates in other tabs.
10. Dismiss, snooze, and open are sent back to the API.

Target: a card within 3 seconds of page load. Measured: about 0.6 s for the simulation and about 1.1 to 1.5 s for a Gemini card; cards for identical inputs are cached.

**Live updates.** Signed-in browsers connect to SpacetimeDB with their FinVantage sign-in token. SpacetimeDB verifies it against our published JWKS, and a per-user view means each user only receives their own events. A push only tells the dashboard to refetch through the API, so every figure still comes from the API. Verified in production with two users: each got only their own event, about 3 seconds after a cold request.

---

## 9. Tech stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript everywhere, one npm-workspaces monorepo |
| Web app | Next.js (App Router), React, Tailwind CSS, Recharts, lucide-react icons, Poppins |
| Extension | Chrome Manifest V3, content script plus service worker, Shadow DOM overlay, esbuild bundles |
| API | Hono on Node.js, bundled with esbuild into one Vercel function |
| Contracts | Zod schemas, a typed route table, a typed client |
| Simulator | Custom seeded Monte Carlo engine (mulberry32), monthly steps |
| Math core | Deterministic TypeScript formulas |
| AI | Google Gemini via REST (`gemini-3-flash-preview`): structured JSON output, function calling, Google Search grounding, minimal thinking for cards |
| Relational data, auth, live push | SpacetimeDB on Maincloud (TypeScript module, Plaid-shaped tables, reducers, per-user views) |
| Documents | MongoDB Atlas (simulation runs, Copilot events, life events, recommendations, reports, report PDFs, email schedules, Advisor conversations) |
| Bank data | Plaid Sandbox |
| Market data | Alpaca (IEX prices, history, news) and Financial Modeling Prep (market cap, P/E) |
| PDFs | pdfkit with embedded Poppins |
| Email | Gmail SMTP (Resend adapter also present) |
| Auth | Our own email and password, RS256 JWTs, scrypt hashes, JWKS endpoint |
| Hosting | Vercel (web app and API), deployed by GitHub Actions with the Vercel CLI |
| Tests | Node's built-in test runner through tsx |

---

## 10. The demo profile

A synthetic person, **Jordan Rivera**, a product designer who owns a condo. Generated deterministically by a script (same seed and end date, same file), with about **11 months** of realistic activity in **Plaid's exact format** (January 1 to November 8, 2026, about 500 transactions): take-home pay of about $5,700 a month on the 1st and 15th, a little freelance work, about $4,100 of monthly spending with seasonal swings (winter and summer utilities, December holidays, a July trip), three credit cards, and retirement and brokerage investing.

**Accounts (12, covering all six PNC account types):** Everyday Checking, High-Yield Savings, 12-Month CD, Roth IRA, 401(k), Brokerage, Auto Loan, Personal Loan, Cash Rewards Card, Travel Rewards Card, 0% Promo Card, and Condo Mortgage.

**Monthly picture:** income $5,700, fixed costs $1,768, debt payments $1,959, spending about $4,011, savings about $1,689. Safety cushion target: $2,500. Payday: the 15th.

**Goals (in priority order):**
| Goal | Target | Date | Flexibility |
| --- | --- | --- | --- |
| Emergency fund | $18,000 | March 2028 | Non-negotiable |
| Japan trip | $5,000 | October 2027 | Flexible |
| Kitchen renovation | $10,000 | September 2028 | Flexible |
| Next car | $8,000 | June 2029 | Flexible |
| House down payment | $40,000 | September 2029 | Flexible |

> Note: the 11-month generated profile is in the working tree on the `advisor-full-retrieval` branch and was not yet committed at the time of writing. Commit it before the final push so the demo matches this section.

---

## 11. Demo script

About 3 minutes. Run on the mock pages first, as the PRD requires; Amazon is the bonus.

**Before presenting:** sign in on the dashboard, load the extension, open one Amazon product page once (Amazon changes its markup), and use the popup's "Reset dismissed cards".

1. **Hook (15 s).** "Every finance app tells you what you spent last month. We wanted one that speaks up before you spend."
2. **Circuit & Co. (60 s).**
   - $15 Pulse Buds Lite: green **Looks good**.
   - $1,499 Arc 14 Laptop: amber **Heads up**. It dips under the safety cushion and nudges the House down payment. The fix: split onto the 0% promo card with a payoff plan.
   - $3,299 Arc 16 Pro: red **Warning**. The Japan trip goes from on track to unlikely, and the card suggests a cheaper option, not financing.
   - Point out: same data, different verdicts, live, about a second each.
3. **Hand off (15 s).** Click "See the full picture"; show the Copilot feed updated live on the dashboard.
4. **Hearth Rentals (20 s).** $1,950 a month: red, the emergency fund is out of reach, and the card names the rent this person can afford.
5. **Demo Bank (20 s).** Pay the full $860 balance: green, interest saved per year. Switch to the $35 minimum and watch the card change in place.
6. **Amazon (15 s).** One real product page: the same Copilot on a live site.
7. **Dashboard (30 s).** Fan chart and goal ranges; ask the Advisor "Can I afford a $10,000 car at 7.49% with $3,000 down?" and show the loan explorer; type "We're having a baby in March" in Life Events and show the confirmation before anything saves.
8. **Trust (10 s).** "Every number comes from code. Gemini only words it, and a guardrail rejects any number it was not given. It never moves money."

If time allows: Meridian Motors (car financing and debt-to-income), quarterly report PDF, linking a Plaid Sandbox bank and watching the Copilot switch to that bank's balances.

---

## 12. Sponsor and track usage

Each entry names the real job the technology does.

| Track | Status | The job it does in FinVantage |
| --- | --- | --- |
| **PNC 360 Financial Health Navigator** | Entering | The whole product: all six PNC account types, the simulator, the Copilot, the Advisor |
| **Design** | Entering | Fan charts, the Copilot overlay card, Advisor visuals, a consistent purple design system, accessible ranges and badges |
| **Best Use of Gemini API (Google Cloud)** | Entering | All LLM work: Copilot card wording (structured JSON, minimal thinking), the Advisor (function calling across about 15 tools, Google Search grounding), life-event parsing (structured output), quarterly report prose. Always behind a number-checking guardrail |
| **MongoDB Atlas** | Entering | The document store in production: simulation runs, Copilot events, life events, recommendations, quarterly reports, report PDFs, email schedules with atomic leasing, and Advisor conversation memory |
| **SpacetimeDB** | Entering (moved up from stretch) | The relational ledger in production (Plaid-shaped bank tables, goals, users, credentials), and live push: browsers subscribe with their sign-in token to a per-user view |
| Tiger Data | **Dropped** | Replaced by SpacetimeDB on November 7 |
| Vultr | **Dropped** | Replaced by Vercel for both the web app and the API |
| GoDaddy Registry | Not confirmed | No custom domain is configured in the repo; the app runs on `vercel.app` URLs |
| 8090.AI (Legacy Data Adapter) | Not built | By team decision |
| Solana | Skipped | No honest role |

Also used, not as tracks: **Plaid** (Sandbox bank linking), **Alpaca** and **Financial Modeling Prep** (market data), **Vercel** (hosting).

---

## 13. Current status: what is live, sample, or stubbed

**Live and working**
- Web app and API deployed on Vercel; data persists in SpacetimeDB and MongoDB Atlas
- Email and password auth with JWKS
- Copilot extension on all demo pages and on Amazon product pages, with Gemini-written cards and template fallback
- Monte Carlo simulator, fan charts, what-if, saved runs and diffs
- AI Advisor with tools, web search, drafts, and interactive visuals
- Life events: form, Gemini parser, preview, Life Simulator, PDF export
- Quarterly reports with Gemini prose, PDF, and scheduled email
- Plaid Sandbox bank linking, replacing the demo copy everywhere
- Spending categories, budgets with pace, Needs/Wants/Savings split, custom subcategories, merchant rules
- Live dashboard updates through SpacetimeDB subscriptions (signed in) or SSE (signed out)
- Investments page on live Alpaca prices, history, and news when keys are set

**Sample or mocked (labeled in the UI)**
- Credit score and its history
- Investment share counts (from the demo fixture, for every user); prices fall back to sample data without market keys
- Watchlist lives in browser storage and picks from sample symbols
- All financial data is synthetic or Plaid Sandbox

**Stubbed or not done**
- The ranked "Advisory Agent" endpoint (`POST /v1/advisory`) still returns canned options; the chat Advisor is the real one
- LLM categorization fallback for unknown merchants (they show as Unknown)
- Live-site selectors for Zillow, Apartments.com, Best Buy, Apple, and CarMax; Amazon cart and checkout
- Budgets, balance snapshots, and recurring streams are not yet read from SpacetimeDB store methods; the Spacetime store does not yet save subcategories or a custom spending split
- Copilot reads income and spending from the profile, not from linked-bank transactions
- Next expected paycheck on the Income page
- Password reset, email verification, and login rate limiting
- CI runs manually only
- Production Plaid (needs Plaid approval)
- Extension settings live in `chrome.storage`, not synced to the API

---

## 14. By the numbers

- **2 days** of building (November 7 and 8, 2026), **92 commits**, **4 contributors**
- **8 workspaces** tested, **315 automated tests**, all passing (`npm run check`, November 8)
- **5,000** simulated futures per run; about **0.6 s** per Copilot evaluation
- About **1.1 to 1.5 s** for a Gemini-written Copilot card; **2 s** cap before the template card
- **4 fields** leave the browser: page type, item type, price, merchant
- **60 words** maximum per Copilot card; **250** per Advisor answer
- **12 accounts** across all **6 PNC account types** in the demo profile; about **500** transactions over **11 months**
- **127** Plaid categories mapped to about **20** FinVantage categories
- **14** Plaid Sandbox accounts and **13** holdings mapped on the first live link
- About **15** Advisor tools, **4** interactive visual types, about **40** eval questions
- **86** typed API routes
- **13** dashboard pages, **6** demo websites, **12** demo store products ($15 to $3,299)

---

## 15. Challenges we ran into

- **Making an LLM trustworthy with money.** The first Gemini cards said things the math never said, such as claiming a rental dropped the user below their cushion. We fixed it by withholding figures the math did not justify, so the number check rejects any claim about them, and by banning jargon and negative dollar amounts in code.
- **Latency.** With default thinking, Gemini took over 15 seconds on the card prompt, so every card fell back. Minimal thinking brought it to about 1.1 seconds while still passing the guardrail. We also cache accepted cards by exact prompt, since the simulator is deterministic.
- **Free-tier rate limits.** The first key allowed 5 requests a minute and 20 a day. We limited Gemini to the live-site moment, then removed the limit when a paid key arrived.
- **Advice that sounds like a real advisor.** Early cards called a $4,799 laptop "Looks good" for someone $77,000 in debt. We added size-against-income, spare-cash, and heavy-debt rules, plus standard guidelines (30% rent, 36% debt-to-income).
- **Judging what a decision changes.** A $12.99 extension cord told a Plaid Sandbox user to "move $2,413" because they were already below their cushion. Now a purchase is judged only on what it changes.
- **Plaid's real data.** The Sandbox card showed a 0% promo APR, so the Copilot never warned about interest. We now use the purchase APR unless the promo's end date is known. Linking a bank also double-counted cash until linked banks replaced the demo copy.
- **The chat number check was too strict.** Checking every number blocked general advice ("under 30% utilization", "S&P 500"). We narrowed it to dollar amounts with a small rounding tolerance, and taught it that financial names are not figures.
- **Serverless and live updates.** An in-process event bus cannot reach other Vercel instances, and serverless functions cannot hold a WebSocket. The API talks to SpacetimeDB over HTTP, and the browser holds the subscription with its own sign-in token.
- **Platform pivots.** SpacetimeAuth only offered magic links and social logins, so we built our own email and password auth with a JWKS endpoint SpacetimeDB can trust. Tiger Data and Vultr were replaced mid-build.
- **Amazon's markup** varies by product and test group, so a site rule lists several price selectors tried in order.
- **Deployment gotchas.** MongoDB Atlas reports a blocked IP as a TLS error; pdfkit's font files had to be copied into the bundle by hand; Vercel installs only one workspace's dependencies.

---

## 16. Accomplishments we're proud of

- An AI financial assistant that **cannot invent a dollar figure**, enforced by code and tests, not by prompting
- Advice at the **point of commitment**, including on a live site, in about a second
- An honest simulator: ranges from assumption terciles, deterministic seeds, goals that compete for the same money
- An Advisor that can answer almost any money question from general building blocks, shows its working, and never saves without a yes
- Real infrastructure in two days: Plaid Sandbox, SpacetimeDB live subscriptions scoped per user, MongoDB, Gemini, scheduled email, PDFs, and deploys on push
- A contracts-first monorepo that let four people build in parallel without breaking each other: a response that drifts from its contract fails loudly
- 315 passing tests

---

## 17. What we learned

- Let code decide and let the model explain. The model is good at words and bad at arithmetic, so giving it fixed figures and checking its output is both safer and faster.
- Withholding a figure is a stronger guardrail than telling the model not to use it.
- Structured data wants structured retrieval: typed tools beat embeddings for "what did I spend at Amazon in October?"
- Honest uncertainty reads better than false precision, and plain status words land faster than percentages.
- Small, visible fallbacks (template cards, Safe Answers) are what make a live AI demo reliable.

---

## 18. What's next

- Live-site support for Zillow, Apartments.com, Best Buy, Apple, CarMax, and Amazon checkout
- Copilot and simulator reading income and spending from linked-bank transactions
- LLM categorization for unknown merchants
- Real investment positions from linked accounts, and a real credit score provider
- Digest-style monitoring as an add-on to the Copilot
- Attribution: separating "worse because of spending" from "worse because you reprioritized"
- The Legacy Data Adapter (translate old bank record formats into our schema)
- Production Plaid, password reset, rate limiting, and the compliance review real accounts require
- Chrome Web Store listing for one-click install

---

## 19. Team

| Person | GitHub | What they built |
| --- | --- | --- |
| **Ashzaeen Fatmi Khan** | ashzaeen (repo owner) | Product lead and PRD; monorepo skeleton; dashboard and design system; landing page; AI Advisor (retrieval, tools, interactive visuals, guardrail); spending categories, budgets, rules, and the Nature of Spending split; Income page; Transactions page |
| **Aram Salman** | | Monte Carlo simulator; math core; Copilot card and Gemini client with guardrails; Chrome extension; demo sites; Amazon support; extension sign-in and install flow |
| **Zhao9114** *(confirm display name; docs call the platform owner "Yao")* | Zhao9114 | Platform: CI and Vercel deploys, SpacetimeDB module and ledger store, auth, live subscriptions, Plaid Sandbox, Plaid-shaped data model, MongoDB wiring, reports on bank data; Investments page with live market data; Credit page |
| **Samyog Maharjan** | | Quarterly report agent (aggregation, PDF, email scheduling); life event simulator; landing page redesign and trust section; Advisor history panel; dashboard finance workflows |

> Confirm names, roles, and any links (LinkedIn, portfolio) before publishing.

---

## 20. Links, running it, and access

| What | Where |
| --- | --- |
| Live dashboard | https://finvantage-web-ten.vercel.app (dashboard at `/app`) |
| Live API | https://finvantage-api.vercel.app (`/health`) |
| Repository | https://github.com/ashzaeen/FinVantage |
| Demo video | *To add* |
| Slides | *To add* |

**Run locally** (Node 20.9 or later, no keys needed):
```bash
npm install
npm run dev
```
- Landing page http://localhost:3000, dashboard http://localhost:3000/app, API http://localhost:4000/health, demo sites http://localhost:4100
- Load the extension: `chrome://extensions`, Developer mode on, Load unpacked, choose `apps/extension/dist`. Or download it from the dashboard's Copilot tab
- Without keys, everything runs on in-memory stores and template cards. Add keys in `.env` (see `.env.example`) for Gemini, MongoDB, SpacetimeDB, Plaid, Alpaca, FMP, and SMTP
- `npm run check` runs typecheck and all tests

**Plaid Sandbox login:** `user_good` / `pass_good`.

---

## 21. Ready-to-use copy blocks

**Devpost "Inspiration":**
Every finance app we have used tells us what we spent last month. None of them were there when we were staring at a checkout button, a lease, or a car loan. We wanted an advisor that looks forward, explains itself in plain words, and shows up where money decisions actually happen, without ever being allowed to make up a number.

**Devpost "What it does":**
FinVantage pulls every account you have into one picture and simulates 5,000 possible futures, so each goal shows as an honest range. Its Chrome extension, the Copilot, notices a big decision on the page you are viewing (a checkout, a rental, a car quote, a card payment) and shows in about a second what it does to your goals, why, and a smarter way to do it. An AI Advisor answers any money question from your own data and shows its working. Life events, quarterly reports, budgets, investments, and Plaid Sandbox bank linking round it out. It suggests only, and never moves money.

**Devpost "How we built it":**
A TypeScript monorepo with a Next.js dashboard and a Manifest V3 extension calling one Hono API. A seeded Monte Carlo simulator and a deterministic math core compute every figure; Google Gemini only words them, behind a guardrail that rejects any number it was not given. SpacetimeDB holds the ledger and pushes live updates per user, MongoDB Atlas holds documents and agent memory, Plaid Sandbox supplies bank data, and Vercel hosts both apps. Zod contracts type the server and the client from one table.

**Landing page hero:**
- Headline: Know what a purchase does to your goals, before you buy.
- Sub: FinVantage runs a real simulation of your goals before and after a purchase, so you see the effect in seconds, not after the statement arrives.
- Points: Model decisions before you commit. Read-only bank connections.

**Landing page feature tiles (live copy):**
- **A Clear Financial Overview:** See your accounts, cash flow, and savings goals together, with recent changes in view.
- **Plan for Life Events:** Model a move, a new baby, or a job change, then compare how each goal's timeline shifts.
- **Ask Your AI Advisor:** Explore options and trade-offs grounded in your transactions, accounts, and goals.
- **Understand Your Reports:** Review spending, savings progress, and investments with a concise view of what changed.

**Landing page "How it works" (live copy):**
1. **Bring in Your Financial Data:** Connect a supported account or add your balances and transactions manually.
2. **Set the Goals That Matter:** A trip, a house, an emergency fund. Goals share one pool of savings, the way real money actually works.
3. **Test a Decision First:** See the effect on your goals before you buy, not after the statement arrives.

**Landing page Copilot points (live copy):**
- Shows up on checkout, rental and car-financing pages
- Reads only the price, item type and merchant, nothing else on the page
- Suggests only. It never clicks, fills or buys anything for you

**Landing page trust section (live copy):**
- Bank connections run through Plaid in sandbox mode, over the same encrypted connection standard real banking apps use.
- FinVantage never moves money, applies for credit, or takes an action on your accounts. It only suggests, and you decide.
- This build uses synthetic or sandbox financial data. Production bank connections are not enabled.
- Your future is shown as a range, with the disclaimer next to it, never a single number dressed up as a guarantee.

---

## 22. Pitch deck outline

1. **Title:** FinVantage. Know what a purchase does to your goals, before you buy.
2. **Problem:** money in many places; apps look backward and wait to be opened.
3. **Insight:** advice is worth most at the point of commitment.
4. **Solution:** one picture, simulated forward, with a Copilot where decisions happen.
5. **Live demo:** Circuit & Co. three verdicts, rental, card payment, Amazon.
6. **The simulator:** 5,000 futures, goals compete for the same dollars, honest ranges, fan chart.
7. **The Advisor:** any money question, tools, shown working, interactive visuals.
8. **Trust:** math first, the guardrail, template fallback, four fields leave the browser, suggest only.
9. **Architecture:** two clients, one API; each sponsor's job named (Gemini, MongoDB Atlas, SpacetimeDB, Plaid, Vercel).
10. **How we differ:** the comparison table from section 5.
11. **By the numbers:** section 14.
12. **What's next:** section 18.
13. **Team.**

---

## 23. Claims to avoid

When turning this into public copy, do not say:
- That it connects to real bank accounts in production. It uses synthetic data and Plaid Sandbox only.
- That the credit score or investment share counts are real. They are mocked and labeled.
- That the Copilot works on Zillow, Best Buy, Apple, CarMax, or Amazon checkout. It works on our demo sites and Amazon product pages.
- That it gives financial, tax, or investment advice. It gives educational projections.
- That a probability is a guarantee, or quote one as a single number.
- That it "moves money", "pays bills", or "applies for credit" for the user. It suggests only.
- That we use Tiger Data or Vultr. Both were replaced.
- That the AI computes or decides anything. Code computes and decides; the AI words it.
