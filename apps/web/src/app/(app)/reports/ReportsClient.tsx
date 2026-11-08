"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { formatUsd, type QuarterlyReport } from "@finvantage/contracts";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { Card } from "@/components/ui/Card";
import { api, API_TOKEN, API_URL, currentToken } from "@/lib/api";
import { QuarterlyReportCharts } from "./QuarterlyReportCharts";

function ReportSection({
  title,
  eyebrow,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-line bg-white p-6 shadow-[0_4px_20px_-2px_rgba(22,25,44,0.05)] ${className}`}>
      {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>}
      <h2 className="mb-4 font-poppins text-xl font-bold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function ReportsClient({ initialReports }: { initialReports: QuarterlyReport[] }) {
  const [reports, setReports] = useState(initialReports);
  const [selectedReportId, setSelectedReportId] = useState(initialReports[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [chartsError, setChartsError] = useState<string | null>(null);
  // The PDF link is a plain download, so it carries the signed-in user's token in the URL.
  const [pdfToken, setPdfToken] = useState(API_TOKEN);
  useEffect(() => {
    void currentToken().then(setPdfToken);
  }, []);
  const latest = reports.find((report) => report.id === selectedReportId) ?? reports[0] ?? null;

  async function generate(quarter?: QuarterlyReport["quarter"]) {
    setBusy(true);
    setError(null);
    try {
      const report = await api.generateReport({
        body: { email: false, ...(quarter ? { quarter } : {}) },
      });
      setReports((current) => [report, ...current.filter((item) => item.id !== report.id)]);
      setSelectedReportId(report.id);
      setChartsLoading(true);
      try {
        setReports(await api.listReports());
        setChartsError(null);
      } catch (chartError) {
        setChartsError(chartError instanceof Error ? chartError.message : "Could not refresh report charts.");
      } finally {
        setChartsLoading(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Report generation failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!latest) {
    return (
      <div className="space-y-5">
        <Card title="Your latest completed quarter">
          <p className="text-sm text-muted">
            Reports can start from one saved quarter and add comparisons when a prior quarter exists.
          </p>
          <button
            onClick={() => generate()}
            disabled={busy}
            className="mt-4 rounded bg-accent px-3 py-2 text-sm text-surface disabled:opacity-50"
          >
            {busy ? "Generating..." : "Generate latest report"}
          </button>
          {error && <p className="mt-3 text-sm text-critical">{error}</p>}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-ink">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-3 shadow-sm">
        <div className="flex gap-2 overflow-x-auto no-scrollbar" aria-label="Generated quarterly reports">
          {[...reports].sort((left, right) => left.quarter.localeCompare(right.quarter)).map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => setSelectedReportId(report.id)}
              aria-pressed={report.id === latest.id}
              className={
                report.id === latest.id
                  ? "min-w-24 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  : "min-w-24 rounded-xl border border-line bg-inset px-4 py-2.5 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              }
            >
              {report.quarter}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latest.pdf.status === "ready" && (
            <a
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              href={`${API_URL}/v1/reports/quarterly/${latest.id}/pdf?token=${encodeURIComponent(pdfToken)}`}
            >
              Download PDF
            </a>
          )}
          <button
            className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => setShowCharts((visible) => !visible)}
          >
            {showCharts ? "Hide charts" : "Show charts"}
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-critical-bg p-3 text-sm text-critical">{error}</p>}

      <p className="text-sm text-muted">
        {latest.visuals.dataSource === "bank" ? (
          "Based on your linked bank accounts."
        ) : (
          <>
            Based on sample data.{" "}
            <Link href="/accounts" className="font-semibold text-accent hover:underline">
              Link a bank
            </Link>{" "}
            to use your own.
          </>
        )}
        {latest.visuals.outlookAsOf && ` Goal outlook as of ${latest.visuals.outlookAsOf}.`}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Net worth", formatUsd(latest.visuals.summary.netWorthCents)],
          ["Monthly income", formatUsd(latest.visuals.summary.monthlyIncomeCents)],
          ["Monthly spending", formatUsd(latest.visuals.summary.monthlySpendingCents)],
          ["Monthly savings", formatUsd(latest.visuals.summary.monthlySavingsCents)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-4px_rgba(84,74,247,0.08)]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
            <p className="mt-3 text-right font-poppins text-2xl font-bold tabular-nums text-ink">{value}</p>
            <p className="mt-1 text-right text-xs text-muted">
              {latest.visuals.dataSource === "bank" ? "From your linked banks" : "Saved planning figure"}
            </p>
          </div>
        ))}
      </div>

      {showCharts && (
        <QuarterlyReportCharts reports={[latest]} loading={chartsLoading} error={chartsError} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ReportSection title="What went well" eyebrow="Positive movement">
          <ul className="space-y-3 text-sm">
            {latest.wentWell.map((item) => <li key={item} className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-good" />{item}</li>)}
          </ul>
        </ReportSection>
        <ReportSection title="Needs attention" eyebrow="Risks and gaps">
          <ul className="space-y-3 text-sm">
            {latest.didNotGoWell.map((item) => <li key={item} className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warning" />{item}</li>)}
          </ul>
        </ReportSection>
      </div>

      <ReportSection title="Why it changed" eyebrow="Quarter-over-quarter analysis">
        <p className="text-sm">{latest.why}</p>
        {latest.largestChange ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm font-medium">{latest.largestChange.label}</p>
            <p className="mt-1 text-sm text-muted">
              Previous: {latest.largestChange.previousValue}. Current: {latest.largestChange.currentValue}. {latest.largestChange.change}.
            </p>
            <p className="mt-2 text-sm">{latest.largestChange.cause}</p>
          </div>
        ) : (
          <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
            This is the first available quarterly baseline, so no previous-quarter comparison is shown.
          </p>
        )}
      </ReportSection>

      <ReportSection title="Quarter evidence" eyebrow="Traceable figures">
        <div className="grid gap-4 md:grid-cols-2">
          {latest.evidence.map((item) => (
            <div key={`${item.quarter}-${item.sourceId}`}>
              <p className="text-sm font-medium">{item.quarter}</p>
              <p className="text-xs text-muted">{item.label}</p>
              {item.probabilityLow !== null && item.probabilityHigh !== null ? (
                <ProbabilityRange low={item.probabilityLow} high={item.probabilityHigh} />
              ) : (
                <p className="text-sm">{item.value}</p>
              )}
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection title="Quarterly agent coverage" eyebrow="Sources reviewed">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-inset p-4">
            <p className="text-right font-poppins text-2xl font-bold tabular-nums">{latest.sourceIds.simulationRunIds.length}</p>
            <p className="text-xs text-muted">Simulation runs reviewed</p>
          </div>
          <div className="rounded-xl bg-inset p-4">
            <p className="text-right font-poppins text-2xl font-bold tabular-nums">{latest.sourceIds.copilotEventIds.length}</p>
            <p className="text-xs text-muted">Copilot events reviewed</p>
          </div>
          <div className="rounded-xl bg-inset p-4">
            <p className="text-right font-poppins text-2xl font-bold tabular-nums">{latest.sourceIds.recommendationIds.length}</p>
            <p className="text-xs text-muted">Recommendations reviewed</p>
          </div>
        </div>
      </ReportSection>

      <ReportSection title="Goal outlook" eyebrow="Forward estimates">
        <div className="grid gap-3 lg:grid-cols-2">
          {latest.visuals.goalPathways.map((goal) => (
            <div key={goal.goalId} className="rounded-2xl border border-line bg-inset/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{goal.goalName}</p>
                  <p className="text-xs text-muted">
                    Target {formatUsd(goal.targetCents)} by {goal.targetDate}
                  </p>
                </div>
                <span className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold uppercase text-accent">
                  {goal.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="mt-3">
                <ProbabilityRange low={goal.probabilityLow} high={goal.probabilityHigh} />
              </div>
              <p className="mt-2 text-xs text-muted">
                Median completion: {goal.medianCompletionDate ?? "not established in this simulation"}
              </p>
            </div>
          ))}
        </div>
      </ReportSection>

      <div className="grid gap-4 md:grid-cols-2">
        <ReportSection title="Look ahead" eyebrow="Next quarter"><p className="text-sm leading-6">{latest.lookAhead}</p></ReportSection>
        <ReportSection title="Next steps" eyebrow="Primary actions">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {latest.nextSteps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </ReportSection>
      </div>

      <ReportSection title="Suggested focus" eyebrow="Planning prompts">
        <div className="grid gap-3 md:grid-cols-3">
          {latest.visuals.suggestions.map((suggestion) => (
            <div key={suggestion.goalId} className="rounded-2xl border border-line bg-inset/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{suggestion.category}</p>
              <p className="mt-1 text-sm font-medium">{suggestion.title}</p>
              <p className="mt-1 text-xs text-muted">{suggestion.detail}</p>
            </div>
          ))}
        </div>
      </ReportSection>

    </div>
  );
}
