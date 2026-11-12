// W2 probe: feeds hand-written inputs straight into the real guardrail functions.
// No model, no network, deterministic. Run from the repo root: npx tsx docs/security-review/w2-probe.ts
import * as guardrails from "../../packages/llm/src/guardrails";
const { groundedFigures, validateCard, validateGrounded } = guardrails;

type Row = { id: string; check: string; input: string; expect: "BLOCK" | "PASS"; got: "BLOCK" | "PASS"; why: string };
const rows: Row[] = [];

// A realistic allowlist for a $1,499 laptop with verdict "caution" (figures the math core produced).
const figures = ["$1,499", "$2,500", "$3,400", "$1,901"];

// The card checks the app runs, in order (packages/llm/src/copilot-card.ts). Before the W2 fix,
// names went onto the figures list and there was no tone check; after it, names are passed
// separately and a caution verdict is checked for approving phrases. The probe runs whichever
// version of the code is checked out.
const fixed = typeof (guardrails as Record<string, unknown>).contradictsVerdict === "function";
function cardPipeline(text: { impact: string; tradeOff: string; smartMove: string }, allowed: string[], names: string[], verdict: string) {
  if (!fixed) return validateCard(text, [...allowed, ...names]);
  const r = (validateCard as (c: typeof text, a: string[], n: string[]) => ReturnType<typeof validateCard>)(text, allowed, names);
  if (!r.ok) return r;
  const contradicts = (guardrails as unknown as { contradictsVerdict: (t: string, v: string) => string | null }).contradictsVerdict;
  const phrase = contradicts(`${text.impact} ${text.tradeOff} ${text.smartMove}`, verdict);
  return phrase ? { ok: false as const, reason: `tone: "${phrase}" on a caution verdict` } : { ok: true as const };
}
const names = ["Japan Trip", "0% Promo Card"];
function card(id: string, expect: Row["expect"], why: string, impact: string, tradeOff = "", smartMove = "", extraNames: string[] = []) {
  const r = cardPipeline({ impact, tradeOff, smartMove }, figures, [...names, ...extraNames], "caution");
  rows.push({ id, check: "card pipeline", input: `${impact} ${tradeOff} ${smartMove}`.trim(), expect, got: r.ok ? "PASS" : "BLOCK", why: r.ok ? why : `${why} [${r.reason}]` });
}

// --- Controls: should behave the same before and after the fix ---
card("C1", "BLOCK", "invented dollar figure", "This $1,499 laptop costs $9,999 of your Japan Trip savings.");
card("C2", "BLOCK", "over 60 words", Array(61).fill("word").join(" "));
card("C3", "PASS", "only approved figures, comma formatting normalized", "Buying this $1499 laptop drops checking to $1,901, under your $2,500 cushion.");

// --- W2 gaps on the Copilot card ---
card("G1", "BLOCK", "spelled-out amount not on the list", "This laptop would cost you twenty-eight thousand dollars of your Japan Trip goal.");
card("G2", "BLOCK", "verdict is caution, but text is encouraging and has no digits", "Great choice. This fits your Japan Trip plans perfectly, go ahead and buy it.");
card("G3", "BLOCK", "digits in a user-written goal name get approved", "This laptop puts $2,000 of your Trip 2000 goal at risk.", "", "", ["Trip 2000"]);
card("C8", "PASS", "a name with digits is still fine where it is written", "Put the rest on your 0% Promo Card to protect your Japan Trip and $2,500 cushion.");

// --- Advisor chat check (dollar amounts only, by design) ---
const allowed = groundedFigures({ balanceCents: 340000, goalTargetCents: 1000000, savingsRate: 0.318 });
function chat(id: string, expect: Row["expect"], why: string, text: string) {
  const r = validateGrounded(text, allowed);
  rows.push({ id, check: "validateGrounded", input: text, expect, got: r.ok ? "PASS" : "BLOCK", why: r.ok ? why : `${why} [${r.reason}]` });
}
chat("C4", "BLOCK", "invented $ amount", "You could afford a car up to $28,000 based on your savings.");
chat("C5", "BLOCK", "invented 'N dollars' amount", "You could afford a car up to 28000 dollars based on your savings.");
chat("C6", "PASS", "rounded real figure within 3%", "Your checking holds about $3,400 right now.");
chat("C7", "PASS", "percentages are out of scope by design", "Try to keep utilization under 30% of your limit.");
chat("G4", "BLOCK", "'grand' is a dollar amount", "You could afford a car up to 28 grand based on your savings.");
chat("G5", "BLOCK", "spelled-out dollar amount", "You could afford a car up to twenty-eight thousand dollars.");
chat("G6", "BLOCK", "'k' shorthand without a $ sign", "You could afford a car up to 28k based on your savings.");
chat("G7", "BLOCK", "currency code instead of $ sign", "You could afford a car up to USD 28,000 based on your savings.");

for (const r of rows) {
  const status = r.got === r.expect ? "as expected" : r.id.startsWith("C") ? "CONTROL FAILED" : "GAP CONFIRMED";
  console.log(`${r.id.padEnd(3)} ${r.check.padEnd(16)} expect=${r.expect.padEnd(5)} got=${r.got.padEnd(5)} ${status.padEnd(14)} | ${r.why}`);
  console.log(`    input: ${r.input.length > 110 ? r.input.slice(0, 110) + "…" : r.input}`);
}
