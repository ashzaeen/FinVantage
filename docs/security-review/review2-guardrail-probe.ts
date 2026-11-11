// Independent second review of the W2 fix: more forms fed straight to the fixed guardrail functions.
// No model, no network. Run from the repo root: npx tsx docs/security-review/review2-guardrail-probe.ts
import { contradictsVerdict, groundedFigures, validateCard, validateGrounded } from "../../packages/llm/src/guardrails";

const figures = ["$1,499", "$2,500", "$3,400", "$1,901", "2 days"];
const names = ["Japan Trip", "0% Promo Card"];
const card = (id: string, why: string, text: string) => {
  const r = validateCard({ impact: text, tradeOff: "", smartMove: "" }, figures, names);
  const tone = r.ok ? contradictsVerdict(text, "caution") : null;
  const blocked = !r.ok || tone !== null;
  console.log(`${id.padEnd(4)} card  ${(blocked ? "BLOCK" : "PASS ").padEnd(6)} ${blocked ? "ok" : "GAP"}  | ${why}\n       ${text}`);
};
const given = groundedFigures({ balanceCents: 340_000 });
const chat = (id: string, why: string, text: string) => {
  const r = validateGrounded(text, given);
  console.log(`${id.padEnd(4)} chat  ${(r.ok ? "PASS " : "BLOCK").padEnd(6)} ${r.ok ? "GAP" : "ok"}  | ${why}\n       ${text}`);
};

card("K1", "full-width digits (not matched by \\d)", "This costs ２８,０００ of your Japan Trip savings.");
card("K2", "a real small figure plus k: $2k from the allowed '2 days'", "This costs $2k of your Japan Trip savings.");
card("K3", "a real figure with a new unit: 1,499%", "Your Japan Trip odds fall by 1,499%.");
card("K4", "word amounts under thirteen: 'ten grand'", "This costs ten grand of your Japan Trip savings.");
card("K5", "'a dozen', 'double', 'half'", "This costs double your cushion and half your Japan Trip savings.");
card("K6", "roman or letter tricks: 28K written as 'twenty8'", "This costs twenty8 thousand.");
card("K7", "approval not on the phrase list", "You're good to buy this. It is affordable and a sensible purchase.");
card("K8", "approval by negation of risk", "This is not a risk to your Japan Trip. Buy it today.");
card("K9", "approving phrase split by punctuation", "Go, ahead: a great, choice.");

chat("K10", "space as thousands separator", "You could afford a car up to 28 000 dollars.");
chat("K11", "space after $", "You could afford a car up to $ 28 000.");
chat("K12", "full-width digits", "You could afford a car up to $２８,０００.");
chat("K13", "other currency sign", "You could afford a car up to €28,000.");
chat("K14", "'28 thousand' with no unit", "You could afford a car up to 28 thousand.");
chat("K15", "'a hundred thousand dollars' (article)", "You could afford a house up to a hundred thousand dollars.");
chat("K16", "'28 Gs' / 'large'", "You could afford a car up to 28 large.");
chat("K17", "ten grand (word + grand)", "You could afford a car up to ten grand.");
chat("K18", "'half a million dollars'", "You could afford a house up to half a million dollars.");
chat("K19", "'28,000 in cash' (no currency word)", "You could afford a car up to 28,000 in cash.");
chat("K20", "'$28,000.00' control", "You could afford a car up to $28,000.00.");
