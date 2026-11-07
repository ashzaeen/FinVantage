import type { CopilotCard } from "@finvantage/contracts";

export interface OverlayHandlers {
  onDismiss: () => void;
  onSnooze: () => void;
  onOpen: () => void;
}

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, sans-serif; }
  .wrap { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; color: #1d1d1b; }
  .badge { border: 0; border-radius: 999px; background: #2563a8; color: #fff; padding: 10px 14px; font-size: 14px; cursor: pointer; }
  .card { width: min(340px, calc(100vw - 32px)); background: #fff; border: 1px solid #e4e1d8; border-radius: 10px; padding: 14px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.16); font-size: 14px; line-height: 1.4; }
  h2 { margin: 0 0 8px; font-size: 14px; }
  p { margin: 0 0 8px; }
  strong { display: block; font-size: 12px; color: #66645d; font-weight: 500; }
  ul { list-style: none; margin: 8px 0; padding: 0; font-size: 13px; }
  li { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 10px; font-size: 13px; }
  .actions button { background: none; border: 0; padding: 0; color: #66645d; font-size: 13px; text-decoration: underline; cursor: pointer; }
  a { color: #2563a8; }
  :focus-visible { outline: 2px solid #2563a8; outline-offset: 2px; }
  .note { font-size: 11px; color: #66645d; margin: 8px 0 0; }
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

/** Shadow DOM keeps host-page CSS out. Card text is set with textContent, never as HTML. */
function mountShadow(): { host: HTMLElement; wrap: HTMLElement } {
  const host = el("div");
  host.id = "finvantage-copilot";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.append(Object.assign(el("style"), { textContent: STYLES }));
  const wrap = el("div", undefined, "wrap");
  shadow.append(wrap);
  document.documentElement.append(host);
  return { host, wrap };
}

function section(label: string, text: string): HTMLElement {
  const p = el("p");
  p.append(el("strong", label), text);
  return p;
}

export function showCard(card: CopilotCard, openUrl: string, handlers: OverlayHandlers): void {
  const { host, wrap } = mountShadow();
  const badge = el("button", "FinVantage: see the impact", "badge");
  badge.setAttribute("aria-expanded", "false");

  const panel = el("div", undefined, "card");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "FinVantage Copilot");
  panel.tabIndex = -1;

  const figures = el("ul");
  for (const figure of card.keyFigures) {
    const row = el("li");
    row.append(el("span", figure.label), el("span", figure.value));
    figures.append(row);
  }

  const open = el("a", "Open full simulation");
  open.href = openUrl;
  open.target = "_blank";
  open.rel = "noopener";
  open.addEventListener("click", handlers.onOpen);

  const dismiss = el("button", "Dismiss");
  dismiss.addEventListener("click", () => {
    handlers.onDismiss();
    host.remove();
  });
  const snooze = el("button", "Snooze this site");
  snooze.addEventListener("click", () => {
    handlers.onSnooze();
    host.remove();
  });

  const actions = el("div", undefined, "actions");
  actions.append(open, dismiss, snooze);
  panel.append(
    el("h2", "Before you commit"),
    section("Impact", card.impact),
    section("Trade-off", card.tradeOff),
    section("Smart move", card.smartMove),
    figures,
    actions,
    el("p", "Educational estimate, not financial advice.", "note"),
  );

  const expand = () => {
    badge.replaceWith(panel);
    panel.focus();
  };
  badge.addEventListener("click", expand);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      panel.replaceWith(badge);
      badge.focus();
    }
  });
  wrap.append(badge);
}

export function showNoDataPrompt(webUrl: string): void {
  const { wrap } = mountShadow();
  const panel = el("div", undefined, "card");
  const link = el("a", "Load the demo profile");
  link.href = `${webUrl}/settings`;
  link.target = "_blank";
  link.rel = "noopener";
  panel.append(el("p", "FinVantage has no accounts to compare this against yet."), link);
  wrap.append(panel);
}
