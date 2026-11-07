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

const field = "mt-1 w-full rounded border border-line bg-surface p-2 text-sm";

/** Both paths end in the same confirmation step, then the same POST. */
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
      <Card title="Confirm this event">
        <dl className="text-sm">
          <dt className="text-muted">Type</dt>
          <dd>{LIFE_EVENT_LABEL[draft.type]}</dd>
          <dt className="mt-2 text-muted">Date</dt>
          <dd>{draft.date}</dd>
        </dl>
        <div className="mt-4 flex gap-3 text-sm">
          <button className="rounded bg-accent px-3 py-1.5 text-surface" onClick={confirm}>
            Save
          </button>
          <button className="underline" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Log an event">
      <form onSubmit={submitForm} className="space-y-3 text-sm">
        <label className="block">
          Event
          <select name="type" className={field}>
            {LifeEventType.options.map((type) => (
              <option key={type} value={type}>
                {LIFE_EVENT_LABEL[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Date
          <input name="date" type="date" required className={field} />
        </label>
        <label className="block">
          Cost in dollars
          <input name="amount" type="number" min="0" required className={field} />
        </label>
        <label className="flex items-center gap-2">
          <input name="recurring" type="checkbox" /> Repeats monthly
        </label>
        <label className="block">
          Linked goal
          <select name="goal" className={field}>
            <option value="">None</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded bg-accent px-3 py-1.5 text-surface">Continue</button>
      </form>

      <form onSubmit={submitText} className="mt-6 border-t border-line pt-4 text-sm">
        <label className="block">
          Or describe it (P1)
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="We're having a baby in March"
            className={field}
          />
        </label>
        <button className="mt-2 underline" disabled={!text}>
          Parse
        </button>
        {message && <p className="mt-2 text-muted">{message}</p>}
      </form>

      {changes.length > 0 && (
        <ul className="mt-4 border-t border-line pt-3 text-sm">
          {changes.map((change) => (
            <li key={change.goalId}>
              {change.goalName}: {change.probabilityHighDelta >= 0 ? "+" : ""}
              {formatPercent(change.probabilityHighDelta)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
