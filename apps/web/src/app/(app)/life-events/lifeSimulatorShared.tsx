import {
  formatUsd,
  LifeScenarioEventType,
  LifeScenarioOption,
  type LifeScenarioEventType as EventType,
  type LifeScenarioGoalInput,
  type LifeScenarioGoalResult,
  type LifeScenarioInput,
  type LifeScenarioOption as RecoveryOption,
  type LifeSimulatorContext,
} from "@finvantage/contracts";

export const EVENT_LABEL: Record<EventType, string> = {
  new_baby: "New Baby",
  buy_home: "Buy a Home",
  job_change: "Job Change",
  move_city: "Move Cities",
  wedding: "Wedding",
  custom: "Your Own",
};
export const EVENT_HEADINGS: Record<EventType, string> = {
  new_baby: "About the Baby",
  buy_home: "About the Home Purchase",
  job_change: "About the Job Change",
  move_city: "About the Move",
  wedding: "About the Wedding",
  custom: "About Your Event",
};
export const DATE_LABEL: Record<EventType, string> = {
  new_baby: "Due Date",
  buy_home: "Purchase Date",
  job_change: "Start Date",
  move_city: "Move Date",
  wedding: "Wedding Date",
  custom: "Event Date",
};
export const OPTION_LABEL: Record<RecoveryOption, string> = {
  keep: "Keep the Plan as Is",
  save_more: "Save $150 More Each Month",
  reduce_one_time: "Cut One-Time Costs by $600",
  both: "Do Both",
};
export const OPTION_HINT: Record<RecoveryOption, string> = {
  keep: "Use your current spending and savings plan.",
  save_more: "Comes from everyday spending.",
  reduce_one_time: "Buy secondhand, skip extras, or negotiate the bill.",
  both: "Closest to your original date.",
};
export const OPTION_ORDER: readonly RecoveryOption[] = ["keep", "save_more", "reduce_one_time", "both"];
export { LifeScenarioEventType, LifeScenarioOption };

/** The dataviz skill's validated categorical order, same series Spending's pie chart uses. */
export const SERIES = ["#544af7", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#2a78d6", "#6250d6", "#e34948"];

export const fieldClass = "mt-1.5 h-11 w-full rounded-xl border border-[#e6e9f2] bg-[#fafbfe] px-3.5 text-sm tabular-nums text-[#16192c] outline-none transition focus:border-[#544af7] focus:bg-white focus:ring-4 focus:ring-[#544af7]/10";

const GOAL_TIMELINE_COLORS = [
  { accent: "#287a78", tint: "#e2f2f0" },
  { accent: "#4e69b1", tint: "#e7ecf8" },
  { accent: "#b66831", tint: "#f9ebdd" },
  { accent: "#8d5b8d", tint: "#f3eaf3" },
  { accent: "#3e7d48", tint: "#e8f2e7" },
  { accent: "#b34d62", tint: "#f8e9ec" },
] as const;

export function toMonth(date: string): number {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  return year! * 12 + month! - 1;
}

export function monthToDate(month: number): string {
  const year = Math.floor(month / 12);
  const monthInYear = (month % 12) + 1;
  return `${year}-${String(monthInYear).padStart(2, "0")}-01`;
}

export function formatDate(date: string | null): string {
  if (!date) return "Not funded yet";
  // Goal dates are ISO dates, while saved-scenario timestamps are ISO datetimes. Normalize both
  // to their calendar day before formatting so values such as `2026-11-08T09:52:13.000Z` don't
  // become the invalid string `...ZT12:00:00Z` during server rendering.
  const day = date.slice(0, 10);
  const value = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(value.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

export function getPosition(date: string | null, start: number, span: number): number {
  if (!date) return 100;
  return Math.min(100, Math.max(0, ((toMonth(date) - start) / span) * 100));
}

export function moneyDelta(cents: number): string {
  const prefix = cents < 0 ? "−" : cents > 0 ? "+" : "";
  return `${prefix}${formatUsd(Math.abs(cents))}`;
}

/** The editable parts of a scenario: what the form controls, independent of the user's real goals. */
export type ScenarioForm = LifeScenarioInput;

/** Splits whatever free cash remains after the event's monthly cost across every goal, in
 * proportion to what each already gets today. No manual per-goal editing needed, and the total
 * always fits exactly, so there is nothing for the user to balance by hand. */
export function autoSplit(goals: LifeScenarioGoalInput[], freeCashAfterCosts: number): Record<string, number> {
  const available = Math.max(0, freeCashAfterCosts);
  if (goals.length === 0) return {};
  const totalCurrent = goals.reduce((sum, goal) => sum + goal.monthlyContributionCents, 0);
  const result: Record<string, number> = {};
  let allocated = 0;
  goals.forEach((goal, index) => {
    if (index === goals.length - 1) {
      result[goal.id] = Math.max(0, available - allocated);
      return;
    }
    const rawShare = totalCurrent > 0
      ? Math.round(available * (goal.monthlyContributionCents / totalCurrent))
      : Math.floor(available / goals.length);
    const share = Math.max(0, Math.min(rawShare, available - allocated));
    result[goal.id] = share;
    allocated += share;
  });
  return result;
}

export function defaultForm(context: LifeSimulatorContext, startMonth: string): ScenarioForm {
  const trip = context.goals.find((goal) => goal.kind === "trip");
  return {
    eventType: "new_baby",
    customEventName: "",
    startMonth,
    monthlyCostCents: 0,
    oneTimeCostCents: 0,
    oneTimeSourceGoalId: trip?.id ?? context.goals[0]?.id ?? "",
    selectedGoalIds: context.goals.map((goal) => goal.id),
    split: autoSplit(context.goals, context.freeCashCents),
    selectedOption: "keep",
    allowOverCommit: false,
  };
}

/** A start month a few months after `asOf`, since the engine rejects an event in the current month. */
export function nextMonthAfter(asOf: string): string {
  return monthToDate(toMonth(asOf) + 4);
}

export type FieldError = { code: string; message: string } | null;

export function InputField({
  label, valueCents, onChange, step = 100,
}: {
  label: string;
  valueCents: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return <label htmlFor={id} className="block text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
    {label}
    <span className="mt-1.5 flex h-11 items-center rounded-xl border border-[#e6e9f2] bg-[#fafbfe] px-3.5 transition focus-within:border-[#544af7] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#544af7]/10">
      <span className="text-sm" style={{ color: "var(--ink-muted)" }}>$</span>
      <input id={id} aria-label={label} type="number" min={0} step={step / 100} value={(valueCents / 100).toFixed(0)} onChange={(event) => {
        const amount = Number(event.target.value);
        if (Number.isFinite(amount) && amount >= 0) onChange(Math.round(amount * 100));
      }} className="h-full w-full bg-transparent px-2 text-sm tabular-nums outline-none" style={{ color: "var(--ink)" }} />
    </span>
  </label>;
}

const EVENT_TEMPLATE_DESCRIPTION: Record<Exclude<EventType, "custom">, string> = {
  new_baby: "Plan for recurring care costs and one-time expenses.",
  buy_home: "Add purchase costs and ongoing housing expenses.",
  job_change: "Model a change in income or monthly cash flow.",
  move_city: "Account for moving expenses and a new cost of living.",
  wedding: "Plan event costs and changes to your savings.",
};

/** The event + response-plan form. Shared verbatim by the Summary view and the Charts view's
 * collapsible "Edit the numbers" panel, so the two views can never drift out of sync.
 *
 * Deliberately minimal: enter what's changing, pick the goal to compare against, see when it
 * falls behind. Every other goal keeps its current pace automatically (`autoSplit`), so there is
 * no per-goal split to manage by hand. */
export function EventForm({
  context, form, onChange, error,
}: {
  context: LifeSimulatorContext;
  form: ScenarioForm;
  onChange: (next: ScenarioForm) => void;
  error?: FieldError;
}) {
  const eventName = form.eventType === "custom" ? form.customEventName.trim() || "Your Event" : EVENT_LABEL[form.eventType];
  const eventHeading = form.eventType === "custom" ? `About ${eventName}` : EVENT_HEADINGS[form.eventType];

  return <div className="space-y-5">
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Choose a Life Event</p></div>
        <button type="button" onClick={() => onChange({ ...form, eventType: "custom" })} className="min-h-11 rounded-xl px-3.5 text-sm font-semibold text-white transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7] focus-visible:ring-offset-2" style={{ background: "#544af7" }}>Add New Event</button>
      </div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>Built-In Templates</p>
      <div className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">{LifeScenarioEventType.options.filter((type): type is Exclude<EventType, "custom"> => type !== "custom").map((type) => {
        const selected = form.eventType === type;
        return <button key={type} type="button" aria-pressed={selected} onClick={() => onChange({ ...form, eventType: type })} className="min-h-[68px] w-56 shrink-0 snap-start rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]" style={{ borderColor: selected ? "var(--accent)" : "var(--border)", background: selected ? "var(--accent-soft, #eceeff)" : "var(--surface-raised)" }}>
          <span className="block text-sm font-semibold" style={{ color: selected ? "var(--accent)" : "var(--ink)" }}>{EVENT_LABEL[type]}</span>
          <span className="mt-0.5 block text-xs leading-4" style={{ color: "var(--ink-muted)" }}>{EVENT_TEMPLATE_DESCRIPTION[type]}</span>
        </button>;
      })}</div>
    </div>

    <div className="grid content-start gap-x-5 gap-y-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><h3 className="font-poppins text-base font-bold" style={{ color: "var(--ink)" }}>{eventHeading}</h3><p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>Use your best estimate; you can change it later.</p></div>

      <label htmlFor="scenario-start-month" className="block text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
        {DATE_LABEL[form.eventType]}
        <input id="scenario-start-month" type="date" value={form.startMonth} onChange={(event) => onChange({ ...form, startMonth: event.target.value })} className={fieldClass} />
      </label>
      {error?.code === "event_not_future" && <p role="alert" className="-mt-2 text-xs sm:col-start-2" style={{ color: "var(--critical)" }}>{error.message}</p>}

      {form.eventType === "custom" && <label htmlFor="scenario-custom-name" className="block text-sm font-medium sm:col-span-2" style={{ color: "var(--ink-secondary)" }}>
        Name Your Event
        <input id="scenario-custom-name" maxLength={40} value={form.customEventName} onChange={(event) => onChange({ ...form, customEventName: event.target.value })} placeholder="For example, start graduate school" className={fieldClass} />
      </label>}

      <InputField label="New Monthly Costs (Optional)" valueCents={form.monthlyCostCents} onChange={(cents) => onChange({ ...form, monthlyCostCents: cents })} step={5_000} />
      <InputField label="One-Time Costs" valueCents={form.oneTimeCostCents} onChange={(cents) => onChange({ ...form, oneTimeCostCents: cents })} step={10_000} />
    </div>
  </div>;
}

/** Goal rows with before/after dots on a shared date axis. Used by both views, so a change to how
 * the timeline reads never has to be made twice. Cards stack and rows wrap under 700px. */
export function GoalTimeline({ goals }: { goals: LifeScenarioGoalResult[] }) {
  const visible = goals.filter((goal) => goal.included);
  const timelineDates = visible.flatMap((goal) => [goal.beforeDisplayDate, goal.displayDate]).filter((date): date is string => !!date);
  const startMonth = timelineDates.length ? Math.min(...timelineDates.map(toMonth)) : toMonth("2026-01-01");
  const endMonth = Math.max(startMonth + 1, ...timelineDates.map(toMonth));
  const spanMonths = endMonth - startMonth;
  const axisTicks = Array.from({ length: 5 }, (_, index) => {
    const month = startMonth + Math.round((spanMonths * index) / 4);
    return { month, date: monthToDate(month), left: (index / 4) * 100 };
  });

  if (!visible.length) return <p className="py-6 text-sm" style={{ color: "var(--ink-muted)" }}>Select at least one goal to see its timeline.</p>;

  return <div>
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" aria-label="Timeline legend">
      <span className="inline-flex items-center gap-2" style={{ color: "var(--ink-secondary)" }}><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#7d8984" }} />Current plan</span>
      <span className="inline-flex items-center gap-2" style={{ color: "var(--ink-secondary)" }}><span className="h-2.5 w-2.5 rounded-full" style={{ background: GOAL_TIMELINE_COLORS[0].accent }} />After event (color varies by goal)</span>
    </div>
    <div className="space-y-2">{visible.map((goal, index) => {
      const palette = GOAL_TIMELINE_COLORS[index % GOAL_TIMELINE_COLORS.length]!;
      const beforePosition = getPosition(goal.beforeDisplayDate, startMonth, spanMonths);
      const afterPosition = getPosition(goal.displayDate, startMonth, spanMonths);
      const barLeft = Math.min(beforePosition, afterPosition);
      const barWidth = Math.max(0.7, Math.abs(afterPosition - beforePosition));
      const delayColor = goal.delayMonths !== null && goal.delayMonths > 0 ? "#a34f18" : goal.delayMonths !== null && goal.delayMonths < 0 ? "#16745f" : "#53605b";
      const delayBackground = goal.delayMonths !== null && goal.delayMonths > 0 ? "#fff0df" : goal.delayMonths !== null && goal.delayMonths < 0 ? "#e3f3ec" : "#edf0ee";
      return <article key={goal.goalId} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:gap-4" style={{ background: palette.tint, borderColor: `${palette.accent}35`, borderLeft: `4px solid ${palette.accent}` }}>
        <div className="min-w-0 sm:w-40 sm:shrink-0"><p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{goal.name}</p><p className="mt-0.5 text-xs tabular-nums" style={{ color: "var(--ink-muted)" }}>{formatUsd(goal.targetCents)} target</p></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tabular-nums" style={{ color: "var(--ink-secondary)" }}><span>{formatDate(goal.beforeDisplayDate)}</span> <span className="px-1" aria-hidden="true" style={{ color: palette.accent }}>→</span> <span>{formatDate(goal.displayDate)}</span></p>
          <div className="relative mt-2 h-5" aria-label={`${goal.name}: ${formatDate(goal.beforeDisplayDate)} before, ${formatDate(goal.displayDate)} with the plan`}>
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2" style={{ background: "var(--border)" }} />
            {goal.beforeDisplayDate && goal.displayDate && <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ left: `${barLeft}%`, width: `${barWidth}%`, background: palette.accent, opacity: 0.36 }} />}
            {goal.beforeDisplayDate && <span aria-hidden="true" className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${beforePosition}%`, background: "#7d8984" }} />}
            {goal.displayDate && <span aria-hidden="true" className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${afterPosition}%`, background: palette.accent }} />}
          </div>
        </div>
        <div className="sm:w-28 sm:shrink-0 sm:text-right">
          <p className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums" style={{ color: delayColor, background: delayBackground }}>{goal.delayLabel}</p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>{goal.kind === "trip" && goal.eventOnlyDisplayDate && goal.eventOnlyDisplayDate !== goal.displayDate ? `Event alone: ${formatDate(goal.eventOnlyDisplayDate)}` : `Saved ${formatUsd(goal.savedCents)}`}</p>
        </div>
      </article>;
    })}</div>
    <div className="relative mt-3 h-7 border-t pt-1 sm:ml-40" style={{ borderColor: "var(--border)" }} aria-label="Shared date axis">
      {axisTicks.map((tick, index) => <span key={`${tick.month}-${index}`} className={`absolute top-1 whitespace-nowrap text-xs tabular-nums ${index === 0 ? "translate-x-0" : index === axisTicks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${tick.left}%`, color: "var(--ink-muted)" }}>{formatDate(tick.date)}</span>)}
    </div>
    <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>Dates and delay labels show the timing change in text. Row color also identifies each goal.</p>
  </div>;
}
