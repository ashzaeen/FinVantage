"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  formatUsd,
  type CopilotEvent,
  type LifeScenario,
  type LifeScenarioAnalysis,
  type LifeSimulatorContext,
} from "@finvantage/contracts";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { LifeSimulatorCharts } from "./LifeSimulatorCharts";
import {
  EVENT_LABEL,
  EventForm,
  formatDate,
  GoalTimeline,
  autoSplit,
  defaultForm,
  nextMonthAfter,
  type FieldError,
  type ScenarioForm,
} from "./lifeSimulatorShared";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

function formForCurrentContext(form: ScenarioForm, current: LifeSimulatorContext): ScenarioForm {
  const goalIds = current.goals.map((goal) => goal.id);
  const sourceGoalId = goalIds.includes(form.oneTimeSourceGoalId) ? form.oneTimeSourceGoalId : goalIds[0] ?? "";
  return {
    ...form,
    oneTimeSourceGoalId: sourceGoalId,
    selectedGoalIds: goalIds,
    split: autoSplit(current.goals, current.freeCashCents - form.monthlyCostCents),
  };
}

function eventNameFor(scenario: Pick<LifeScenario, "eventType" | "customEventName">) {
  return scenario.eventType === "custom"
    ? scenario.customEventName.trim() || "Your Event"
    : EVENT_LABEL[scenario.eventType];
}

function savedScenarioLabels(scenarios: LifeScenario[]) {
  const labels = new Map<string, string>();
  const occurrences = new Map<string, number>();
  [...scenarios]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .forEach((scenario) => {
      const baseName = eventNameFor(scenario);
      const occurrence = occurrences.get(baseName) ?? 0;
      labels.set(scenario.id, occurrence === 0 ? baseName : `${baseName} (${occurrence})`);
      occurrences.set(baseName, occurrence + 1);
    });
  return labels;
}

function scenarioInsight(analysis: LifeScenarioAnalysis) {
  const included = analysis.goals.filter((goal) => goal.included);
  const remainingMonths = (date: string | null) => {
    if (!date) return 0;
    const [year, month] = date.slice(0, 7).split("-").map(Number);
    const [asOfYear, asOfMonth] = analysis.asOf.slice(0, 7).split("-").map(Number);
    return Math.max(1, (year! - asOfYear!) * 12 + month! - asOfMonth!);
  };
  const impactRatio = (goal: typeof included[number]) => Math.max(0, goal.delayMonths ?? 0) / remainingMonths(goal.beforeDisplayDate);
  const timingConflicts = new Set(analysis.analysis.timingConflicts.map((item) => item.goalId));
  const goalRows = included.map((goal) => {
    const newlyUnfunded = goal.beforeDisplayDate !== null && goal.displayDate === null;
    const materiallyDelayed = (goal.delayMonths ?? 0) >= 6 && impactRatio(goal) >= 0.75;
    const delayed = (goal.delayMonths ?? 0) > 0;
    const timingConflict = timingConflicts.has(goal.goalId);
    const tone = newlyUnfunded || materiallyDelayed ? "high" : delayed || timingConflict || goal.displayDate === null ? "medium" : "low";
    const priority = tone === "high" ? "High" : tone === "medium" ? "Medium" : "Low";
    const progress = `${Math.min(100, Math.round(goal.savedCents / goal.targetCents * 100))}% funded`;
    const change = goal.beforeDisplayDate === goal.displayDate
      ? goal.displayDate ? `No date change · ${formatDate(goal.displayDate)}` : "No funding date on the current plan or with this event"
      : `${formatDate(goal.beforeDisplayDate)} → ${formatDate(goal.displayDate)} · ${goal.delayLabel.toLowerCase()}`;
    return { goal, tone, priority, progress, change, newlyUnfunded, materiallyDelayed, delayed, timingConflict };
  });
  const delayedRows = goalRows.filter((item) => item.delayed);
  const severeRows = goalRows.filter((item) => item.newlyUnfunded || item.materiallyDelayed);
  const mostAffected = [...delayedRows].sort((left, right) => impactRatio(right.goal) - impactRatio(left.goal))[0];
  const consumesAllFreeCash = analysis.analysis.monthlyCostsCents > 0 && analysis.analysis.freeCashAfterCents === 0;
  const majorityOfGoalsSeverelyAffected = severeRows.length > 0 && severeRows.length >= Math.ceil(included.length / 2);
  const overallTone = consumesAllFreeCash || majorityOfGoalsSeverelyAffected ? "high" : delayedRows.length > 0 || timingConflicts.size > 0 ? "medium" : "low";
  const insightGoal = mostAffected?.goal;
  const conflict = analysis.analysis.timingConflicts[0];
  const headline = consumesAllFreeCash
    ? "The event uses every dollar of current monthly free cash."
    : overallTone === "high"
      ? "This event substantially changes several goal timelines."
      : insightGoal
        ? `${insightGoal.name} moves ${insightGoal.delayLabel.toLowerCase()}.`
        : conflict
          ? `The timing may be tight for ${conflict.goalName}.`
          : "This event fits your current goal plan.";
  const evidence = consumesAllFreeCash
    ? `Your current plan has ${formatUsd(analysis.analysis.freeCashBeforeCents)} per month available; the event leaves ${formatUsd(analysis.analysis.freeCashAfterCents)}.`
    : `${delayedRows.length} of ${included.length} goal${included.length === 1 ? "" : "s"} change funding dates. ${formatUsd(analysis.analysis.freeCashAfterCents)} per month remains after event costs.`;
  const decision = consumesAllFreeCash
    ? "Would you still be comfortable with no monthly free cash left? Lower the event's monthly cost or change its timing, then generate again."
    : insightGoal
      ? `Is waiting ${insightGoal.delayLabel.toLowerCase()} for ${insightGoal.name} an acceptable trade-off? If that goal date matters more, reduce the event costs or adjust its timing and compare again.`
      : conflict
        ? `Do you need ${conflict.goalName} funded before this event begins? If so, move the event later or change the goal plan, then compare again.`
        : "If these cost estimates are realistic, you can proceed without trading away a goal date.";
  return {
    priority: overallTone === "high" ? "High Priority" : overallTone === "medium" ? "Medium Priority" : "Low Priority",
    tone: overallTone,
    headline,
    evidence,
    decision,
    goalRows,
  } as const;
}

export function LifeSimulatorClient() {
  const [context, setContext] = useState<LifeSimulatorContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState("");
  const [form, setForm] = useState<ScenarioForm | null>(null);
  const [generatedForm, setGeneratedForm] = useState<ScenarioForm | null>(null);
  const [analysis, setAnalysis] = useState<LifeScenarioAnalysis | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<LifeScenario[]>([]);
  const [savedScenariosLoading, setSavedScenariosLoading] = useState(true);
  const [showSavedChanges, setShowSavedChanges] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [genericError, setGenericError] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getLifeSimulatorContext().then((result) => {
      if (cancelled) return;
      setContext(result);
      setForm(defaultForm(result, nextMonthAfter(result.asOf)));
    }).catch((error: unknown) => {
      if (!cancelled) setContextError(errorMessage(error, "Could not load your goals."));
    }).finally(() => {
      if (!cancelled) setContextLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.listLifeScenarios().then((items) => {
      if (!cancelled) setSavedScenarios(items);
    }).catch((error: unknown) => {
      if (!cancelled) setGenericError(errorMessage(error, "Could not load saved events."));
    }).finally(() => {
      if (!cancelled) setSavedScenariosLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!context) return;
    const copilotEventId = new URLSearchParams(window.location.search).get("copilotEvent");
    if (!copilotEventId) return;

    let cancelled = false;
    setAnalysisLoading(true);
    setGenericError("");
    api.listCopilotEvents().then((events) => {
      const event = events.find((item) => item.id === copilotEventId);
      if (!event) throw new Error("That Copilot purchase could not be found. Open it again from the extension.");

      const monthlyCostCents = event.pageType === "rental" || event.pageType === "vehicle_financing"
        ? Math.max(0, event.metrics.monthlyChangeCents ?? 0)
        : 0;
      const oneTimeCostCents = event.pageType === "checkout"
        ? event.extractedPriceCents
        : event.pageType === "debt_payment"
          ? event.metrics.debtPayment?.paidCents ?? event.extractedPriceCents
          : 0;
      const eventKind = event.pageType === "rental" ? "rental" : event.pageType === "vehicle_financing" ? "vehicle" : event.pageType === "debt_payment" ? "payment" : "purchase";
      const customEventName = `${event.merchant.trim() || "Current"} ${eventKind}`.slice(0, 40);
      const importedForm: ScenarioForm = {
        ...defaultForm(context, nextMonthAfter(context.asOf)),
        eventType: "custom",
        customEventName,
        monthlyCostCents,
        oneTimeCostCents,
        selectedOption: "keep",
        selectedGoalIds: context.goals.map((goal) => goal.id),
        split: autoSplit(context.goals, context.freeCashCents - monthlyCostCents),
      };
      return api.analyzeLifeScenario({ body: importedForm }).then((result) => ({ importedForm, result }));
    }).then(({ importedForm, result }) => {
      if (cancelled) return;
      setForm(importedForm);
      setGeneratedForm({ ...importedForm, split: { ...importedForm.split }, selectedGoalIds: [...importedForm.selectedGoalIds] });
      setAnalysis(result);
      setCurrentScenarioId(null);
      setShowSavedChanges(false);
      setSaved(false);
      const url = new URL(window.location.href);
      url.searchParams.delete("copilotEvent");
      window.history.replaceState({}, "", url);
    }).catch((error: unknown) => {
      if (!cancelled) setGenericError(errorMessage(error, "Could not compare this item with your goals."));
    }).finally(() => {
      if (!cancelled) setAnalysisLoading(false);
    });
    return () => { cancelled = true; };
  }, [context]);

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 3 * 60 * 1000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  function updateForm(next: ScenarioForm) {
    const split = context ? autoSplit(context.goals, context.freeCashCents - next.monthlyCostCents) : next.split;
    setForm({ ...next, split, selectedGoalIds: context?.goals.map((goal) => goal.id) ?? next.selectedGoalIds });
    setSaved(false);
  }

  async function saveChanges() {
    if (!context || !generatedForm) return;
    setSaving(true);
    setGenericError("");
    try {
      const current = await api.getLifeSimulatorContext();
      if (current.goals.length === 0) throw new Error("Add a goal before saving this comparison.");
      const currentForm = formForCurrentContext(generatedForm, current);
      const currentAnalysis = await api.analyzeLifeScenario({ body: currentForm });
      const baseName = currentForm.eventType === "custom" ? currentForm.customEventName.trim() || "Your Event" : EVENT_LABEL[currentForm.eventType];
      const currentScenario = savedScenarios.find((scenario) => scenario.id === currentScenarioId);
      const currentLabels = savedScenarioLabels(savedScenarios);
      const existingNames = new Set([...currentLabels.entries()].filter(([id]) => id !== currentScenarioId).map(([, label]) => label.toLocaleLowerCase()));
      let name = baseName;
      let suffix = 1;
      if (currentScenario && eventNameFor(currentScenario) === baseName) {
        name = currentLabels.get(currentScenario.id) ?? baseName;
      } else while (existingNames.has(name.toLocaleLowerCase())) {
        name = `${baseName} (${suffix})`;
        suffix += 1;
      }
      const savedScenario = currentScenarioId
        ? await api.updateLifeScenario({ params: { id: currentScenarioId }, body: { ...currentForm, name } })
        : await api.createLifeScenario({ body: { ...currentForm, name } });
      setContext(current);
      setForm(currentForm);
      setGeneratedForm(currentForm);
      setAnalysis(currentAnalysis);
      setCurrentScenarioId(savedScenario.id);
      setSavedScenarios((items) => [savedScenario, ...items.filter((item) => item.id !== savedScenario.id)]);
      setSaved(true);
    } catch (error) {
      setGenericError(errorMessage(error, "Could not save these changes."));
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    if (!generatedForm) return;
    setPdfLoading(true);
    setGenericError("");
    try {
      const current = await api.getLifeSimulatorContext();
      if (current.goals.length === 0) throw new Error("Add a goal before exporting this comparison.");
      const currentForm = formForCurrentContext(generatedForm, current);
      const currentAnalysis = await api.analyzeLifeScenario({ body: currentForm });
      setContext(current);
      setForm(currentForm);
      setGeneratedForm(currentForm);
      setAnalysis(currentAnalysis);
      const report = await api.exportLifeScenarioPdf({ body: currentForm });
      const binary = window.atob(report.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = report.filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setGenericError(errorMessage(error, "Could not download this comparison."));
    } finally {
      setPdfLoading(false);
    }
  }

  async function generate() {
    if (!context || !form) return;
    setAnalysisLoading(true);
    setGenericError("");
    try {
      const current = await api.getLifeSimulatorContext();
      if (current.goals.length === 0) throw new Error("Add a goal before modeling a life event.");
      const nextForm = formForCurrentContext(form, current);
      const result = await api.analyzeLifeScenario({ body: nextForm });
      setContext(current);
      setAnalysis(result);
      setForm(nextForm);
      setGeneratedForm({ ...nextForm, split: { ...nextForm.split }, selectedGoalIds: [...nextForm.selectedGoalIds] });
      setFieldError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) setFieldError({ code: error.code, message: error.message });
      else setGenericError(errorMessage(error, "Could not generate this comparison."));
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function openSavedEvent(id: string) {
    if (!context) return;
    setAnalysisLoading(true);
    setGenericError("");
    try {
      const [scenario, current] = await Promise.all([
        api.getLifeScenario({ params: { id } }),
        api.getLifeSimulatorContext(),
      ]);
      if (current.goals.length === 0) throw new Error("Add a goal before reviewing this comparison.");
      const {
        id: scenarioId,
        name: _name,
        status: _status,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...savedInput
      } = scenario;
      const restoredForm = formForCurrentContext({
        ...savedInput,
      }, current);
      const result = await api.analyzeLifeScenario({ body: restoredForm });
      setContext(current);
      setCurrentScenarioId(scenarioId);
      setForm(restoredForm);
      setGeneratedForm(restoredForm);
      setAnalysis(result);
      setSaved(false);
      setShowSavedChanges(true);
      setFieldError(null);
    } catch (error) {
      setGenericError(errorMessage(error, "Could not open this saved event."));
    } finally {
      setAnalysisLoading(false);
    }
  }

  if (contextLoading) return <><PageHeader title="Life Events" /><p className="py-16 text-center text-sm" style={{ color: "var(--ink-muted)" }}>Loading your goals…</p></>;
  if (contextError || !context) return <><PageHeader title="Life Events" /><p role="alert" className="py-16 text-center text-sm" style={{ color: "var(--critical)" }}>{contextError || "Could not load life events."}</p></>;
  if (context.goals.length === 0) return <><PageHeader title="Life Events" /><p className="py-12 text-center text-sm" style={{ color: "var(--ink-muted)" }}>Add a goal before modeling a life event. <a href="/goals" className="font-semibold underline">Go to Goals</a></p></>;
  if (!form) return null;

  const eventName = form.eventType === "custom" ? form.customEventName.trim() || "your event" : EVENT_LABEL[form.eventType].toLowerCase();
  const generatedEventName = generatedForm
    ? generatedForm.eventType === "custom" ? generatedForm.customEventName.trim() || "your event" : EVENT_LABEL[generatedForm.eventType].toLowerCase()
    : eventName;
  const hasUnappliedEdits = !!generatedForm && JSON.stringify(form) !== JSON.stringify(generatedForm);
  const scenarioLabels = savedScenarioLabels(savedScenarios);

  return <>
    <PageHeader title="Life Events" action={<div className="flex items-center gap-3">
      <button type="button" onClick={() => setShowSavedChanges((showing) => !showing)} className="min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7] focus-visible:ring-offset-2" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>{showSavedChanges ? "Model Changes" : "Saved Changes"}</button>
      {saved && <span role="status" aria-live="polite" className="text-xs font-medium" style={{ color: "var(--good)" }}>Saved ✓</span>}
      <button type="button" onClick={() => void downloadPdf()} disabled={pdfLoading || !generatedForm || hasUnappliedEdits} className="min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors hover:bg-[var(--surface-inset)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7] focus-visible:ring-offset-2" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>{pdfLoading ? "Preparing PDF…" : "Download PDF"}</button>
      <button type="button" onClick={() => void saveChanges()} disabled={saving || !generatedForm || hasUnappliedEdits} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7] focus-visible:ring-offset-2" style={{ background: "var(--accent)" }}>{saving ? "Saving…" : "Save Changes"}</button>
    </div>} />
    <div className="space-y-5">
      <p className="-mt-3 text-sm" style={{ color: "var(--ink-muted)" }}>Model an event and compare its effect across all of your goals. As of {formatDate(context.asOf)}.</p>

      {genericError && <p role="alert" className="px-4 py-3 text-sm" style={{ background: "var(--critical-bg)", color: "var(--critical)" }}>{genericError}</p>}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card title={showSavedChanges ? "Saved Models" : "Model an Event"} className="min-w-0">
          {showSavedChanges
            ? <div>
                <p className="mb-3 text-xs" style={{ color: "var(--ink-muted)" }}>Choose a saved event to review its charts, goal dates, and decision insight. The insight refreshes against your current goals.</p>
                {savedScenariosLoading
                  ? <p className="py-8 text-center text-sm" style={{ color: "var(--ink-muted)" }}>Loading saved models…</p>
                  : savedScenarios.length
                    ? <div className="divide-y" style={{ borderColor: "var(--border)" }}>{savedScenarios.map((scenario) => <div key={scenario.id} className="flex min-h-16 flex-wrap items-center justify-between gap-2 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                        <div className="min-w-0"><p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{scenarioLabels.get(scenario.id) ?? eventNameFor(scenario)}</p><p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>Updated {formatDate(scenario.updatedAt)}</p></div>
                        <button type="button" onClick={() => void openSavedEvent(scenario.id)} disabled={analysisLoading} className="min-h-10 shrink-0 px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7] disabled:opacity-50" style={{ color: "var(--accent)" }}>{analysisLoading && currentScenarioId === scenario.id ? "Opening…" : currentScenarioId === scenario.id ? "Currently Viewing" : "View Charts"}</button>
                      </div>)}</div>
                    : <p className="py-8 text-center text-sm" style={{ color: "var(--ink-muted)" }}>No saved models yet. Generate an event, then choose Save Changes.</p>}
                {currentScenarioId && analysis && generatedForm && <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                  <p className="mb-2 text-xs font-semibold" style={{ color: "var(--ink-muted)" }}>Current Insight for {generatedEventName}</p>
                  <ScenarioInsight analysis={analysis} />
                </div>}
              </div>
            : <>
                <EventForm context={context} form={form} onChange={updateForm} error={fieldError} />
                <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                  <button type="button" onClick={() => void generate()} disabled={analysisLoading} className="min-h-12 w-full rounded-xl px-6 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7] focus-visible:ring-offset-2" style={{ background: "var(--accent)" }}>{analysisLoading ? "Generating…" : "Generate"}</button>
                </div>
                {analysis && generatedForm && <ScenarioInsight analysis={analysis} />}
              </>}
        </Card>

        <div className="min-w-0 space-y-5">
          {analysis && generatedForm && <LifeSimulatorCharts context={context} analysis={analysis} />}

          <section aria-labelledby="funded-heading" className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface-raised)" }}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="funded-heading" className="font-poppins text-lg font-bold" style={{ color: "var(--ink)" }}>When Each Goal Gets Funded</h2><p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>{generatedForm ? `Generated for ${generatedEventName}` : "Results appear after Generate"}</p></div><span className="rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums" style={{ color: "#176b5a", background: "#e5f3ed" }}>{analysis ? `${analysis.goals.filter((goal) => goal.included).length} goals compared` : `${context.goals.length} goals`}</span></div>
            {analysis && generatedForm
              ? <GoalTimeline goals={analysis.goals} />
              : <div className="flex min-h-56 items-center justify-center px-5 text-center" style={{ background: "var(--surface-inset)" }}><p className="max-w-xs text-sm leading-6" style={{ color: "var(--ink-muted)" }}>Your goal funding dates will appear here after you generate a comparison.</p></div>}
            {hasUnappliedEdits && <p className="mt-3 text-xs" style={{ color: "var(--warning)" }}>Your inputs changed. Generate again to refresh these results.</p>}
          </section>

        </div>
      </div>

      <p className="border-t pt-3 text-xs leading-5" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>Projections are estimates, not guarantees.</p>
    </div>

  </>;
}

function ScenarioInsight({ analysis }: { analysis: LifeScenarioAnalysis }) {
  const insight = scenarioInsight(analysis);
  const colors = {
    low: { text: "#087653", background: "#e6faf4" },
    medium: { text: "#915600", background: "#fff5e6" },
    high: { text: "#a62840", background: "#ffecee" },
  }[insight.tone];
  return <section aria-live="polite" aria-label="Event insight" className="mt-4 rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface-raised)" }}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: "var(--border)" }}>
      <h3 className="text-sm font-bold" style={{ color: "var(--accent)" }}>Decision Insight</h3>
      <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: colors.text, background: colors.background }}>{insight.priority}</span>
    </div>
    <p className="mt-3 text-sm font-semibold leading-5" style={{ color: "var(--ink)" }}>{insight.headline}</p>
    <div className="mt-3 rounded-lg p-3" style={{ background: "var(--surface-inset)" }}>
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>Current Picture</p>
      <p className="mt-1 text-sm leading-5" style={{ color: "var(--ink-secondary)" }}>{insight.evidence}</p>
    </div>
    <ul className="mt-3 divide-y border-y" style={{ borderColor: "var(--border)" }} aria-label="Priority by goal">
      {insight.goalRows.map(({ goal, tone, priority, progress, change }) => {
        const goalColors = {
          low: { text: "#087653", background: "#e6faf4" },
          medium: { text: "#915600", background: "#fff5e6" },
          high: { text: "#a62840", background: "#ffecee" },
        }[tone]!;
        return <li key={goal.goalId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
          <span className="min-w-0 flex-1"><strong>{goal.name}</strong><span className="ml-2" style={{ color: "var(--ink-muted)" }}>{progress} · {change}</span></span>
          <span className="shrink-0 rounded-full px-2 py-1 font-semibold" style={{ color: goalColors.text, background: goalColors.background }}>{priority}</span>
        </li>;
      })}
    </ul>
    <div className="mt-3 rounded-lg border px-3 py-2.5" style={{ borderColor: "#e3e0ff", background: "#f7f6ff" }}>
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>Decision to Make</p>
      <p className="mt-1 text-sm leading-5" style={{ color: "var(--ink)" }}>{insight.decision}</p>
    </div>
  </section>;
}
