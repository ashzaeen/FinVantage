"use client";

import { useState } from "react";
import { formatPercent, formatUsd, type AllocationDrift } from "@finvantage/contracts";
import { BulletBar } from "@/components/charts/BulletBar";
import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { api } from "@/lib/api";
import { ALLOCATION_PRESETS, ASSET_CLASS_LABEL } from "@/lib/allocationPresets";

function moveSentence(row: AllocationDrift["rows"][number]): string | null {
  if (!row.outside || row.moveCents === 0) return null;
  const name = ASSET_CLASS_LABEL[row.assetClass];
  return row.moveCents > 0
    ? `Consider adding about ${formatUsd(row.moveCents)} to ${name}`
    : `Consider trimming about ${formatUsd(Math.abs(row.moveCents))} of ${name}`;
}

/** Actual mix against a target mix. Suggestions only: nothing is bought or sold, and targets save on Save Targets. */
export function AllocationDriftCard({ initial }: { initial: AllocationDrift }) {
  const [drift, setDrift] = useState(initial);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const preset = ALLOCATION_PRESETS.find((p) => p.id === presetId);

  async function save() {
    if (!preset) return;
    setSaving(true);
    setError("");
    try {
      setDrift(await api.setTargetAllocation({ body: preset.mix }));
      setSaved(`Targets saved: ${preset.label}.`);
      setPresetId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save these targets.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Allocation Drift" subtitle="Your mix against a target mix" action={<MockedBadge />} lift={false}>
      <p className="mb-3 text-xs text-muted">
        These are suggestions: nothing is bought or sold.{" "}
        {drift.targetsSet ? "Targets are the mix you saved." : "Until you save targets, the rows use a balanced starting mix as a suggestion."}
      </p>
      <div className="space-y-4">
        {drift.rows.map((row, i) => {
          const target = preset ? preset.mix[row.assetClass] : row.target;
          const previewing = Boolean(preset);
          return (
            <div key={row.assetClass}>
              <BulletBar
                index={i}
                label={ASSET_CLASS_LABEL[row.assetClass]}
                valueText={formatPercent(row.actual)}
                fill={row.actual}
                target={target}
                targetText={formatPercent(target)}
                band={[Math.max(0, target - drift.band), Math.min(1, target + drift.band)]}
                tone={!previewing && row.outside ? "warn" : "accent"}
              />
              <p className="mt-1 text-xs text-muted">
                Target {formatPercent(target)}.{" "}
                {previewing ? "Dollar amounts update once you save." : (moveSentence(row) ?? "Within the usual range.")}
              </p>
            </div>
          );
        })}
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-ink">Try a Target Mix</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALLOCATION_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={presetId === p.id}
              onClick={() => { setPresetId(presetId === p.id ? null : p.id); setSaved(""); }}
              className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${presetId === p.id ? "border-accent-ink bg-accent-soft text-accent-ink" : "border-line bg-raised text-ink-secondary"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>
      {preset && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={saving} onClick={() => void save()} className="min-h-11 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
            {saving ? "Saving…" : "Save Targets"}
          </button>
          <button type="button" disabled={saving} onClick={() => setPresetId(null)} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-muted">Cancel</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--critical)" }}>{error}</p>}
      <p role="status" aria-live="polite" className="mt-2 text-sm text-ink">{saved}</p>
    </Card>
  );
}
