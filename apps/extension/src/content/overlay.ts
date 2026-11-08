import type { CopilotCard, CopilotMetrics } from "@finvantage/contracts";

export interface OverlayHandlers {
  onDismiss: () => void;
  onSnooze: () => void;
  onOpen: () => void;
}

type Headline = CopilotMetrics["headline"];
type Tone = "warn" | "ok" | "info";

/*
 * Colors mirror the dashboard tokens in apps/web/src/app/globals.css, so the card reads as
 * part of FinVantage. If design changes those tokens, change them here too.
 */
const STYLES = `
  :host { all: initial; }
  .wrap {
    --surface: #fbfaf7; --raised: #ffffff; --border: #e4e1d8; --ink: #1d1d1b; --muted: #66645d;
    --accent: #2563a8; --good: #2c7a4b; --critical: #b3392f; --track: #ece9e1;
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    .wrap {
      --surface: #161614; --raised: #1f1f1c; --border: #35342f; --ink: #f1efe9; --muted: #a5a299;
      --accent: #7fb0e6; --good: #6cc48f; --critical: #ef8e84; --track: #2c2b27;
    }
  }
  * { box-sizing: border-box; font: inherit; color: inherit; margin: 0; }
  .wrap[data-tone="warn"] { --tone: var(--critical); }
  .wrap[data-tone="ok"] { --tone: var(--good); }
  .wrap[data-tone="info"] { --tone: var(--accent); }

  .badge {
    display: flex; align-items: center; gap: 8px; max-width: min(360px, calc(100vw - 32px));
    border: 1px solid var(--border); border-radius: 999px; background: var(--raised);
    padding: 9px 14px 9px 12px; cursor: pointer; box-shadow: 0 4px 18px rgb(0 0 0 / 0.14);
    animation: rise 260ms ease-out;
  }
  .badge:hover { border-color: var(--tone); }
  .dot { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--tone); }
  .badge-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .badge-text b { font-weight: 600; }

  .card {
    width: min(360px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
    background: var(--raised); border: 1px solid var(--border); border-radius: 14px;
    box-shadow: 0 10px 34px rgb(0 0 0 / 0.18); animation: open 200ms ease-out;
  }
  .top { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 0 16px; }
  .brand { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--muted); }
  .close {
    border: 0; background: none; width: 30px; height: 30px; border-radius: 8px; cursor: pointer;
    font-size: 20px; line-height: 1; color: var(--muted);
  }
  .close:hover { background: var(--surface); color: var(--ink); }

  .hit { padding: 10px 16px 14px; border-bottom: 1px solid var(--border); }
  .hit-goal { font-size: 13px; color: var(--muted); }
  .hit-value {
    font-size: 26px; line-height: 1.15; font-weight: 650; letter-spacing: -0.01em;
    color: var(--tone); font-variant-numeric: tabular-nums;
  }
  .meter { margin-top: 10px; display: grid; gap: 5px; }
  .meter-row { display: grid; grid-template-columns: 44px 1fr; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
  .bar { position: relative; height: 6px; border-radius: 3px; background: var(--track); overflow: hidden; }
  .bar span { position: absolute; inset: 0 auto 0 0; border-radius: 3px; }
  .bar.before span { background: var(--muted); opacity: 0.55; }
  .bar.after span { background: var(--tone); }

  .body { padding: 14px 16px 4px; display: grid; gap: 10px; }
  .impact { font-weight: 550; }
  .trade { color: var(--muted); }
  .move { border-left: 3px solid var(--accent); padding: 2px 0 2px 11px; }
  .move-label { font-size: 12px; color: var(--accent); font-weight: 600; }

  dl { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 4px 16px 0; font-size: 13px; }
  dt { color: var(--muted); }
  dd { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }

  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 14px 16px 6px; }
  .primary {
    display: inline-block; text-decoration: none; background: var(--accent); color: #fff;
    padding: 8px 13px; border-radius: 9px; font-weight: 550; font-size: 13px;
  }
  @media (prefers-color-scheme: dark) { .primary { color: #10233a; } }
  .link { border: 0; background: none; padding: 0; cursor: pointer; color: var(--muted); font-size: 13px; text-decoration: underline; text-underline-offset: 2px; }
  .link:hover { color: var(--ink); }
  .note { padding: 0 16px 14px; font-size: 11px; color: var(--muted); }

  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .card:focus { outline: none; }

  @keyframes rise { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes open { from { transform: translateY(8px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .badge, .card { animation: none; } }
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const HOST_ID = "finvantage-copilot";

/** True when the full card (not just the badge) is showing. */
export function isCardOpen(): boolean {
  return !!document.getElementById(HOST_ID)?.shadowRoot?.querySelector(".card");
}

export function removeOverlay(): void {
  document.getElementById(HOST_ID)?.remove();
}

/** Shadow DOM keeps host-page CSS out. Card text is set with textContent, never as HTML. */
function mountShadow(tone: Tone): { host: HTMLElement; wrap: HTMLElement } {
  removeOverlay();
  const host = el("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.append(Object.assign(el("style"), { textContent: STYLES }));
  const wrap = el("div", undefined, "wrap");
  wrap.dataset.tone = tone;
  shadow.append(wrap);
  document.documentElement.append(host);
  return { host, wrap };
}

/** Before/after bars for an odds headline. Widths come from the math core's ranges. */
function oddsMeter(headline: Headline): HTMLElement | null {
  const { oddsBeforeLow: bl, oddsBeforeHigh: bh, oddsAfterLow: al, oddsAfterHigh: ah } = headline;
  if (bl === null || bh === null || al === null || ah === null) return null;
  const meter = el("div", undefined, "meter");
  meter.setAttribute("aria-hidden", "true");
  for (const [label, low, high, kind] of [
    ["Before", bl, bh, "before"],
    ["After", al, ah, "after"],
  ] as const) {
    const row = el("div", undefined, "meter-row");
    const bar = el("div", undefined, `bar ${kind}`);
    const fill = el("span");
    fill.style.width = `${Math.round(((low + high) / 2) * 100)}%`;
    bar.append(fill);
    row.append(el("span", label), bar);
    meter.append(row);
  }
  return meter;
}

export function showCard(
  card: CopilotCard,
  metrics: Pick<CopilotMetrics, "verdict" | "headline">,
  openUrl: string,
  handlers: OverlayHandlers,
  options: { open?: boolean } = {},
): void {
  const tone: Tone = metrics.verdict === "caution" ? "warn" : metrics.verdict === "good" ? "ok" : "info";
  const { host, wrap } = mountShadow(tone);
  const headline = metrics.headline;
  const lead = card.lead;

  // Badge: the lead figure itself, so the message lands even if the card is never opened.
  const badge = el("button", undefined, "badge");
  badge.setAttribute("aria-expanded", "false");
  badge.setAttribute("aria-label", `FinVantage: ${card.impact} Open details.`);
  const badgeText = el("span", undefined, "badge-text");
  if (lead) {
    badgeText.append(el("b", `${lead.label}: `), lead.value);
  } else {
    badgeText.append(el("b", "FinVantage: "), "see how this fits your plan");
  }
  badge.append(el("span", undefined, "dot"), badgeText);

  // Card.
  const panel = el("div", undefined, "card");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "FinVantage Copilot");
  panel.tabIndex = -1;

  const remove = () => host.remove();
  const close = el("button", "×", "close");
  close.setAttribute("aria-label", "Dismiss for this session");
  close.addEventListener("click", () => {
    handlers.onDismiss();
    remove();
  });
  const brand = el("div", undefined, "brand");
  brand.append(el("span", undefined, "dot"), "FinVantage Copilot");
  const top = el("div", undefined, "top");
  top.append(brand, close);

  const parts: HTMLElement[] = [top];

  if (lead) {
    const hit = el("div", undefined, "hit");
    hit.append(el("div", lead.label, "hit-goal"), el("div", lead.value, "hit-value"));
    const showsOdds =
      headline.kind === "odds" || headline.kind === "out_of_reach" || (headline.kind === "gain" && !lead.value.includes("sooner"));
    if (showsOdds) {
      const meter = oddsMeter(headline);
      if (meter) hit.append(meter);
    }
    parts.push(hit);
  }

  const body = el("div", undefined, "body");
  const move = el("div", undefined, "move");
  move.append(el("div", "Smart move", "move-label"), el("p", card.smartMove));
  body.append(el("p", card.impact, "impact"), el("p", card.tradeOff, "trade"), move);
  parts.push(body);

  if (card.keyFigures.length > 0) {
    const list = el("dl");
    for (const figure of card.keyFigures) {
      list.append(el("dt", figure.label), el("dd", figure.value));
    }
    parts.push(list);
  }

  const open = el("a", "Open full simulation", "primary");
  open.href = openUrl;
  open.target = "_blank";
  open.rel = "noopener";
  open.addEventListener("click", handlers.onOpen);
  const snooze = el("button", "Snooze this site", "link");
  snooze.addEventListener("click", () => {
    handlers.onSnooze();
    remove();
  });
  const actions = el("div", undefined, "actions");
  actions.append(open, snooze);
  parts.push(actions, el("p", "Educational estimate, not financial advice.", "note"));
  panel.append(...parts);

  const expand = () => {
    badge.replaceWith(panel);
    panel.focus();
  };
  const collapse = () => {
    panel.replaceWith(badge);
    badge.focus();
  };
  badge.addEventListener("click", expand);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") collapse();
  });
  wrap.append(badge);
  // An updated card replaces an open one in place, without stealing focus from the page.
  if (options.open) badge.replaceWith(panel);
}

export function showNoDataPrompt(webUrl: string): void {
  const { wrap } = mountShadow("ok");
  const panel = el("div", undefined, "card");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "FinVantage Copilot");
  const body = el("div", undefined, "body");
  body.append(el("p", "FinVantage has no accounts to compare this purchase against yet.", "impact"));
  const link = el("a", "Load the demo profile", "primary");
  link.href = `${webUrl}/settings`;
  link.target = "_blank";
  link.rel = "noopener";
  const actions = el("div", undefined, "actions");
  actions.append(link);
  panel.append(body, actions);
  wrap.append(panel);
}
