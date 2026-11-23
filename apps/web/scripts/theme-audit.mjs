// Counts hardcoded colors in the web app's source and fails if any file has more than its baseline.
//
//   npm run theme:audit -w @finvantage/web            check against scripts/theme-baseline.json
//   npm run theme:audit -w @finvantage/web -- --update   rewrite the baseline (after converting files)
//
// Components should use tokens (bg-raised, text-ink, var(--accent)) so dark mode can retheme them.
// This is a ratchet: counts may only go down. A color that must stay fixed in both themes gets a `theme-ok` comment on its line and is not counted.
// A whole file of fixed colors, such as card artwork, says `theme-ok-file` once.

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const baselinePath = join(root, "scripts", "theme-baseline.json");

// What counts as a hardcoded color. Token classes (bg-raised) and var(--x) never match.
const PATTERNS = [
  /\b(?:bg|border|from|to|via|ring|divide|fill|stroke|outline)-(?:white|black)(?:\/\d+)?\b/g, // bg-white, border-black/10
  /\btext-black\b/g,
  /#[0-9a-fA-F]{3,8}\b/g, // #fff, #544af7, #544af7cc
  /\b(?:rgba?|hsla?)\(/g, // rgba(...), hsl(...)
];

// Generated code and tests are not UI.
const SKIP_DIRS = new Set(["spacetime", "node_modules", ".next"]);
const isSource = (name) => /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(path, out);
    } else if (isSource(name)) out.push(path);
  }
  return out;
}

function countFile(path) {
  let count = 0;
  const text = readFileSync(path, "utf8");
  // A file of fixed colors, such as card artwork, says so once.
  if (text.includes("theme-ok-file")) return 0;
  for (const line of text.split("\n")) {
    if (line.includes("theme-ok")) continue;
    for (const pattern of PATTERNS) count += (line.match(pattern) ?? []).length;
  }
  return count;
}

const counts = {};
for (const file of walk(src)) {
  // globals.css holds the tokens themselves, and the landing page keeps its own set until phase 4.
  const rel = relative(root, file).split(sep).join("/");
  if (rel === "src/app/globals.css") continue;
  const n = countFile(file);
  if (n > 0) counts[rel] = n;
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (process.argv.includes("--update")) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Baseline written: ${total} hardcoded colors in ${Object.keys(counts).length} files.`);
  process.exit(0);
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
const worse = [];
const better = [];
for (const file of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
  const now = counts[file] ?? 0;
  const was = baseline[file] ?? 0;
  if (now > was) worse.push(`  ${file}: ${was} -> ${now}`);
  else if (now < was) better.push(`  ${file}: ${was} -> ${now}`);
}

console.log(`Hardcoded colors: ${total} in ${Object.keys(counts).length} files.`);
if (better.length) console.log(`Down since the baseline (run with --update to lock it in):\n${better.join("\n")}`);
if (worse.length) {
  console.error(`\nMore hardcoded colors than the baseline. Use a token instead (bg-raised, text-ink, var(--accent)):\n${worse.join("\n")}`);
  console.error("If a color must be the same in both themes, add a `theme-ok` comment on that line.");
  process.exit(1);
}
