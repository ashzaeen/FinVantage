"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  LIFE_EVENT_LABEL,
  LifeEventType,
  formatPercent,
  type Goal,
  type GoalImpact,
  type LifeEventDraft,
} from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";

const inputCls =
  "mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent";
const inputStyle = { borderColor: "var(--border)", background: "var(--surface-inset)", color: "var(--ink)" };

function PrimaryBtn({ children, disabled, onClick, type = "button" }: {
  children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40"
      style={{ background: "var(--accent)", color: "#fff" }}
    >
      {children}
    </button>
  );
}

export function LifeEventEntry({ goals }: { goals: Goal[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<LifeEventDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [changes, setChanges] = useState<GoalImpact[]>([]);

  function submitForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const recurring = form.get("recurring") === "on";
    setDraft({
      type: LifeEventType.parse(form.get("type")),
      date: String(form.get("date")),
      recurrence: recurring ? "recurring" : "one_time",
      dollarImpactCents: -Math.round(Number(form.get("amount")) * 100),
      durationMonths: null,
      linkedGoalId: String(form.get("goal")) || null,
      source: "form",
    });
  }

  async function submitText(e: FormEvent) {
    e.preventDefault();
    const result = await api.parseLifeEvent({ body: { text } });
    if (result.matched) {
      setDraft(result.draft);
      setMessage(null);
    } else {
      const types = result.supportedTypes.map((t) => LIFE_EVENT_LABEL[t]).join(", ");
      setMessage(`${result.message} Supported: ${types}.`);
    }
  }

  async function confirm() {
    if (!draft) return;
    const result = await api.createLifeEvent({ body: draft });
    setChanges(result.goalChanges);
    setDraft(null);
    router.refresh();
  }

  if (draft) {
    return (
      <Card lift={false} title="Confirm this event">
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface-inset)" }}>
          <div>
            <p className="text-xs font-medium" style={{ color: "var(--ink-muted)" }}>Event type</p>
            <p className="mt-0.5 text-sm font-semibold" style={{ color: "var(--ink)" }}>
              {LIFE_EVENT_LABEL[draft.type]}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: "var(--ink-muted)" }}>Date</p>
            <p className="mt-0.5 text-sm font-semibold" style={{ color: "var(--ink)" }}>{draft.date}</p>
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <PrimaryBtn onClick={confirm}>Save event</PrimaryBtn>
          <button
            className="rounded-xl border px-5 py-2.5 text-sm font-medium"
            style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
            onClick={() => setDraft(null)}
          >
            Cancel
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card lift={false} title="Log an event" subtitle="Add a life event that affects your financial plan">
      <form onSubmit={submitForm} className="space-y-4">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Event type
          </span>
          <select name="type" className={inputCls} style={inputStyle}>
            {LifeEventType.options.map((type) => (
              <option key={type} value={type}>{LIFE_EVENT_LABEL[type]}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Date
          </span>
          <input name="date" type="date" required className={inputCls} style={inputStyle} />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Cost (dollars)
          </span>
          <input name="amount" type="number" min="0" required className={inputCls} style={inputStyle} />
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input name="recurring" type="checkbox" className="h-4 w-4 rounded" />
          <span className="text-sm" style={{ color: "var(--ink)" }}>Repeats monthly</span>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Linked goal (optional)
          </span>
          <select name="goal" className={inputCls} style={inputStyle}>
            <option value="">None</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>{goal.name}</option>
            ))}
          </select>
        </label>

        <PrimaryBtn type="submit">Continue</PrimaryBtn>
      </form>

      {/* Natural-language entry */}
      <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
          Or describe it in plain text
        </p>
        <form onSubmit={submitText} className="mt-2 space-y-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="We're having a baby in March…"
            className={inputCls}
            style={inputStyle}
          />
          <PrimaryBtn type="submit" disabled={!text}>Parse</PrimaryBtn>
          {message && (
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>{message}</p>
          )}
        </form>
      </div>

      {changes.length > 0 && (
        <div className="mt-4 rounded-xl p-4" style={{ background: "var(--good-bg)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--good)" }}>Goal impact</p>
          <ul className="mt-2 space-y-1">
            {changes.map((change) => (
              <li key={change.goalId} className="flex justify-between text-sm">
                <span style={{ color: "var(--ink)" }}>{change.goalName}</span>
                <span className="font-semibold" style={{ color: "var(--good)" }}>
                  {change.probabilityHighDelta >= 0 ? "+" : ""}
                  {formatPercent(change.probabilityHighDelta)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
