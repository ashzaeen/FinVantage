import { formatUsd, type CopilotImpact } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { plural, shortDate } from "@/lib/format";

const W = 520;
const H = 130;
const PAD = { left: 28, right: 8, top: 8, bottom: 22 };

/** Checks by week: the bar is every check, the orange part is the ones flagged. */
function WeeklyChart({ weeks }: { weeks: CopilotImpact["weeks"] }) {
  const peak = Math.max(1, ...weeks.map((w) => w.checked));
  const slot = (W - PAD.left - PAD.right) / weeks.length;
  const bar = Math.min(34, slot * 0.6);
  const y = (n: number) => PAD.top + (1 - n / peak) * (H - PAD.top - PAD.bottom);
  return (
    <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[30rem] max-w-[44rem]" role="img" aria-label={`Checks by week: ${weeks.map((w) => `week of ${shortDate(w.weekStart)}, ${w.checked} checked, ${w.flagged} flagged`).join("; ")}.`}>
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--border)" />
      <text x={PAD.left - 6} y={y(peak) + 4} textAnchor="end" fontSize={12} fill="var(--ink-muted)">{peak}</text>
      <text x={PAD.left - 6} y={y(0) + 4} textAnchor="end" fontSize={12} fill="var(--ink-muted)">0</text>
      {weeks.map((w, i) => {
        const cx = PAD.left + slot * i + slot / 2;
        return (
          <g key={w.weekStart}>
            <rect x={cx - bar / 2} y={y(w.checked)} width={bar} height={Math.max(0, y(0) - y(w.checked))} rx={3} fill="var(--series-1)" fillOpacity={0.55} />
            <rect x={cx - bar / 2} y={y(w.flagged)} width={bar} height={Math.max(0, y(0) - y(w.flagged))} rx={3} fill="var(--warning)" />
            {(i === 0 || i === weeks.length - 1) && <text x={cx} y={H - 6} textAnchor="middle" fontSize={12} fill="var(--ink-muted)">{shortDate(w.weekStart)}</text>}
          </g>
        );
      })}
    </svg></div>
  );
}

/** What the Copilot has done for the user: checks run, ones flagged, goal months at stake, and the last eight weeks. */
export function CopilotImpactTiles({ impact }: { impact: CopilotImpact }) {
  const tiles = [
    { label: "Purchases Checked", value: String(impact.checked), note: "Each one compared with your goals" },
    { label: "Flagged", value: String(impact.flagged), note: `${formatUsd(impact.flaggedCents)} across the flagged purchases` },
    { label: "Goal Months at Stake", value: String(impact.goalMonthsAtStake), note: "Months goals would have slipped, summed over the flagged checks" },
  ];
  return (
    <Card title="Copilot Impact" subtitle="What the checks have shown so far" lift={false}>
      {impact.checked === 0 ? (
        <p className="text-sm text-muted">No purchases checked yet. When the extension sees a price, the check shows up here.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {tiles.map((t) => (
              <div key={t.label} className="tile-lift rounded-xl p-3" style={{ background: "var(--surface-inset)" }}>
                <p className="text-xs text-muted">{t.label}</p>
                <p className="mt-1 font-poppins text-xl font-bold tabular-nums text-ink">{t.value}</p>
                <p className="mt-1 text-xs text-muted">{t.note}</p>
              </div>
            ))}
          </div>
          <h3 className="mt-5 text-sm font-semibold text-ink">Checks By Week</h3>
          <WeeklyChart weeks={impact.weeks} />
          <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
            <span><i aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: "var(--series-1)", opacity: 0.55 }} />Checked</span>
            <span><i aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: "var(--warning)" }} />Flagged</span>
          </p>
          <p className="sr-only">{`${plural(impact.checked, "purchase")} checked, ${impact.flagged} flagged for ${formatUsd(impact.flaggedCents)}, ${plural(impact.goalMonthsAtStake, "goal month")} at stake.`}</p>
        </>
      )}
    </Card>
  );
}
