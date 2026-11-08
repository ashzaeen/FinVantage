"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ApiError,
  MAX_CATEGORY_DEPTH,
  SPENDING_BUCKET_LABEL,
  categoryDepth,
  formatUsd,
  type Budget,
  type BudgetedBucket,
  type CategoryRule,
  type SpendingCategory,
  type Transaction,
} from "@finvantage/contracts";
import { CategoryIcon } from "@/components/spending/CategoryIcon";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";

/* ─── Shared pieces ──────────────────────────────────────────────────────── */

const inputCls = "rounded-xl border px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const inputStyle = { borderColor: "var(--border)", background: "var(--surface-inset)", color: "var(--ink)" };
const primaryCls = "rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const quietCls = "rounded-lg px-2 py-1 text-xs font-medium hover:bg-[var(--surface-inset)]";

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** Labels by id, for categories the user made as well as the defaults. */
export function useLabels(categories: SpendingCategory[]) {
  return useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return (id: string | null) => (id ? (byId.get(id)?.label ?? id) : "Uncategorized");
  }, [categories]);
}

/** Every category the user can pick, indented by level. Hidden ones are left out. */
function CategorySelect({
  categories,
  value,
  onChange,
  spendingOnly = false,
  includeNone = false,
  ariaLabel,
}: {
  categories: SpendingCategory[];
  value: string;
  onChange: (id: string) => void;
  spendingOnly?: boolean;
  includeNone?: boolean;
  ariaLabel: string;
}) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} style={inputStyle}>
      {includeNone && <option value="">Uncategorized</option>}
      {categories
        .filter((c) => !c.hidden && (!spendingOnly || c.bucket !== "excluded"))
        .map((c) => (
          <option key={c.id} value={c.id}>
            {"   ".repeat(categoryDepth(c.id) - 1)}
            {c.label}
          </option>
        ))}
    </select>
  );
}

function Status({ status }: { status: Budget["status"] }) {
  const look = {
    on_track: { label: "On Track", color: "var(--good)", bg: "var(--good-bg)" },
    at_risk: { label: "At Risk", color: "var(--warning)", bg: "var(--warning-bg)" },
    over: { label: "Over", color: "var(--critical)", bg: "var(--critical-bg)" },
  }[status];
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: look.color, background: look.bg }}>
      {look.label}
    </span>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return children ? <p className="text-xs" style={{ color: "var(--critical)" }}>{children}</p> : null;
}

/* ─── Budgets ───────────────────────────────────────────────────────────── */

export function BudgetsPanel({ budgets, categories }: { budgets: Budget[]; categories: SpendingCategory[] }) {
  const router = useRouter();
  const label = useLabels(categories);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [category, setCategory] = useState("dining_out");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent, categoryId: string) {
    event.preventDefault();
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setError("Enter a monthly limit above $0.");
    setBusy(true);
    setError(null);
    try {
      await api.setBudget({ body: { category: categoryId, monthlyLimitCents: cents } });
      setAdding(false);
      setEditing(null);
      setAmount("");
      router.refresh();
    } catch (e) {
      setError(messageFor(e, "Could not save the budget."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(categoryId: string) {
    setBusy(true);
    try {
      await api.deleteBudget({ params: { category: categoryId } });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const limitForm = (categoryId: string, picker: boolean) => (
    <form onSubmit={(e) => save(e, picker ? category : categoryId)} className="mt-2 flex flex-wrap items-center gap-2">
      {picker && <CategorySelect ariaLabel="Budget category" categories={categories} value={category} onChange={setCategory} spendingOnly />}
      <span className="flex items-center gap-1 rounded-xl border px-3 py-2" style={inputStyle}>
        <span style={{ color: "var(--ink-muted)" }}>$</span>
        <input
          aria-label="Monthly limit"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Monthly limit"
          className="w-28 bg-transparent text-sm outline-none"
        />
      </span>
      <button disabled={busy} className={primaryCls} style={{ background: "var(--accent)" }}>
        Save Budget
      </button>
      <button type="button" onClick={() => { setAdding(false); setEditing(null); setError(null); }} className={quietCls} style={{ color: "var(--ink-muted)" }}>
        Cancel
      </button>
    </form>
  );

  return (
    <Card
      title="Budgets"
      subtitle="Monthly limits, with where each one is heading"
      action={
        !adding && (
          <button type="button" onClick={() => { setAdding(true); setAmount(""); }} className="rounded-xl border px-3 py-1.5 text-xs font-medium" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
            Add Budget
          </button>
        )
      }
    >
      {adding && <div className="mb-4">{limitForm("", true)}<ErrorLine>{error}</ErrorLine></div>}
      {budgets.length > 0 && (
        <p className="mb-3 flex items-center gap-4 text-xs" style={{ color: "var(--ink-muted)" }}>
          <span className="flex items-center gap-1.5"><i className="h-2 w-4 rounded-full" style={{ background: "var(--accent)" }} /> Spent</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-4 rounded-full" style={{ background: "var(--budget-projected)" }} /> Projected by Month End</span>
        </p>
      )}
      {budgets.length === 0 && !adding && <p className="text-sm" style={{ color: "var(--ink-muted)" }}>No budgets yet. Add one to start tracking a category.</p>}
      <ul className="space-y-4">
        {budgets.map((b) => {
          const width = Math.min(100, (b.spentCents / b.limitCents) * 100);
          const projectedWidth = Math.min(100, (b.projectedCents / b.limitCents) * 100);
          const color = b.status === "over" ? "var(--critical)" : b.status === "at_risk" ? "var(--warning)" : "var(--accent)";
          const projectedColor = b.projectedCents > b.limitCents ? "var(--budget-projected-over)" : "var(--budget-projected)";
          return (
            <li key={b.category}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium" style={{ color: "var(--ink)" }}>
                  <CategoryIcon id={b.category} />
                  {label(b.category)} <Status status={b.status} />
                </span>
                <span className="tabular-nums text-xs" style={{ color: "var(--ink-muted)" }}>
                  {formatUsd(b.spentCents)} of {formatUsd(b.limitCents)}
                </span>
              </div>
              {/* Solid: spent so far. Lighter, behind it: where the month ends at this pace. */}
              <div
                className="relative mt-1.5 h-2.5 w-full overflow-hidden rounded-full"
                style={{ background: "var(--border)" }}
                title={`Spent ${formatUsd(b.spentCents)}, projected ${formatUsd(b.projectedCents)} by month end`}
              >
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${projectedWidth}%`, background: projectedColor }} />
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${width}%`, background: color }} />
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                <span>
                  {b.remainingCents >= 0 ? `${formatUsd(b.remainingCents)} left` : `${formatUsd(-b.remainingCents)} over`} · On pace for {formatUsd(b.projectedCents)}
                  {b.suggestedLimitCents !== null && ` · Usually ${formatUsd(b.suggestedLimitCents)}`}
                </span>
                <span>
                  <button type="button" onClick={() => { setEditing(b.category); setAmount(String(b.limitCents / 100)); }} className={quietCls} style={{ color: "var(--accent)" }}>Edit</button>
                  <button type="button" disabled={busy} onClick={() => remove(b.category)} className={quietCls} style={{ color: "var(--ink-muted)" }}>Remove</button>
                </span>
              </div>
              {editing === b.category && <>{limitForm(b.category, false)}<ErrorLine>{error}</ErrorLine></>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ─── Categories ────────────────────────────────────────────────────────── */

type CategoryAction = { kind: "add" | "rename"; id: string } | null;

export function CategoryManager({ categories }: { categories: SpendingCategory[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [action, setAction] = useState<CategoryAction>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = categories.filter((c) => showHidden || !c.hidden);
  const childrenOf = (id: string | null) => visible.filter((c) => c.parentId === id);
  const toggle = (id: string) => setOpen((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  async function run(task: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await task();
      setAction(null);
      setName("");
      router.refresh();
    } catch (e) {
      setError(messageFor(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  const submitName = (event: FormEvent) => {
    event.preventDefault();
    if (!action) return;
    if (action.kind === "add") {
      setOpen((prev) => new Set(prev).add(action.id));
      return run(() => api.createSpendingCategory({ body: { parentId: action.id, label: name } }), "Could not add the category.");
    }
    return run(() => api.updateSpendingCategory({ params: { id: action.id }, body: { label: name } }), "Could not rename the category.");
  };

  const row = (c: SpendingCategory): ReactNode => {
    const kids = childrenOf(c.id);
    const depth = categoryDepth(c.id);
    const expanded = open.has(c.id);
    return (
      <li key={c.id}>
        <div className="flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--surface-inset)]" style={{ paddingLeft: `${(depth - 1) * 20 + 8}px` }}>
          <button
            type="button"
            onClick={() => toggle(c.id)}
            aria-expanded={kids.length ? expanded : undefined}
            aria-label={kids.length ? `${expanded ? "Collapse" : "Expand"} ${c.label}` : undefined}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)", visibility: kids.length ? "visible" : "hidden" }}
          >
            {expanded ? "▾" : "▸"}
          </button>
          <span className="flex flex-1 items-center gap-2 text-sm" style={{ color: c.hidden ? "var(--ink-light)" : "var(--ink)" }}>
            <CategoryIcon id={c.id} size={depth === 1 ? 16 : 14} bare />
            {c.label}
            {c.custom && <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>Custom</span>}
            {c.hidden && <span className="ml-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>Hidden</span>}
          </span>
          {c.bucket === "excluded" ? (
            <span className="text-xs" style={{ color: "var(--ink-muted)" }}>{SPENDING_BUCKET_LABEL.excluded}</span>
          ) : (
            <select
              aria-label={`Bucket for ${c.label}`}
              value={c.bucket}
              disabled={busy}
              onChange={(e) => run(() => api.updateSpendingCategory({ params: { id: c.id }, body: { bucket: e.target.value as BudgetedBucket } }), "Could not change the bucket.")}
              className="rounded-lg border px-2 py-1 text-xs"
              style={inputStyle}
            >
              {(["needs", "wants", "savings"] as const).map((b) => <option key={b} value={b}>{SPENDING_BUCKET_LABEL[b]}</option>)}
            </select>
          )}
          {depth < MAX_CATEGORY_DEPTH && (
            <button type="button" onClick={() => { setAction({ kind: "add", id: c.id }); setName(""); }} className={quietCls} style={{ color: "var(--accent)" }}>Add Subcategory</button>
          )}
          <button type="button" onClick={() => { setAction({ kind: "rename", id: c.id }); setName(c.label); }} className={quietCls} style={{ color: "var(--ink-secondary)" }}>Rename</button>
          <button type="button" disabled={busy} onClick={() => run(() => api.updateSpendingCategory({ params: { id: c.id }, body: { hidden: !c.hidden } }), "Could not change the category.")} className={quietCls} style={{ color: "var(--ink-secondary)" }}>
            {c.hidden ? "Show" : "Hide"}
          </button>
          {c.custom && (
            <button type="button" disabled={busy} onClick={() => run(() => api.deleteSpendingCategory({ params: { id: c.id } }), "Could not delete the category.")} className={quietCls} style={{ color: "var(--critical)" }}>Delete</button>
          )}
        </div>
        {action?.id === c.id && (
          <form onSubmit={submitName} className="my-1 flex flex-wrap items-center gap-2" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
            <input
              autoFocus
              aria-label={action.kind === "add" ? `New category under ${c.label}` : `New name for ${c.label}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder={action.kind === "add" ? "Name, like Walmart" : "New name"}
              className={inputCls}
              style={inputStyle}
            />
            <button disabled={busy || !name.trim()} className={primaryCls} style={{ background: "var(--accent)" }}>{action.kind === "add" ? "Add Category" : "Save Name"}</button>
            <button type="button" onClick={() => setAction(null)} className={quietCls} style={{ color: "var(--ink-muted)" }}>Cancel</button>
          </form>
        )}
        {expanded && kids.length > 0 && <ul>{kids.map(row)}</ul>}
      </li>
    );
  };

  return (
    <Card
      title="Categories"
      subtitle={`Add your own subcategories, up to ${MAX_CATEGORY_DEPTH} levels, and set each one's bucket`}
      action={
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show Hidden
        </label>
      }
    >
      <ErrorLine>{error}</ErrorLine>
      <ul className="mt-1">{childrenOf(null).map(row)}</ul>
    </Card>
  );
}

/* ─── Merchant rules ────────────────────────────────────────────────────── */

export function RulesPanel({ rules, categories }: { rules: CategoryRule[]; categories: SpendingCategory[] }) {
  const router = useRouter();
  const label = useLabels(categories);
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("dining_out.coffee");
  const [applyToPast, setApplyToPast] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { updatedTransactions } = await api.createCategoryRule({ body: { merchantContains: merchant, categoryId: category, applyToPast } });
      setNote(applyToPast ? `Rule saved. ${updatedTransactions} past transaction${updatedTransactions === 1 ? "" : "s"} moved.` : "Rule saved.");
      setMerchant("");
      router.refresh();
    } catch (e) {
      setError(messageFor(e, "Could not save the rule."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.deleteCategoryRule({ params: { id } });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Merchant Rules" subtitle="New transactions from these merchants go straight to a category">
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input aria-label="Merchant name contains" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant, like Starbucks" className={`${inputCls} flex-1`} style={inputStyle} />
        <CategorySelect ariaLabel="Rule category" categories={categories} value={category} onChange={setCategory} />
        <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-secondary)" }}>
          <input type="checkbox" checked={applyToPast} onChange={(e) => setApplyToPast(e.target.checked)} /> Apply to Past
        </label>
        <button disabled={busy || merchant.trim().length < 2} className={primaryCls} style={{ background: "var(--accent)" }}>Add Rule</button>
      </form>
      <ErrorLine>{error}</ErrorLine>
      {note && <p className="mt-2 text-xs" style={{ color: "var(--good)" }}>{note}</p>}
      <ul className="mt-3 space-y-2">
        {rules.length === 0 && <li className="text-sm" style={{ color: "var(--ink-muted)" }}>No rules yet.</li>}
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--surface-inset)" }}>
            <span className="flex items-center gap-2" style={{ color: "var(--ink)" }}>
              <CategoryIcon id={r.categoryId} size={14} bare />
              <span>Merchant contains <strong>{r.merchantContains}</strong> → {label(r.categoryId)}</span>
            </span>
            <button type="button" disabled={busy} onClick={() => remove(r.id)} className={quietCls} style={{ color: "var(--ink-muted)" }}>Remove</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ─── Re-categorise recent transactions ─────────────────────────────────── */

export function RecentTransactions({ transactions, categories }: { transactions: Transaction[]; categories: SpendingCategory[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function move(t: Transaction, categoryId: string, always: boolean) {
    setBusy(t.id);
    setError(null);
    try {
      if (always && categoryId) {
        await api.createCategoryRule({ body: { merchantContains: t.merchant, categoryId, applyToPast: true } });
        setSaved(`Everything from ${t.merchant} now goes to the same category.`);
      } else {
        await api.recategorizeTransaction({ params: { id: t.id }, body: { categoryId: categoryId || null } });
        setSaved(null);
      }
      router.refresh();
    } catch (e) {
      setError(messageFor(e, "Could not move the transaction."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Recent Transactions" subtitle="Move any transaction to a category, or make it a rule">
      <ErrorLine>{error}</ErrorLine>
      {saved && <p className="mb-2 text-xs" style={{ color: "var(--good)" }}>{saved}</p>}
      <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
        {transactions.map((t) => {
          const current = t.subcategory ?? t.category ?? "";
          return (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{t.merchant}</span>
                <span className="text-xs tabular-nums" style={{ color: "var(--ink-muted)" }}>{t.date} · {formatUsd(t.amountCents)}</span>
              </span>
              <span className="flex items-center gap-2">
                <CategorySelect ariaLabel={`Category for ${t.merchant}`} categories={categories} value={current} includeNone onChange={(id) => move(t, id, false)} />
                <button type="button" disabled={busy === t.id || !current} onClick={() => move(t, current, true)} className={quietCls} style={{ color: "var(--accent)" }} title={`Always put ${t.merchant} here`}>
                  Always
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
