// Independent review probe (second reviewer). Runs the real API in process with the mock model,
// in-memory stores and a recording mailer: no network, no Gemini, nothing sent anywhere.
// Run from the repo root: npx tsx docs/security-review/review2-probe.ts
import { routes } from "../../packages/contracts/src/api";
import { createApp } from "../../apps/api/src/app";
import { createDeps } from "../../apps/api/src/deps";
import * as guardrails from "../../packages/llm/src/guardrails";

const deps = createDeps({ REPORT_OUTPUT_DIR: "/tmp/finvantage-review2" });
const sentTo: string[] = [];
deps.mail = { sendReport: async ({ to }: { to: string }) => (sentTo.push(to), { messageId: `m${sentTo.length}` }) } as unknown as typeof deps.mail;
const app = createApp(deps, {});

let ipCounter = 0;
/** Each call gets its own address unless one is given, so rate limits don't hide other results. */
async function call(token: string, method: string, path: string, body?: unknown, ip?: string) {
  const headers: Record<string, string> = { "x-forwarded-for": ip ?? `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}` };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* binary or empty */ }
  return { status: res.status, json };
}
const guest = async () => (await call("", "POST", "/auth/guest")).json.token as string;
const section = (title: string) => console.log(`\n=== ${title} ===`);
const row = (ok: boolean, label: string, detail = "") => console.log(`${ok ? "ok  " : "FLAG"} ${label}${detail ? `  ->  ${detail}` : ""}`);

async function main() {
  // ---------------------------------------------------------------- A. demo token allowlist
  section("A. Shared demo token: every write route in the contract table");
  const ALLOWED = new Set(["POST /v1/copilot/evaluate", "POST /v1/copilot/events/:id/action"]);
  let refused = 0;
  const leaks: string[] = [];
  for (const [name, r] of Object.entries(routes) as Array<[string, { method: string; path: string }]>) {
    if (r.method === "GET" || !r.path.startsWith("/v1/")) continue;
    const res = await call("demo-token", r.method, r.path.replace(/:\w+/g, "x"), {});
    if (ALLOWED.has(`${r.method} ${r.path}`)) continue;
    if (res.status === 403 && res.json?.error?.code === "demo_read_only") refused++;
    else leaks.push(`${name} ${r.method} ${r.path} -> ${res.status}`);
  }
  row(leaks.length === 0, `${refused} write routes refused with 403 demo_read_only`, leaks.join("; "));

  section("A2. Path and method tricks against the allowlist (demo token)");
  for (const [method, path, extra] of [
    ["POST", "/v1/goals/", {}],
    ["POST", "/v1//goals", {}],
    ["POST", "/V1/goals", {}],
    ["POST", "/v1/goals?x=/v1/copilot/evaluate", {}],
    ["POST", "/v1/copilot/evaluate/../goals", {}],
    ["POST", "/v1/copilot/events/x/action/../../../goals", {}],
    ["POST", "/v1/copilot/evaluate%2f..%2fgoals", {}],
    ["GET", "/v1/goals", { "x-http-method-override": "POST" }],
  ] as Array<[string, string, Record<string, string>]>) {
    const before = (await call("demo-token", "GET", "/v1/goals")).json.length;
    const res = await app.request(path, {
      method,
      headers: { authorization: "Bearer demo-token", "content-type": "application/json", ...extra },
      body: method === "GET" ? undefined : JSON.stringify({ name: "trick", targetCents: 100, currentCents: 0, targetDate: "2027-01-01", priorityRank: 1, flexibility: "flexible", linkedAccountId: null }),
    });
    const after = (await call("demo-token", "GET", "/v1/goals")).json.length;
    row(after === before, `${method} ${path}${Object.keys(extra).length ? " + override header" : ""}`, `HTTP ${res.status}, demo goals ${before} -> ${after}`);
  }

  section("A3. Do any GET routes change the shared demo user's data?");
  const snapshot = async () => {
    const parts = [];
    for (const p of ["/v1/goals", "/v1/accounts", "/v1/life-events", "/v1/advisory/conversations", "/v1/reports/quarterly", "/v1/simulations", "/v1/copilot/events", "/v1/budgets", "/v1/reports/schedule", "/v1/life-simulator/scenarios", "/v1/advisory/recommendations", "/v1/me"]) {
      parts.push(JSON.stringify((await call("demo-token", "GET", p)).json));
    }
    return parts;
  };
  const beforeGets = await snapshot();
  for (const r of Object.values(routes) as Array<{ method: string; path: string }>) {
    if (r.method === "GET" && r.path.startsWith("/v1/")) await call("demo-token", "GET", r.path.replace(/:\w+/g, "x"));
  }
  await call("demo-token", "GET", "/v1/reports/quarterly/x/pdf");
  const afterGets = await snapshot();
  row(beforeGets.every((s, i) => s === afterGets[i]), "demo user's data identical before and after calling every GET route");

  // ---------------------------------------------------------------- B. cross-user access by ID
  section("B. Guest B uses guest A's record IDs (and the demo user's)");
  const A = await guest();
  const B = await guest();
  const goalsA = (await call(A, "GET", "/v1/goals")).json;
  const accountsA = (await call(A, "GET", "/v1/accounts")).json;
  const txA = (await call(A, "GET", "/v1/transactions?limit=3")).json;
  const eventsA = (await call(A, "GET", "/v1/life-events")).json;
  const convA = (await call(A, "POST", "/v1/advisory/conversations", {})).json;
  const simA = (await call(A, "POST", "/v1/simulations", { persist: true, seed: 7 })).json;
  const repA = (await call(A, "POST", "/v1/reports/quarterly", { email: false })).json;
  await call(A, "POST", "/v1/copilot/evaluate", { pageType: "checkout", itemType: "retail_purchase", priceCents: 149_900, merchant: "Demo Electronics" });
  const copA = (await call(A, "GET", "/v1/copilot/events")).json;
  const catA = (await call(A, "POST", "/v1/spending/categories", { parentId: "shopping", label: "Review Two" })).json;
  const scnA = (await call(A, "GET", "/v1/life-simulator/scenarios")).json;
  const demoGoal = (await call("demo-token", "GET", "/v1/goals")).json[0];
  const strip = ({ id: _i, userId: _u, ...rest }: any) => rest;
  const before = JSON.stringify([await call(A, "GET", "/v1/goals"), await call(A, "GET", "/v1/accounts"), await call("demo-token", "GET", "/v1/goals")].map((r) => r.json));

  const attempts: Array<[string, string, unknown?]> = [
    ["PATCH", `/v1/goals/${goalsA[0].id}`, { ...strip(goalsA[0]), name: "changed by B" }],
    ["DELETE", `/v1/goals/${goalsA[0].id}`],
    ["PATCH", `/v1/goals/${demoGoal.id}`, { ...strip(demoGoal), name: "changed by B" }],
    ["DELETE", `/v1/goals/${demoGoal.id}`],
    ["PATCH", `/v1/accounts/${accountsA[0].id}`, { ...strip(accountsA[0]), name: "changed by B" }],
    ["PATCH", `/v1/transactions/${txA[0]?.id}`, strip(txA[0] ?? {})],
    ["PATCH", `/v1/transactions/${txA[0]?.id}/category`, { categoryId: "groceries" }],
    ["DELETE", `/v1/life-events/${eventsA[0]?.id}`],
    ["GET", `/v1/advisory/conversations/${convA.id}`],
    ["POST", `/v1/advisory/conversations/${convA.id}/messages`, { content: "hello" }],
    ["DELETE", `/v1/advisory/conversations/${convA.id}`],
    ["GET", `/v1/simulations/${simA.id}`],
    ["GET", `/v1/simulations/${simA.id}/diff/${simA.id}`],
    ["GET", `/v1/reports/quarterly/${repA.id}`],
    ["GET", `/v1/reports/quarterly/${repA.id}/pdf`],
    ["POST", `/v1/reports/quarterly/${repA.id}/email`, {}],
    ["POST", `/v1/copilot/events/${copA[0]?.id}/action`, { action: "dismissed" }],
    ["DELETE", `/v1/copilot/events/${copA[0]?.id}`],
    ["PATCH", `/v1/spending/categories/${catA.id}`, { label: "changed by B" }],
    ["DELETE", `/v1/spending/categories/${catA.id}`],
    ...(scnA[0] ? ([["GET", `/v1/life-simulator/scenarios/${scnA[0].id}`], ["DELETE", `/v1/life-simulator/scenarios/${scnA[0].id}`]] as Array<[string, string]>) : []),
  ];
  for (const [method, path, body] of attempts) {
    const res = await call(B, method, path, body);
    row(res.status >= 400, `B ${method} ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<uuid>")}`, `HTTP ${res.status} ${res.json?.error?.code ?? ""}`);
  }
  const after = JSON.stringify([await call(A, "GET", "/v1/goals"), await call(A, "GET", "/v1/accounts"), await call("demo-token", "GET", "/v1/goals")].map((r) => r.json));
  row(before === after, "A's goals and accounts and the demo user's goals are unchanged");
  row((await call(A, "GET", `/v1/advisory/conversations/${convA.id}`)).status === 200, "A's conversation still exists");

  // ---------------------------------------------------------------- C. guardrails
  section("C. Card guardrail (validateCard), figures allowed: $1,499  $599  $2,500  22.99%");
  const figures = ["$1,499", "$599", "$2,500", "22.99%"];
  const card = (label: string, impact: string, names: string[] = ["Japan Trip"]) => {
    const r = guardrails.validateCard({ impact, tradeOff: "", smartMove: "" }, figures, names);
    row(!r.ok, label, `"${impact}" ${r.ok ? "PASSES" : `blocked (${r.reason})`}`);
  };
  card("C1 a short name deletes digits from an invented figure", "This costs $71,499 of your 7 goal.", ["7"]);
  card("C2 a one-digit name next to a separator", "This costs $7,599 of your 7 goal.", ["7"]);
  card("C3 unit suffix after an allowed figure (k)", "This costs $1,499k of your Japan Trip.");
  card("C4 unit suffix after an allowed figure (M)", "This costs $2,500M of your Japan Trip.");
  card("C5 'grand' after an allowed figure", "This costs 599 grand of your Japan Trip.");
  card("C6 allowed digits regrouped with commas", "This costs $14,99 of your Japan Trip.");
  card("C7 full-width digits", "This costs $９９,９９９ of your Japan Trip.");
  card("C8 an allowed number with a different unit", "Your Japan Trip slips 599 months.");
  card("C9 two allowed figures glued with a decimal point", "This costs $599.2500 of your Japan Trip.");

  section("C'. Chat guardrail (validateGrounded), figure given: $3,400");
  const given = guardrails.groundedFigures({ balanceCents: 340_000 });
  const chat = (label: string, text: string) => {
    const r = guardrails.validateGrounded(text, given);
    row(!r.ok, label, `"${text}" ${r.ok ? "PASSES" : "blocked"}`);
  };
  chat("C10 'N thousand' with no currency word", "You could spend up to 28 thousand on the car.");
  chat("C11 full-width digits after $", "You could spend up to $２８,０００ on the car.");
  chat("C12 space inside the amount", "You could spend up to $ 28 000 on the car.");
  chat("C13 'K' with a space", "You could spend up to 28 K on the car.");
  chat("C14 other currency sign", "You could spend up to €28,000 on the car.");
  chat("C15 'a hundred grand'", "You could spend a hundred grand on the car.");

  // ---------------------------------------------------------------- D. email
  section("D. Email: unverified sign-up address + no limit on sends");
  const victim = "someone-else@example.com";
  const su = await call("", "POST", "/auth/signup", { displayName: "Not Them", email: victim, password: "s3cret-pass" });
  const rep = (await call(su.json.token, "POST", "/v1/reports/quarterly", { email: false })).json;
  let okSends = 0;
  for (let i = 0; i < 40; i++) if ((await call(su.json.token, "POST", `/v1/reports/quarterly/${rep.id}/email`, {}, "203.0.113.50")).status === 200) okSends++;
  row(sentTo.filter((t) => t === victim).length === 0, `signed up as ${victim} without owning it, then asked for 40 emails from one address`, `${okSends} accepted, ${sentTo.filter((t) => t === victim).length} handed to the mailer for ${victim}`);

  // ---------------------------------------------------------------- E. rate limits
  section("E. Rate limits");
  await call("", "POST", "/auth/signup", { displayName: "Sam", email: "sam@example.com", password: "s3cret-pass" });
  const statuses = new Map<number, number>();
  for (let i = 0; i < 40; i++) {
    const s = (await call("", "POST", "/auth/login", { email: "sam@example.com", password: `guess-${i}-pass` }, `198.51.100.${i}`)).status;
    statuses.set(s, (statuses.get(s) ?? 0) + 1);
  }
  row(statuses.has(429), "E1 40 wrong passwords for ONE account, a different X-Forwarded-For each time", [...statuses].map(([s, n]) => `${n}x ${s}`).join(", "));

  const g = await guest();
  const sims = new Map<number, number>();
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) {
    const s = (await call(g, "POST", "/v1/simulations", { persist: true, seed: i }, "203.0.113.60")).status;
    sims.set(s, (sims.get(s) ?? 0) + 1);
  }
  const stored = (await call(g, "GET", "/v1/simulations")).json.length;
  row(sims.has(429), "E2 40 saved simulation runs from one guest and one address (CPU + memory, no model)", `${[...sims].map(([s, n]) => `${n}x ${s}`).join(", ")} in ${Date.now() - t0}ms, ${stored} runs stored`);

  const big = "A".repeat(2_000_000);
  const goal = { name: big, targetCents: 100, currentCents: 0, targetDate: "2027-01-01", priorityRank: 9, flexibility: "flexible", linkedAccountId: null };
  const bigRes = await call(g, "POST", "/v1/goals", goal);
  row(bigRes.status >= 400, "E3 a goal whose name is 2,000,000 characters", `HTTP ${bigRes.status}${bigRes.status === 200 ? `, stored name length ${bigRes.json.name.length}` : ""}`);
}

void main().then(() => process.exit(0));
