// W4 probe: does the API slow down or refuse a quick burst of requests? Local API only.
// Small on purpose (25 per route) and cheap: wrong-password logins and guest sessions never call
// the model, and the repeated Copilot request is served from the card cache after the first call.
// Run from the repo root with the API up: npx tsx docs/security-review/w4-burst-probe.ts [count]
const API = "http://localhost:4000";
const BURST = Number(process.argv[2] ?? 25);

async function burst(label: string, send: () => Promise<Response>) {
  const counts = new Map<number, number>();
  const started = Date.now();
  for (let i = 0; i < BURST; i++) {
    const res = await send();
    await res.arrayBuffer();
    counts.set(res.status, (counts.get(res.status) ?? 0) + 1);
  }
  const summary = [...counts].map(([status, n]) => `${n}x HTTP ${status}`).join(", ");
  console.log(`${label.padEnd(44)} ${summary.padEnd(28)} ${counts.has(429) ? "LIMITED" : "no limit hit"} (${Date.now() - started}ms)`);
}

async function main() {
  console.log("API:", JSON.stringify(await (await fetch(`${API}/health`)).json()), `| ${BURST} requests per row, one at a time`);
  const json = { "content-type": "application/json" };

  await burst("POST /auth/login (wrong password)", () =>
    fetch(`${API}/auth/login`, { method: "POST", headers: json, body: JSON.stringify({ email: "nobody@example.com", password: "wrong-pass-123" }) }),
  );
  // Made before the guest burst, which (after the fix) uses up this address's guest sessions.
  const guest = ((await (await fetch(`${API}/auth/guest`, { method: "POST" })).json()) as { token: string }).token;
  await burst("POST /auth/guest (new demo copy each)", () => fetch(`${API}/auth/guest`, { method: "POST" }));

  const context = { pageType: "checkout", itemType: "retail_purchase", priceCents: 149_900, merchant: "Demo Electronics" };
  await burst("POST /v1/copilot/evaluate (same guest)", () =>
    fetch(`${API}/v1/copilot/evaluate`, { method: "POST", headers: { ...json, authorization: `Bearer ${guest}` }, body: JSON.stringify(context) }),
  );
}

void main();
