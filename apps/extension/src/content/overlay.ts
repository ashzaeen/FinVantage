import type { CopilotCard, CopilotMetrics } from "@finvantage/contracts";

export interface OverlayHandlers {
  onDismiss: () => void;
  onSnooze: () => void;
  onOpen: () => void;
}

type Headline = CopilotMetrics["headline"];
type Tone = "danger" | "warn" | "ok" | "info";

/** The verdict in plain words, with an icon so it never rests on color alone. */
const VERDICT: Record<Tone, { word: string; icon: string }> = {
  danger: { word: "Warning", icon: "!" },
  warn: { word: "Heads up", icon: "!" },
  ok: { word: "Looks good", icon: "✓" },
  info: { word: "Worth a look", icon: "i" },
};

function icon(tone: Tone): HTMLElement {
  const node = el("span", VERDICT[tone].icon, "icon");
  node.setAttribute("aria-hidden", "true");
  return node;
}

/*
 * Colors mirror the dashboard tokens in apps/web/src/app/globals.css, so the card reads as
 * part of FinVantage. If design changes those tokens, change them here too.
 */
const STYLES = `
  :host { all: initial; }
  .wrap {
    --surface: #fbfaf7; --raised: #ffffff; --border: #e4e1d8; --ink: #1d1d1b; --muted: #57554f;
    --accent: #2563a8; --good: #2c7a4b; --warn: #a8550b; --danger: #b3392f; --track: #ece9e1;
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    .wrap {
      --surface: #161614; --raised: #1f1f1c; --border: #35342f; --ink: #f4f2ec; --muted: #b9b6ad;
      --accent: #8dbbed; --good: #7fd19f; --warn: #f2b25c; --danger: #f08b80; --track: #2c2b27;
    }
  }
  * { box-sizing: border-box; font: inherit; color: inherit; margin: 0; }
  .wrap[data-tone="danger"] { --tone: var(--danger); }
  .wrap[data-tone="warn"] { --tone: var(--warn); }
  .wrap[data-tone="ok"] { --tone: var(--good); }
  .wrap[data-tone="info"] { --tone: var(--accent); }

  /* Icon plus word, so the verdict never rests on color alone. */
  .icon {
    flex: none; display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%;
    background: var(--tone); color: var(--raised); font-size: 13px; font-weight: 800; line-height: 1;
  }

  .badge {
    display: flex; align-items: center; gap: 9px; max-width: min(380px, calc(100vw - 32px));
    border: 1px solid var(--border); border-radius: 999px; background: var(--raised);
    padding: 9px 16px 9px 10px; cursor: pointer; box-shadow: 0 4px 18px rgb(0 0 0 / 0.16);
    animation: rise 260ms ease-out;
  }
  .badge:hover { border-color: var(--tone); }
  .badge-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .badge-text b { font-weight: 700; color: var(--tone); }

  .card {
    width: min(380px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
    background: var(--raised); border: 1px solid var(--border); border-top: 5px solid var(--tone);
    border-radius: 14px; box-shadow: 0 10px 34px rgb(0 0 0 / 0.2); animation: open 200ms ease-out;
  }
  .top { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 0 18px; }
  .verdict { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--tone); }
  .close {
    border: 0; background: none; width: 34px; height: 34px; border-radius: 8px; cursor: pointer;
    font-size: 22px; line-height: 1; color: var(--muted);
  }
  .close:hover { background: var(--surface); color: var(--ink); }

  .headline { padding: 8px 18px 0; font-size: 19px; line-height: 1.3; font-weight: 650; letter-spacing: -0.01em; }

  .goal { margin: 14px 18px 0; padding: 12px 14px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); }
  .goal-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .goal-label { font-size: 14px; color: var(--muted); }
  .goal-value { font-weight: 700; color: var(--tone); }
  .meter { margin-top: 10px; display: grid; gap: 6px; }
  .meter-row { display: grid; grid-template-columns: 58px 1fr; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
  .bar { position: relative; height: 8px; border-radius: 4px; background: var(--track); overflow: hidden; }
  .bar span { position: absolute; inset: 0 auto 0 0; border-radius: 4px; }
  .bar.before span { background: var(--muted); opacity: 0.5; }
  .bar.after span { background: var(--tone); }

  .section { padding: 14px 18px 0; }
  .label { font-size: 13px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
  .move { margin: 14px 18px 0; padding: 10px 14px; border-left: 4px solid var(--accent); background: var(--surface); border-radius: 0 10px 10px 0; }
  .move .label { color: var(--accent); }

  dl { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; margin: 14px 18px 0; padding-top: 12px; border-top: 1px solid var(--border); font-size: 14px; }
  dt { color: var(--muted); }
  dd { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }

  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; padding: 16px 18px 8px; }
  .primary {
    display: inline-block; text-decoration: none; background: var(--accent); color: #fff;
    padding: 10px 16px; border-radius: 10px; font-weight: 650; font-size: 15px;
  }
  @media (prefers-color-scheme: dark) { .primary { color: #10233a; } }
  .link { border: 0; background: none; padding: 0; cursor: pointer; color: var(--muted); font-size: 14px; text-decoration: underline; text-underline-offset: 2px; }
  .link:hover { color: var(--ink); }
  .note { padding: 0 18px 14px; font-size: 12px; color: var(--muted); }

  :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
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
    ["Now", bl, bh, "before"],
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

/** Statuses that make a caution card a red warning rather than an amber heads-up. */
const SERIOUS = new Set(["at risk", "unlikely", "out of reach"]);

/**
 * The math decides caution, good, or neutral. A caution is red when this purchase moves a goal to
 * at risk or worse, or costs more than checking holds; a milder hit (still likely, a short delay,
 * a goal that was already struggling slipping a little, a dip under the cushion) is amber.
 */
export function toneFor(
  metrics: Pick<CopilotMetrics, "verdict" | "headline" | "liquidBufferAfterCents"> & Partial<Pick<CopilotMetrics, "transfer">>,
): Tone {
  if (metrics.verdict === "good") return "ok";
  if (metrics.verdict !== "caution") return "info";
  const h = metrics.headline;
  const serious =
    h.kind === "out_of_reach" ||
    // Red only when this purchase moves a goal into trouble, not when it was already there.
    (h.kind !== "gain" && h.statusAfter !== null && h.statusAfter !== h.statusBefore && SERIOUS.has(h.statusAfter)) ||
    // Short in checking, unless moving spare savings in covers it.
    (metrics.liquidBufferAfterCents !== null &&
      metrics.liquidBufferAfterCents + (metrics.transfer?.amountCents ?? 0) < 0);
  return serious ? "danger" : "warn";
}

export function showCard(
  card: CopilotCard,
  metrics: Pick<CopilotMetrics, "verdict" | "headline" | "liquidBufferAfterCents" | "transfer">,
  openUrl: string,
  handlers: OverlayHandlers,
  options: { open?: boolean } = {},
): void {
  const tone = toneFor(metrics);
  const { host, wrap } = mountShadow(tone);
  const headline = metrics.headline;
  const lead = card.lead;

  const verdict = VERDICT[tone];

  // Badge: the verdict and the lead figure, so the message lands even if the card is never opened.
  const badge = el("button", undefined, "badge");
  badge.setAttribute("aria-expanded", "false");
  badge.setAttribute("aria-label", `FinVantage, ${verdict.word}: ${card.impact} Open details.`);
  const badgeText = el("span", undefined, "badge-text");
  badgeText.append(el("b", verdict.word), lead ? ` · ${lead.label}: ${lead.value}` : " · See how this fits your plan");
  badge.append(icon(tone), badgeText);

  // Card: verdict, one plain sentence, the goal it touches, why, what to do, then the numbers.
  const panel = el("div", undefined, "card");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", `FinVantage: ${verdict.word}`);
  panel.tabIndex = -1;

  const remove = () => host.remove();
  const close = el("button", "×", "close");
  close.setAttribute("aria-label", "Close for this page");
  close.addEventListener("click", () => {
    handlers.onDismiss();
    remove();
  });
  const verdictRow = el("div", undefined, "verdict");
  verdictRow.append(icon(tone), `${verdict.word} from FinVantage`);
  const top = el("div", undefined, "top");
  top.append(verdictRow, close);

  const parts: HTMLElement[] = [top, el("p", card.impact, "headline")];

  if (lead) {
    const goal = el("div", undefined, "goal");
    const row = el("div", undefined, "goal-row");
    row.append(el("span", lead.label, "goal-label"), el("span", lead.value, "goal-value"));
    goal.append(row);
    const showsOdds =
      headline.kind === "odds" || headline.kind === "out_of_reach" || (headline.kind === "gain" && !lead.value.includes("sooner"));
    if (showsOdds) {
      const meter = oddsMeter(headline);
      if (meter) goal.append(meter);
    }
    parts.push(goal);
  }

  const why = el("div", undefined, "section");
  why.append(el("p", "Why", "label"), el("p", card.tradeOff));
  const move = el("div", undefined, "move");
  move.append(el("p", "What you could do", "label"), el("p", card.smartMove));
  parts.push(why, move);

  if (card.keyFigures.length > 0) {
    const list = el("dl");
    list.setAttribute("aria-label", "The numbers");
    for (const figure of card.keyFigures) {
      list.append(el("dt", figure.label), el("dd", figure.value));
    }
    parts.push(list);
  }

  const open = el("a", "See the full picture", "primary");
  open.href = openUrl;
  open.target = "_blank";
  open.rel = "noopener";
  open.addEventListener("click", handlers.onOpen);
  const snooze = el("button", "Hide on this site", "link");
  snooze.addEventListener("click", () => {
    handlers.onSnooze();
    remove();
  });
  const actions = el("div", undefined, "actions");
  actions.append(open, snooze);
  parts.push(actions, el("p", "An estimate to help you decide, not financial advice.", "note"));
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
  const body = el("div", undefined, "section");
  body.append(el("p", "FinVantage doesn't have your accounts yet, so it can't check this purchase.", "headline"));
  const link = el("a", "Add the demo profile", "primary");
  link.href = `${webUrl}/settings`;
  link.target = "_blank";
  link.rel = "noopener";
  const actions = el("div", undefined, "actions");
  actions.append(link);
  panel.append(body, actions);
  wrap.append(panel);
}
