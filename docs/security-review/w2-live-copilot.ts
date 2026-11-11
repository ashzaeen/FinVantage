// W2 live check: asks the local API for real Copilot cards (Gemini on) and reports which ones
// Gemini wrote and which fell back to the template. Local only; 8 requests, one at a time.
// Run from the repo root with the API up: npx tsx docs/security-review/w2-live-copilot.ts
const API = "http://localhost:4000";

const cases = [
  { pageType: "checkout", itemType: "retail_purchase", priceCents: 149_900, merchant: "Demo Electronics" },
  { pageType: "checkout", itemType: "retail_purchase", priceCents: 369_900, merchant: "Demo Electronics" },
  { pageType: "checkout", itemType: "retail_purchase", priceCents: 8_900, merchant: "Demo Electronics" },
  { pageType: "checkout", itemType: "retail_purchase", priceCents: 45_000, merchant: "Demo Electronics" },
  { pageType: "rental", itemType: "rent_monthly", priceCents: 195_000, merchant: "Demo Rentals" },
  { pageType: "rental", itemType: "rent_monthly", priceCents: 120_000, merchant: "Demo Rentals" },
  { pageType: "vehicle_financing", itemType: "vehicle", priceCents: 2_800_000, merchant: "Demo Motors" },
  { pageType: "vehicle_financing", itemType: "vehicle", priceCents: 1_800_000, merchant: "Demo Motors" },
] as const;

async function main() {
  // A fresh guest session, as a real signed-out visitor gets.
  const guest = (await (await fetch(`${API}/auth/guest`, { method: "POST" })).json()) as { token: string };
  const headers = { authorization: `Bearer ${guest.token}`, "content-type": "application/json" };
  for (const context of cases) {
    const started = Date.now();
    const res = await fetch(`${API}/v1/copilot/evaluate`, { method: "POST", headers, body: JSON.stringify(context) });
    const body = (await res.json()) as { card?: { source: string; impact: string; tradeOff: string; smartMove: string }; metrics?: { verdict: string } };
    const card = body.card;
    console.log(
      `${context.pageType.padEnd(17)} $${(context.priceCents / 100).toLocaleString("en-US").padEnd(7)} ` +
        `HTTP ${res.status}  verdict=${(body.metrics?.verdict ?? "?").padEnd(7)} source=${(card?.source ?? "?").padEnd(8)} ${Date.now() - started}ms`,
    );
    if (card) console.log(`    "${card.impact} ${card.tradeOff} ${card.smartMove}"`);
  }
}

void main();
