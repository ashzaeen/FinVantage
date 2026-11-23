"use client";

import { useRouter } from "next/navigation";
import { useState, type DragEvent, type FormEvent } from "react";
import { formatPercent, formatUsd, type Account, type Goal, type GoalAllocation, type GoalFunding, type GoalFundingRow, type GoalMilestones, type GoalOutcome, type GoalStatus, type NewGoal } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { Card } from "@/components/ui/Card";
import { GoalsAnalysisChart } from "./GoalsAnalysisChart";
import { CountUp } from "@/components/ui/CountUp";
import { monthYear, plural, longDate } from "@/lib/format";
import { GoalAllocationCard } from "./GoalAllocationCard";

function FundingLines({ row }: { row: GoalFundingRow }) {
  if (row.remainingCents <= 0) return null;
  return (
    <div className="mt-1 space-y-1 text-xs" style={{ color: "var(--ink-muted)" }}>
      <p>
        {row.pastDue
          ? <>The target date has passed. Needs about <strong style={{ color: "var(--ink)" }}>{formatUsd(row.neededPerMonthCents)}</strong> to finish.</>
          : <>Needs about <strong style={{ color: "var(--ink)" }}>{formatUsd(row.neededPerMonthCents)}</strong> a month for {plural(row.monthsLeft, "month")}</>}
      </p>
      {row.medianCompletionDate && <p>Median finish: <strong style={{ color: "var(--ink)" }}>{monthYear(row.medianCompletionDate)}</strong></p>}
    </div>
  );
}

function FundingSummary({ funding }: { funding: GoalFunding }) {
  if (funding.neededPerMonthCents <= 0) return null;
  return (
    <Card lift={false}>
      <h2 className="font-semibold text-ink">Monthly Funding</h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Together your goals need about <strong>{formatUsd(funding.neededPerMonthCents)}</strong> a month at a steady pace. You set aside about <strong>{formatUsd(funding.monthlySavingsCents)}</strong> a month.
      </p>
      <p className="mt-1 text-xs text-muted">The simulated odds also count interest and growth, so they can read higher than this simple division suggests.</p>
    </Card>
  );
}

function priorityLabel(priorityRank: number) {
  if (priorityRank === 1) return "High";
  if (priorityRank === 2) return "Medium";
  return "Low";
}

type VisibleGoalStatus = Exclude<GoalStatus, "done">;

function goalStatus(goal: Goal): VisibleGoalStatus {
  if (goal.status === "done") return "achieved";
  if (goal.status) return goal.status;
  if (goal.currentCents >= goal.targetCents) return "achieved";
  return goal.currentCents > 0 ? "in_progress" : "not_started";
}

const GOAL_STATUSES: { id: VisibleGoalStatus; label: string; hint: string; accent: string }[] = [
  { id: "not_started", label: "To Do", hint: "Ready when you are", accent: "var(--ink-muted)" },
  { id: "in_progress", label: "In Progress", hint: "Currently saving", accent: "var(--series-1)" },
  { id: "achieved", label: "Achieved", hint: "Target reached", accent: "var(--gain)" },
];

function GoalCard({ goal, outcome, marks, funding, onOpen, draggable = false, onDragStart, onDragEnd, onMove, moving = false }: { goal: Goal; outcome?: GoalOutcome; marks?: GoalMilestones; funding?: GoalFundingRow; onOpen: () => void; draggable?: boolean; onDragStart?: (event: DragEvent<HTMLDivElement>) => void; onDragEnd?: () => void; onMove?: (status: VisibleGoalStatus) => void; moving?: boolean }) {
  const progress = Math.min(100, (goal.currentCents / goal.targetCents) * 100);
  const isFlexible = goal.flexibility === "flexible";

  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} title={draggable ? "Drag this card to move it" : undefined} className={draggable ? "cursor-grab rounded-3xl active:cursor-grabbing" : undefined}>
    <Card>
      <div>
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="min-h-6 min-w-0 truncate py-0.5 text-left font-semibold text-ink hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink">{goal.name}</button>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: isFlexible ? "var(--good-bg)" : "var(--accent-soft)", color: isFlexible ? "var(--gain)" : "var(--accent-ink)" }}>
          {isFlexible ? "Flexible" : "Fixed"}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--ink)" }}><CountUp value={goal.currentCents} /></p>
          <p className="text-xs" style={{ color: "var(--ink-muted)" }}>of {formatUsd(goal.targetCents)} goal</p>
        </div>
        <span className="text-lg font-bold" style={{ color: "var(--accent-ink)" }}><CountUp value={Math.round(progress) / 100} format="percent" /></span>
      </div>
      <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
        <div className="meter-fill h-2.5 rounded-full transition-all" style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--series-1) 0%, var(--progress-end) 100%)" }} />
        {/* The quarter marks: thin gaps in the bar at 25, 50 and 75 percent. */}
        {marks?.milestones.map((m) => <span key={m.share} aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-raised" style={{ left: `${m.share * 100}%` }} />)}
      </div>
      {marks && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--ink-muted)" }}>
          {marks.next
            ? <>Next mark, {formatPercent(marks.next.share)}: <strong style={{ color: "var(--ink)" }}>{formatUsd(marks.next.remainingCents)}</strong> to go</>
            : "Every mark reached"}
        </p>
      )}
      {funding && <FundingLines row={funding} />}
      <p className="mt-2.5 text-xs" style={{ color: "var(--ink-muted)" }}>
        Target date: <strong style={{ color: "var(--ink)" }}>{longDate(goal.targetDate)}</strong>
      </p>
      <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>Priority: <strong style={{ color: "var(--ink)" }}>{priorityLabel(goal.priorityRank)}</strong></p>
      <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>Status: <strong style={{ color: "var(--ink)" }}>{GOAL_STATUSES.find((status) => status.id === goalStatus(goal))?.label}</strong></p>
      {outcome && <div className="mt-3 rounded-xl p-3" style={{ background: "var(--surface-inset)" }}>
        <ProbabilityRange low={outcome.probabilityLow} high={outcome.probabilityHigh} />
      </div>}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
        <button type="button" onClick={onOpen} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink">Manage</button>
        {onMove && <label className="flex items-center gap-2 whitespace-nowrap text-xs text-muted"><span>Move To</span><select aria-label={`Move ${goal.name} to`} value={goalStatus(goal)} disabled={moving} onChange={(event) => onMove(event.target.value as VisibleGoalStatus)} className="max-w-32 rounded-lg border border-line bg-raised px-2 py-1.5 text-xs font-semibold text-ink-secondary outline-none focus:border-accent-ink disabled:opacity-60">{GOAL_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>}
        {moving && <span className="text-xs text-muted">Saving…</span>}
      </div>
      </div>
    </Card>
    </div>
  );
}

export function GoalsClient({ goals, outcomes, milestones, funding, allocation, accounts }: { goals: Goal[]; outcomes: GoalOutcome[]; milestones: GoalMilestones[]; funding: GoalFunding | null; allocation: GoalAllocation | null; accounts: Account[] }) {
  const fundingFor = (goalId: string) => funding?.goals.find((row) => row.goalId === goalId);
  const router = useRouter();
  const [view, setView] = useState<"board" | "cards" | "analysis">("board");
  const [showForm, setShowForm] = useState(false);
  const [newGoalStatus, setNewGoalStatus] = useState<VisibleGoalStatus>("not_started");
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [movingGoalId, setMovingGoalId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<VisibleGoalStatus | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  function openCreateGoal(status: VisibleGoalStatus = "not_started") {
    setError("");
    setSelectedGoal(null);
    setNewGoalStatus(status);
    setShowForm(true);
  }

  async function moveGoal(goalId: string, status: VisibleGoalStatus) {
    const goal = goals.find((item) => item.id === goalId);
    if (!goal || goalStatus(goal) === status || saving) return;
    const body: NewGoal = {
      name: goal.name,
      targetCents: goal.targetCents,
      currentCents: goal.currentCents,
      targetDate: goal.targetDate,
      priorityRank: goal.priorityRank,
      flexibility: goal.flexibility,
      linkedAccountId: goal.linkedAccountId,
      status,
    };
    setSaving(true);
    setMovingGoalId(goalId);
    setError("");
    try {
      await api.updateGoal({ params: { id: goal.id }, body });
      setFeedback(`${goal.name} moved to ${GOAL_STATUSES.find((item) => item.id === status)?.label}.`);
      router.refresh();
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Could not move this goal.");
    } finally {
      setSaving(false);
      setMovingGoalId(null);
    }
  }

  async function deleteGoal() {
    if (!selectedGoal || saving) return;
    setSaving(true);
    setError("");
    try {
      await api.deleteGoal({ params: { id: selectedGoal.id } });
      setSelectedGoal(null);
      setConfirmDelete(false);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this goal.");
    } finally {
      setSaving(false);
    }
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const target = Number(form.get("target"));
    const current = Number(form.get("current"));
    const priority = String(form.get("priority"));
    const priorityRank = priority === "high" ? 1 : priority === "low" ? 3 : 2;
    if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(current) || current < 0) {
      setError("Enter a target above $0 and a current balance of $0 or more.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const body = {
        name: String(form.get("name")).trim(),
        targetCents: Math.round(target * 100),
        currentCents: Math.round(current * 100),
        targetDate: String(form.get("targetDate")),
        priorityRank,
        flexibility: String(form.get("flexibility")) as Goal["flexibility"],
        linkedAccountId: String(form.get("linkedAccountId")) || null,
        status: String(form.get("status")) as GoalStatus,
      };
      if (selectedGoal) {
        await api.updateGoal({ params: { id: selectedGoal.id }, body });
      } else {
        await api.createGoal({ body });
      }
      setShowForm(false);
      setSelectedGoal(null);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this goal.");
    } finally {
      setSaving(false);
    }
  }

  const analysisData = GOAL_STATUSES.map((status) => ({
    label: status.label,
    count: goals.filter((goal) => goalStatus(goal) === status.id).length,
    color: status.accent,
  }));

  return <>
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Track the things you’re saving toward.</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="inline-flex flex-wrap rounded-xl bg-inset p-1" aria-label="Goal views">
          <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${view === "board" ? "bg-raised text-accent-ink shadow-sm" : "text-muted"}`}>Board</button>
          <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${view === "cards" ? "bg-raised text-accent-ink shadow-sm" : "text-muted"}`}>Cards</button>
          <button type="button" aria-pressed={view === "analysis"} onClick={() => setView("analysis")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${view === "analysis" ? "bg-raised text-accent-ink shadow-sm" : "text-muted"}`}>Analysis</button>
        </div>
      </div>
    </div>

    {error && !selectedGoal && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
    <p role="status" aria-live="polite" className="sr-only">{feedback}</p>

    {funding && view !== "analysis" && <div className="mb-4"><FundingSummary funding={funding} /></div>}

    {allocation && view !== "analysis" && <div className="mb-4"><GoalAllocationCard allocation={allocation} goals={goals} /></div>}

    {view === "analysis" ? <GoalsAnalysisChart data={analysisData} /> : view === "board" ? <>
      <p className="mb-3 text-xs text-muted">Drag a goal card anywhere into another column, choose “Move To” for a quick status change, or select Manage to edit all details.</p>
      <div className="page-cascade grid grid-cols-1 gap-4 xl:grid-cols-3">
      {GOAL_STATUSES.map((column) => {
        const columnGoals = goals.filter((goal) => goalStatus(goal) === column.id);
        const isDragTarget = dragOverColumn === column.id;
        return <section key={column.id} aria-labelledby={`goal-column-${column.id}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverColumn(column.id); }} onDrop={(event) => { event.preventDefault(); const goalId = event.dataTransfer.getData("text/plain"); setDragOverColumn(null); void moveGoal(goalId, column.id); }} className={`min-h-60 rounded-2xl border p-3 transition-colors sm:p-4 ${isDragTarget ? "border-accent-ink bg-accent-soft ring-2 ring-accent-ink/15" : "border-line bg-surface"}`}>
          <header className="mb-3 flex items-center justify-between px-1">
            <div><h2 id={`goal-column-${column.id}`} className="flex items-center gap-2 font-poppins text-sm font-bold text-ink"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: column.accent }} />{column.label}</h2><p className="mt-1 pl-4 text-xs text-muted">{column.hint}</p></div>
            <div className="flex items-center gap-2"><span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-raised px-2 text-xs font-semibold text-ink-chart">{columnGoals.length}</span><button type="button" onClick={() => openCreateGoal(column.id)} aria-label={`Add a goal to ${column.label}`} className="rounded-lg px-2 py-1 text-sm font-semibold text-accent-ink hover:bg-raised">+ Add</button></div>
          </header>
          <div className="page-cascade space-y-3">
            {columnGoals.map((goal) => <GoalCard key={goal.id} goal={goal} outcome={outcomes.find((outcome) => outcome.goalId === goal.id)} marks={milestones.find((m) => m.goalId === goal.id)} funding={fundingFor(goal.id)} draggable moving={movingGoalId === goal.id} onMove={(status) => { void moveGoal(goal.id, status); }} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", goal.id); }} onDragEnd={() => setDragOverColumn(null)} onOpen={() => { setError(""); setFeedback(""); setConfirmDelete(false); setSelectedGoal(goal); }} />)}
            {!columnGoals.length && <p className="rounded-xl border border-dashed border-line-strong bg-raised/70 px-3 py-6 text-center text-xs text-muted">Drop a goal here or use + Add in this column.</p>}
          </div>
        </section>;
      })}
      </div>
    </> : <div className="page-cascade grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      <button type="button" onClick={() => openCreateGoal()} className="flex min-h-64 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-line-strong bg-raised p-8 text-center transition hover:border-accent-ink hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-2xl font-semibold text-accent-ink">+</span>
        <span className="mt-3 font-semibold text-ink">Add a goal</span>
        <span className="mt-1 text-sm text-muted">Create another savings goal</span>
      </button>
      {goals.map((goal) => <GoalCard key={goal.id} goal={goal} outcome={outcomes.find((outcome) => outcome.goalId === goal.id)} marks={milestones.find((m) => m.goalId === goal.id)} funding={fundingFor(goal.id)} onOpen={() => { setError(""); setConfirmDelete(false); setSelectedGoal(goal); }} />)}
    </div>}

    {(showForm || selectedGoal) && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setShowForm(false); setSelectedGoal(null); setConfirmDelete(false); } }} className="fixed inset-0 z-[100] flex justify-center overflow-y-auto bg-ink/45 [&>*]:my-auto p-3 backdrop-blur-[2px] sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="goal-form-title" className="w-full max-w-xl overflow-hidden rounded-3xl bg-raised shadow-2xl">
        <header className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor: "var(--border)" }}>
          <div><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent-ink)" }}>{selectedGoal ? "Manage goal" : "New goal"}</p><h2 id="goal-form-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--ink)" }}>{selectedGoal?.name ?? "Add a savings goal"}</h2><p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>{selectedGoal ? "Update the details and save your changes." : "Choose what you’re saving for and when you need it."}</p></div>
          <button type="button" onClick={() => { setShowForm(false); setSelectedGoal(null); setConfirmDelete(false); }} disabled={saving} aria-label="Close form" className="rounded-lg px-2 text-2xl leading-none disabled:opacity-50" style={{ color: "var(--ink-muted)" }}>×</button>
        </header>
        {selectedGoal && <section className="mx-6 mt-5 rounded-2xl p-4" style={{ background: "var(--surface-inset)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Likelihood of reaching this goal</h3>
          <div className="mt-2">{outcomes.find((outcome) => outcome.goalId === selectedGoal.id)
            ? <ProbabilityRange low={outcomes.find((outcome) => outcome.goalId === selectedGoal.id)!.probabilityLow} high={outcomes.find((outcome) => outcome.goalId === selectedGoal.id)!.probabilityHigh} />
            : <p className="text-sm" style={{ color: "var(--ink-muted)" }}>A likelihood estimate is not available yet.</p>}</div>
        </section>}
        <form onSubmit={saveGoal} className="space-y-4 p-6">
          <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Goal name *
            <input name="name" required maxLength={80} defaultValue={selectedGoal?.name ?? ""} placeholder="e.g. Emergency fund" className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-4 py-3 outline-none focus:border-[var(--accent-ink)]" style={{ borderColor: "var(--border)" }} />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Target amount *
              <div className="mt-2 flex items-center rounded-xl border bg-[var(--surface-inset)] px-3 focus-within:border-[var(--accent-ink)]" style={{ borderColor: "var(--border)" }}><span className="text-sm" style={{ color: "var(--ink-muted)" }}>$</span><input name="target" type="number" min="0.01" step="0.01" required defaultValue={selectedGoal ? (selectedGoal.targetCents / 100).toFixed(2) : ""} placeholder="10,000" className="w-full bg-transparent px-2 py-3 outline-none" /></div>
            </label>
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Already saved
              <div className="mt-2 flex items-center rounded-xl border bg-[var(--surface-inset)] px-3 focus-within:border-[var(--accent-ink)]" style={{ borderColor: "var(--border)" }}><span className="text-sm" style={{ color: "var(--ink-muted)" }}>$</span><input name="current" type="number" min="0" step="0.01" defaultValue={selectedGoal ? (selectedGoal.currentCents / 100).toFixed(2) : "0"} className="w-full bg-transparent px-2 py-3 outline-none" /></div>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Target date *
              <input name="targetDate" type="date" required defaultValue={selectedGoal?.targetDate ?? `${new Date().getFullYear() + 1}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`} className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-3 py-3 outline-none focus:border-[var(--accent-ink)]" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Priority
              <select name="priority" defaultValue={selectedGoal ? priorityLabel(selectedGoal.priorityRank).toLowerCase() : "medium"} className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-3 py-3 outline-none focus:border-[var(--accent-ink)]" style={{ borderColor: "var(--border)" }}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
            </label>
          </div>
          <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Status
            <select name="status" defaultValue={selectedGoal ? goalStatus(selectedGoal) : newGoalStatus} className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-3 py-3 outline-none focus:border-[var(--accent-ink)]" style={{ borderColor: "var(--border)" }}>{GOAL_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Flexibility
              <select name="flexibility" defaultValue={selectedGoal?.flexibility ?? "flexible"} className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-3 py-3 outline-none focus:border-[var(--accent-ink)]" style={{ borderColor: "var(--border)" }}><option value="flexible">Flexible</option><option value="non_negotiable">Non-negotiable</option></select>
            </label>
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Linked account <span style={{ color: "var(--ink-muted)" }}>(optional)</span>
              <select name="linkedAccountId" defaultValue={selectedGoal?.linkedAccountId ?? ""} className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-3 py-3 outline-none focus:border-[var(--accent-ink)]" style={{ borderColor: "var(--border)" }}><option value="">No linked account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
            </label>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {selectedGoal && confirmDelete && <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">Delete “{selectedGoal.name}”?</p>
            <p className="mt-1 text-sm text-red-700">This goal will be removed from your list and future simulations.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={saving} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-secondary disabled:opacity-50">Keep goal</button>
              <button type="button" onClick={deleteGoal} disabled={saving} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Deleting…" : "Delete goal"}</button>
            </div>
          </section>}
          <div className="flex justify-end gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            {selectedGoal && !confirmDelete && <button type="button" onClick={() => setConfirmDelete(true)} disabled={saving} className="mr-auto rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Delete goal</button>}
            <button type="button" onClick={() => { setShowForm(false); setSelectedGoal(null); setConfirmDelete(false); }} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ color: "var(--ink-muted)" }}>Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>{saving ? "Saving…" : selectedGoal ? "Save changes" : "Create goal"}</button>
          </div>
        </form>
      </div>
    </div>}
  </>;
}
