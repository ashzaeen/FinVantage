// theme-ok-file: the dark variant and the product mock sit on a dark band; surfaces use tokens.
import { AlertTriangle, CheckCircle2, Lightbulb, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

export type Verdict = "good" | "heads-up" | "warning";

const VERDICTS = {
  good: { label: "Looks Good", Icon: CheckCircle2, chip: "bg-good-bg text-gain" },
  "heads-up": { label: "Heads Up", Icon: AlertTriangle, chip: "bg-lp-warn-bg text-lp-warn-text" },
  warning: { label: "Warning", Icon: ShieldAlert, chip: "bg-critical-bg text-loss" },
} as const;

/** The Copilot card as it appears on a host page: a verdict, the impact on a goal, the trade-off and one smart move. */
export function CopilotCard({
  verdict,
  impact,
  tradeoff,
  move,
  compact = false,
}: {
  verdict: Verdict;
  impact: string;
  tradeoff?: string;
  move: string;
  compact?: boolean;
}) {
  const { label, Icon, chip } = VERDICTS[verdict];
  return (
    <div className={`rounded-2xl bg-lp-surface text-left shadow-lp-float ${compact ? "w-[210px] p-3.5" : "w-[260px] p-4"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ${chip}`}>
          <Icon size={12} aria-hidden="true" /> {label}
        </span>
        <span className="text-[10px] font-medium text-lp-muted">FinVantage</span>
      </div>
      <p className={`mt-2.5 font-semibold leading-snug text-lp-text ${compact ? "text-xs" : "text-sm"}`}>{impact}</p>
      {tradeoff && <p className="mt-1 text-[11px] leading-4 text-lp-text-2">{tradeoff}</p>}
      <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-lp-tint-50 px-2.5 py-2 text-[11px] leading-4 text-lp-primary-dark">
        <Lightbulb size={12} className="mt-px shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold">Smart Move: </span>
          {move}
        </span>
      </p>
    </div>
  );
}

/** A browser window drawn from skeleton blocks. The page content is a stand-in, not a real store. */
export function BrowserFrame({ url, children, dark = false }: { url: string; children: ReactNode; dark?: boolean }) {
  return (
    <div aria-hidden="true" className={`overflow-hidden rounded-2xl border ${dark ? "border-lp-dark-line bg-lp-dark-surface" : "border-lp-line bg-lp-surface shadow-lp-card"}`}>
      <div className={`flex items-center gap-1.5 border-b px-3 py-2.5 ${dark ? "border-lp-dark-line" : "border-lp-line-soft"}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${dark ? "bg-white/20" : "bg-lp-line"}`} />
        <span className={`h-2.5 w-2.5 rounded-full ${dark ? "bg-white/20" : "bg-lp-line"}`} />
        <span className={`h-2.5 w-2.5 rounded-full ${dark ? "bg-white/20" : "bg-lp-line"}`} />
        <span className={`ml-2 truncate rounded-md px-2.5 py-1 text-[11px] ${dark ? "bg-white/10 text-white/60" : "bg-lp-bg text-lp-muted"}`}>{url}</span>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
