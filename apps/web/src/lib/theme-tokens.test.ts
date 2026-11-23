import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Guards the two token blocks in globals.css: the light `:root` and `:root[data-theme="dark"]`.
 * A color token added to one and forgotten in the other would silently show a light color in dark
 * mode (or the reverse). Contrast is checked on the dark block here; the chart colors were also
 * validated with the dataviz palette validator (see docs/DECISIONS.md, "Dark mode").
 */

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block is missing from globals.css`);
  const end = css.indexOf("\n}", start);
  const tokens: Record<string, string> = {};
  for (const match of css.slice(start, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

const light = block(":root");
const dark = block(':root[data-theme="dark"]');

const isColor = (value: string) => /^(#|rgba?\()/.test(value);
const hex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

test("every light color token has a dark value", () => {
  const missing = Object.entries(light)
    .filter(([name, value]) => isColor(value) && !(name in dark))
    .map(([name]) => name);
  assert.deepEqual(missing, [], `Add these to :root[data-theme="dark"] in globals.css`);
});

test("the dark block defines nothing the light block does not", () => {
  const orphans = Object.keys(dark).filter((name) => !(name in light));
  assert.deepEqual(orphans, [], "Add these to :root as well, so light has a value");
});

function luminance(color: string): number {
  const channel = (i: number) => {
    const v = parseInt(color.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = "#ffffff";
const pairs: Array<{ fg: string; bg: string; min: number; note: string }> = [
  // Body text, on every surface it sits on
  ...["--surface", "--surface-raised", "--surface-inset"].flatMap((bg) => [
    { fg: "--ink", bg, min: 7, note: "primary text" },
    { fg: "--ink-secondary", bg, min: 4.5, note: "secondary text" },
    { fg: "--ink-muted", bg, min: 4.5, note: "muted text" },
    { fg: "--ink-chart", bg, min: 4.5, note: "chart axis text" },
  ]),
  // Accent
  { fg: "--accent-ink", bg: "--surface-raised", min: 4.5, note: "link on a card" },
  { fg: "--accent-ink", bg: "--surface", min: 4.5, note: "link on the canvas" },
  { fg: "--accent-ink", bg: "--accent-soft", min: 4.5, note: "text on the soft accent" },
  { fg: WHITE, bg: "--accent", min: 4.5, note: "button label" },
  { fg: WHITE, bg: "--chrome", min: 7, note: "sidebar and top bar text" },
  { fg: "--chrome-active-ink", bg: "--chrome-active-bg", min: 4.5, note: "active sidebar row" },
  // Meaning
  { fg: "--gain", bg: "--surface-raised", min: 4.5, note: "gain text" },
  { fg: "--loss", bg: "--surface-raised", min: 4.5, note: "loss text" },
  { fg: "--gain", bg: "--good-bg", min: 4.5, note: "gain on its tint" },
  { fg: "--loss", bg: "--critical-bg", min: 4.5, note: "loss on its tint" },
  { fg: "--warning-text", bg: "--warning-bg", min: 4.5, note: "warning text" },
  { fg: "--info-text", bg: "--info-bg", min: 4.5, note: "info text" },
  // Chart marks need 3:1 against the surface they are drawn on
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ fg: `--series-${n}`, bg: "--surface-raised", min: 3, note: `series ${n}` })),
  { fg: "--good", bg: "--surface-raised", min: 3, note: "income bars (green)" },
  { fg: "--critical", bg: "--surface-raised", min: 3, note: "spending bars (red)" },
  { fg: "--flow-in", bg: "--surface-raised", min: 3, note: "money in" },
  { fg: "--flow-out", bg: "--surface-raised", min: 3, note: "money out" },
  { fg: "--chart-other", bg: "--surface-raised", min: 3, note: "Other slice" },
  { fg: "--fan-line", bg: "--surface-raised", min: 3, note: "fan chart line" },
  // The landing page
  ...["--landing-section-bg", "--landing-surface"].flatMap((bg) => [
    { fg: "--landing-text", bg, min: 7, note: "landing text" },
    { fg: "--landing-text-secondary", bg, min: 4.5, note: "landing secondary text" },
    { fg: "--landing-text-muted", bg, min: 4.5, note: "landing muted text" },
    { fg: "--landing-primary-ink", bg, min: 4.5, note: "landing link" },
  ]),
  { fg: "--landing-primary-dark", bg: "--landing-tint-50", min: 4.5, note: "landing text on the tint" },
  { fg: WHITE, bg: "--landing-primary", min: 4.5, note: "landing button label" },
  { fg: "--landing-warning-text", bg: "--landing-warning-bg", min: 4.5, note: "landing warning" },
  { fg: "--landing-severe-text", bg: "--landing-severe-bg", min: 4.5, note: "landing severe" },
];

test("dark text, landing and chart colors meet contrast on the surfaces they sit on", () => {
  const failures: string[] = [];
  for (const { fg, bg, min, note } of pairs) {
    const fgColor = fg.startsWith("--") ? dark[fg] : fg;
    const bgColor = dark[bg];
    assert.ok(fgColor && hex(fgColor), `${fg} must be a 6-digit hex in the dark block`);
    assert.ok(bgColor && hex(bgColor), `${bg} must be a 6-digit hex in the dark block`);
    const ratio = contrast(fgColor, bgColor);
    if (ratio < min) failures.push(`${note}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
  }
  assert.deepEqual(failures, []);
});

test("surfaces step lighter with elevation: canvas, then inset, then raised", () => {
  assert.ok(luminance(dark["--surface"]) < luminance(dark["--surface-inset"]));
  assert.ok(luminance(dark["--surface-inset"]) < luminance(dark["--surface-raised"]));
});

test("the extension overlay's dark values match the dashboard's dark tokens", () => {
  const overlay = readFileSync(new URL("../../../extension/src/content/overlay.ts", import.meta.url), "utf8");
  const darkCss = overlay.slice(overlay.indexOf("const DARK_STYLES"));
  const value = (name: string) => darkCss.match(new RegExp(`--${name}: *(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();
  // overlay variable -> the dashboard token it mirrors
  const mirrors: Record<string, string> = {
    surface: "--surface-inset",
    raised: "--surface-raised",
    border: "--border",
    ink: "--ink",
    muted: "--ink-chart",
    "accent-ink": "--accent-ink",
    good: "--gain",
    warn: "--warning-text",
    danger: "--loss",
  };
  for (const [name, token] of Object.entries(mirrors)) {
    assert.equal(value(name), dark[token]?.toLowerCase(), `overlay --${name} should equal the dashboard ${token}`);
  }
});

test("light text tokens meet 4.5:1 on every surface they sit on", () => {
  const failures: string[] = [];
  const surfaces = ["--surface", "--surface-raised", "--surface-inset", "--accent-soft"];
  for (const fg of ["--ink", "--ink-secondary", "--ink-muted", "--ink-chart"]) {
    for (const bg of surfaces) {
      const ratio = contrast(light[fg], light[bg]);
      if (ratio < 4.5) failures.push(`${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
    }
  }
  assert.deepEqual(failures, []);
});

test("money in and out are the same green and red as good and critical, in both themes", () => {
  for (const [name, block] of [["light", light], ["dark", dark]] as const) {
    assert.equal(block["--flow-in"], block["--good"], `${name}: --flow-in should equal --good`);
    assert.equal(block["--flow-out"], block["--critical"], `${name}: --flow-out should equal --critical`);
  }
});

test("info text is readable on its tint in light too", () => {
  assert.ok(contrast(light["--info-text"], light["--info-bg"]) >= 4.5);
});
