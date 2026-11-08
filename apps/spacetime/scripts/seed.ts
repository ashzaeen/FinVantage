// Loads the demo profile (packages/data/fixtures/planner.json, bank data in Plaid's format) into
// the Maincloud database through the `load_profile` reducer. Uses your `spacetime login` token,
// which must be an admin (the identity that first published the module). The token is never
// printed.
//
//   npm run seed:maincloud -w @finvantage/spacetime
//
// Env overrides: SPACETIME_HOST (default https://maincloud.spacetimedb.com), SPACETIME_DB,
// SPACETIME_TOKEN.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadDemoProfileSource, loadProfileArgs } from "@finvantage/data";

const host = process.env.SPACETIME_HOST ?? "https://maincloud.spacetimedb.com";
const db = process.env.SPACETIME_DB ?? "finvantage";

function spacetimeToken(): string {
  if (process.env.SPACETIME_TOKEN) return process.env.SPACETIME_TOKEN;
  const bin = process.platform === "win32" ? join(homedir(), "AppData/Local/SpacetimeDB/spacetime.exe") : "spacetime";
  const out = execFileSync(bin, ["login", "show", "--token"], { encoding: "utf8" });
  const match = out.match(/is (\S+)\s*$/m);
  if (!match?.[1]) throw new Error("Could not read a token from `spacetime login show --token`.");
  return match[1];
}

const source = loadDemoProfileSource();
const res = await fetch(`${host}/v1/database/${db}/call/load_profile`, {
  method: "POST",
  headers: { authorization: `Bearer ${spacetimeToken()}`, "content-type": "application/json" },
  body: JSON.stringify(loadProfileArgs(source)),
});
if (!res.ok) {
  console.error(`load_profile failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const accounts = source.bank.reduce((n, item) => n + item.accounts.length, 0);
const transactions = source.bank.reduce((n, item) => n + item.transactions.length, 0);
console.log(
  `Seeded ${source.user.id} into ${db}: ${source.bank.length} bank items, ${accounts} accounts, ` +
    `${transactions} transactions, ${source.balanceHistory.length} balance snapshots.`,
);
