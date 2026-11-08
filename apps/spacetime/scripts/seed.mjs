// Loads the demo profile (packages/data/fixtures/planner.json) into the Maincloud database by
// calling the `load_profile` reducer over HTTP. Uses your `spacetime login` token, which must be
// an admin (the identity that first published the module). The token is never printed.
//
//   npm run seed:maincloud -w @finvantage/spacetime
//
// Env overrides: SPACETIME_HOST (default https://maincloud.spacetimedb.com), SPACETIME_DB.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const host = process.env.SPACETIME_HOST ?? "https://maincloud.spacetimedb.com";
const db = process.env.SPACETIME_DB ?? "finvantage";
const fixture = JSON.parse(
  readFileSync(new URL("../../../packages/data/fixtures/planner.json", import.meta.url), "utf8"),
);

function spacetimeToken() {
  if (process.env.SPACETIME_TOKEN) return process.env.SPACETIME_TOKEN;
  const local = join(homedir(), "AppData/Local/SpacetimeDB/spacetime.exe");
  const bin = process.platform === "win32" ? local : "spacetime";
  const out = execFileSync(bin, ["login", "show", "--token"], { encoding: "utf8" });
  const match = out.match(/is (\S+)\s*$/m);
  if (!match) throw new Error("Could not read a token from `spacetime login show --token`.");
  return match[1];
}

// SATS-JSON: options are { some: value } or { none: [] }.
const opt = (value) => (value === null || value === undefined ? { none: [] } : { some: value });
const { user, income, accounts, goals, transactions } = fixture;

const args = {
  user: {
    id: user.id,
    displayName: user.displayName,
    email: opt(user.email),
    bufferTargetCents: user.preferences.bufferTargetCents,
    extensionEnabled: user.extensionSettings.enabled,
    snoozedSites: user.extensionSettings.snoozedSites,
  },
  income: { userId: user.id, ...income },
  accounts: accounts.map((a) => ({
    id: a.id,
    userId: user.id,
    type: a.type,
    loanKind: opt(a.loanKind),
    name: a.name,
    institution: a.institution,
    balanceCents: a.balanceCents,
    annualRate: opt(a.annualRate),
    minimumPaymentCents: opt(a.minimumPaymentCents),
    promoRateEndsOn: opt(a.promoRateEndsOn),
  })),
  goals: goals.map((g) => ({
    id: g.id,
    userId: user.id,
    name: g.name,
    targetCents: g.targetCents,
    currentCents: g.currentCents,
    targetDate: g.targetDate,
    priorityRank: g.priorityRank,
    flexibility: g.flexibility,
    linkedAccountId: opt(g.linkedAccountId),
  })),
  transactions: transactions.map((tx) => ({
    id: tx.id,
    accountId: tx.accountId,
    date: tx.date,
    amountCents: tx.amountCents,
    merchant: tx.merchant,
    category: opt(tx.category),
    isRecurring: tx.isRecurring,
  })),
};

// Spacetime's wire format uses snake_case field names (`display_name`), while the module code
// uses camelCase. Convert every object key.
const snake = (value) =>
  Array.isArray(value)
    ? value.map(snake)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), snake(v)]),
        )
      : value;

const res = await fetch(`${host}/v1/database/${db}/call/load_profile`, {
  method: "POST",
  headers: { authorization: `Bearer ${spacetimeToken()}`, "content-type": "application/json" },
  body: JSON.stringify(snake([args.user, args.income, args.accounts, args.goals, args.transactions])),
});
if (!res.ok) {
  console.error(`load_profile failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(
  `Seeded ${user.id} into ${db}: ${accounts.length} accounts, ${goals.length} goals, ${transactions.length} transactions.`,
);
