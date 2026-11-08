"use client";

import { useRouter } from "next/navigation";
import { useState, type DragEvent, type FormEvent } from "react";
import { formatUsd, type Account, type Goal, type GoalOutcome, type GoalStatus, type NewGoal } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { Card } from "@/components/ui/Card";
import { GoalsAnalysisChart } from "./GoalsAnalysisChart";

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
  { id: "not_started", label: "To-do", hint: "Ready when you are", accent: "#8d94a8" },
  { id: "in_progress", label: "In progress", hint: "Currently saving", accent: "#544af7" },
  { id: "achieved", label: "Achieved", hint: "Target reached", accent: "#0b8f69" },
];

function GoalCard({ goal, outcome, onOpen, draggable = false, onDragStart, onDragEnd, onMove, moving = false }: { goal: Goal; outcome?: GoalOutcome; onOpen: () => void; draggable?: boolean; onDragStart?: (event: DragEvent<HTMLDivElement>) => void; onDragEnd?: () => void; onMove?: (status: VisibleGoalStatus) => void; moving?: boolean }) {
  const progress = Math.min(100, (goal.currentCents / goal.targetCents) * 100);
  const isFlexible = goal.flexibility === "flexible";

  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} title={draggable ? "Drag this card to move it" : undefined} className={draggable ? "cursor-grab rounded-3xl active:cursor-grabbing" : undefined}>
    <Card>
      <div>
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 truncate text-left font-semibold text-[#16192c] hover:text-[#544af7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]">{goal.name}</button>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: isFlexible ? "var(--good-bg)" : "var(--accent-soft, #eceeff)", color: isFlexible ? "var(--good)" : "var(--accent)" }}>
          {isFlexible ? "Flexible" : "Fixed"}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(goal.currentCents)}</p>
          <p className="text-xs" style={{ color: "var(--ink-muted)" }}>of {formatUsd(goal.targetCents)} goal</p>
        </div>
        <span className="text-lg font-bold" style={{ color: "var(--accent)" }}>{Math.round(progress)}%</span>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
        <div className="h-2.5 rounded-full transition-all" style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--accent) 0%, #818cf8 100%)" }} />
      </div>
      <p className="mt-2.5 text-xs" style={{ color: "var(--ink-muted)" }}>
        Target date: <strong style={{ color: "var(--ink)" }}>{goal.targetDate}</strong>
      </p>
      <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>Priority: <strong style={{ color: "var(--ink)" }}>{priorityLabel(goal.priorityRank)}</strong></p>
      <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>Status: <strong style={{ color: "var(--ink)" }}>{GOAL_STATUSES.find((status) => status.id === goalStatus(goal))?.label}</strong></p>
      {outcome && <div className="mt-3 rounded-xl p-3" style={{ background: "var(--surface-inset)" }}>
        <ProbabilityRange low={outcome.probabilityLow} high={outcome.probabilityHigh} />
      </div>}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#edf0f7] pt-3">
        <button type="button" onClick={onOpen} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#544af7] hover:bg-[#eef1fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]">Manage</button>
        {onMove && <label className="flex items-center gap-2 text-xs text-[#8d94a8]"><span>Move to</span><select aria-label={`Move ${goal.name} to`} value={goalStatus(goal)} disabled={moving} onChange={(event) => onMove(event.target.value as VisibleGoalStatus)} className="max-w-32 rounded-lg border border-[#e6e9f2] bg-white px-2 py-1.5 text-xs font-semibold text-[#4a4f68] outline-none focus:border-[#544af7] disabled:opacity-60">{GOAL_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>}
        {moving && <span className="text-xs text-[#8d94a8]">Saving…</span>}
      </div>
      </div>
    </Card>
    </div>
  );
}

export function GoalsClient({ goals, outcomes, accounts }: { goals: Goal[]; outcomes: GoalOutcome[]; accounts: Account[] }) {
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
      <div>
        <h2 className="font-semibold" style={{ color: "var(--ink)" }}>Your goals</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>Track the things you’re saving toward.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="inline-flex flex-wrap rounded-xl bg-[#f1f2f8] p-1" aria-label="Goal views">
          <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${view === "board" ? "bg-white text-[#544af7] shadow-sm" : "text-[#8d94a8]"}`}>Kanban view</button>
          <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${view === "cards" ? "bg-white text-[#544af7] shadow-sm" : "text-[#8d94a8]"}`}>Cards</button>
          <button type="button" aria-pressed={view === "analysis"} onClick={() => setView("analysis")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${view === "analysis" ? "bg-white text-[#544af7] shadow-sm" : "text-[#8d94a8]"}`}>Analysis</button>
        </div>
      </div>
    </div>

    {error && !selectedGoal && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
    <p role="status" aria-live="polite" className="sr-only">{feedback}</p>

    {view === "analysis" ? <GoalsAnalysisChart data={analysisData} /> : view === "board" ? <>
      <p className="mb-3 text-xs text-[#8d94a8]">Drag a goal card anywhere into another column, choose “Move to” for a quick status change, or select Manage to edit all details.</p>
      <div className="grid gap-4 xl:grid-cols-3">
      {GOAL_STATUSES.map((column) => {
        const columnGoals = goals.filter((goal) => goalStatus(goal) === column.id);
        const isDragTarget = dragOverColumn === column.id;
        return <section key={column.id} aria-labelledby={`goal-column-${column.id}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverColumn(column.id); }} onDrop={(event) => { event.preventDefault(); const goalId = event.dataTransfer.getData("text/plain"); setDragOverColumn(null); void moveGoal(goalId, column.id); }} className={`min-h-60 rounded-2xl border p-3 transition-colors sm:p-4 ${isDragTarget ? "border-[#544af7] bg-[#eef1fc] ring-2 ring-[#544af7]/15" : "border-[#edf0f7] bg-[#f8f9fe]"}`}>
          <header className="mb-3 flex items-center justify-between px-1">
            <div><h3 id={`goal-column-${column.id}`} className="flex items-center gap-2 font-poppins text-sm font-bold text-[#16192c]"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: column.accent }} />{column.label}</h3><p className="mt-1 pl-4 text-[11px] text-[#8d94a8]">{column.hint}</p></div>
            <div className="flex items-center gap-2"><span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-semibold text-[#626981]">{columnGoals.length}</span><button type="button" onClick={() => openCreateGoal(column.id)} aria-label={`Add a goal to ${column.label}`} className="rounded-lg px-2 py-1 text-sm font-semibold text-[#544af7] hover:bg-white">+ Add</button></div>
          </header>
          <div className="space-y-3">
            {columnGoals.map((goal) => <GoalCard key={goal.id} goal={goal} outcome={outcomes.find((outcome) => outcome.goalId === goal.id)} draggable moving={movingGoalId === goal.id} onMove={(status) => { void moveGoal(goal.id, status); }} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", goal.id); }} onDragEnd={() => setDragOverColumn(null)} onOpen={() => { setError(""); setFeedback(""); setConfirmDelete(false); setSelectedGoal(goal); }} />)}
            {!columnGoals.length && <p className="rounded-xl border border-dashed border-[#d9ddec] bg-white/70 px-3 py-6 text-center text-xs text-[#8d94a8]">Drop a goal here or use + Add in this column.</p>}
          </div>
        </section>;
      })}
      </div>
    </> : <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      <button type="button" onClick={() => openCreateGoal()} className="flex min-h-64 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#d9ddec] bg-white p-8 text-center transition hover:border-[#544af7] hover:bg-[#fafaff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef1fc] text-2xl font-semibold text-[#544af7]">+</span>
        <span className="mt-3 font-semibold text-[#16192c]">Add a goal</span>
        <span className="mt-1 text-sm text-[#8d94a8]">Create another savings goal</span>
      </button>
      {goals.map((goal) => <GoalCard key={goal.id} goal={goal} outcome={outcomes.find((outcome) => outcome.goalId === goal.id)} onOpen={() => { setError(""); setConfirmDelete(false); setSelectedGoal(goal); }} />)}
    </div>}

    {(showForm || selectedGoal) && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setShowForm(false); setSelectedGoal(null); setConfirmDelete(false); } }} className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#16192c]/45 p-3 backdrop-blur-[2px] sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="goal-form-title" className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor: "var(--border)" }}>
          <div><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{selectedGoal ? "Manage goal" : "New goal"}</p><h2 id="goal-form-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--ink)" }}>{selectedGoal?.name ?? "Add a savings goal"}</h2><p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>{selectedGoal ? "Update the details and save your changes." : "Choose what you’re saving for and when you need it."}</p></div>
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
            <input name="name" required maxLength={80} defaultValue={selectedGoal?.name ?? ""} placeholder="e.g. Emergency fund" className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-4 py-3 outline-none focus:border-[var(--accent)]" style={{ borderColor: "var(--border)" }} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Target amount *
              <div className="mt-2 flex items-center rounded-xl border bg-[var(--surface-inset)] px-3 focus-within:border-[var(--accent)]" style={{ borderColor: "var(--border)" }}><span className="text-sm" style={{ color: "var(--ink-muted)" }}>$</span><input name="target" type="number" min="0.01" step="0.01" required defaultValue={selectedGoal ? (selectedGoal.targetCents / 100).toFixed(2) : ""} placeholder="10,000" className="w-full bg-transparent px-2 py-3 outline-none" /></div>
            </label>
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Already saved
              <div className="mt-2 flex items-center rounded-xl border bg-[var(--surface-inset)] px-3 focus-within:border-[var(--accent)]" style={{ borderColor: "var(--border)" }}><span className="text-sm" style={{ color: "var(--ink-muted)" }}>$</span><input name="current" type="number" min="0" step="0.01" defaultValue={selectedGoal ? (selectedGoal.currentCents / 100).toFixed(2) : "0"} className="w-full bg-transparent px-2 py-3 outline-none" /></div>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Target date *
              <input name="targetDate" type="date" required defaultValue={selectedGoal?.targetDate ?? `${new Date().getFullYear() + 1}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`} className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-3 py-3 outline-none focus:border-[var(--accent)]" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Priority
              <select name="priority" defaultValue={selectedGoal ? priorityLabel(selectedGoal.priorityRank).toLowerCase() : "medium"} className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-3 py-3 outline-none focus:border-[var(--accent)]" style={{ borderColor: "var(--border)" }}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
            </label>
          </div>
          <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Status
            <select name="status" defaultValue={selectedGoal ? goalStatus(selectedGoal) : newGoalStatus} className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-3 py-3 outline-none focus:border-[var(--accent)]" style={{ borderColor: "var(--border)" }}>{GOAL_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Flexibility
              <select name="flexibility" defaultValue={selectedGoal?.flexibility ?? "flexible"} className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-3 py-3 outline-none focus:border-[var(--accent)]" style={{ borderColor: "var(--border)" }}><option value="flexible">Flexible</option><option value="non_negotiable">Non-negotiable</option></select>
            </label>
            <label className="block text-sm font-medium" style={{ color: "var(--ink)" }}>Linked account <span style={{ color: "var(--ink-muted)" }}>(optional)</span>
              <select name="linkedAccountId" defaultValue={selectedGoal?.linkedAccountId ?? ""} className="mt-2 w-full rounded-xl border bg-[var(--surface-inset)] px-3 py-3 outline-none focus:border-[var(--accent)]" style={{ borderColor: "var(--border)" }}><option value="">No linked account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
            </label>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {selectedGoal && confirmDelete && <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">Delete “{selectedGoal.name}”?</p>
            <p className="mt-1 text-sm text-red-700">This goal will be removed from your list and future simulations.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={saving} className="rounded-lg px-3 py-2 text-sm font-medium text-[#4a4f68] disabled:opacity-50">Keep goal</button>
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
