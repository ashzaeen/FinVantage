import { formatUsd, type CopilotImpact } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { plural } from "@/lib/format";

/** What the Copilot has done for the user: checks run, ones flagged, the dollars and goal months involved. */
export function CopilotImpactTiles({ impact }: { impact: CopilotImpact }) {
  const tiles = [
    { label: "Purchases Checked", value: String(impact.checked), note: "Each one compared with your goals" },
    { label: "Flagged", value: String(impact.flagged), note: "A goal would slip or cash would run low" },
    { label: "Dollars Flagged", value: formatUsd(impact.flaggedCents), note: "Across the flagged purchases" },
    { label: "Goal Months at Stake", value: String(impact.goalMonthsAtStake), note: "Delay on each flagged check's worst-hit goal, added up" },
  ];
  return (
    <Card title="Copilot Impact" subtitle="What the checks have shown so far" lift={false}>
      {impact.checked === 0 ? (
        <p className="text-sm text-muted">No purchases checked yet. When the extension sees a price, the check shows up here.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="tile-lift rounded-xl p-3" style={{ background: "var(--surface-inset)" }}>
                <p className="text-xs text-muted">{t.label}</p>
                <p className="mt-1 font-poppins text-xl font-bold tabular-nums text-ink">{t.value}</p>
                <p className="mt-1 text-xs text-muted">{t.note}</p>
              </div>
            ))}
          </div>
          <p className="sr-only">{`${plural(impact.checked, "purchase")} checked, ${impact.flagged} flagged for ${formatUsd(impact.flaggedCents)}, ${plural(impact.goalMonthsAtStake, "goal month")} at stake.`}</p>
        </>
      )}
    </Card>
  );
}
