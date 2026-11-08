import { ArrowRight, CalendarDays, CircleDollarSign, TrendingUp } from "lucide-react";

const GOALS = [
  { label: "House down payment", progress: 62, color: "var(--landing-primary)" },
  { label: "Emergency fund", progress: 81, color: "#16856d" },
];

/** A labeled illustration of the product, not a real visitor's financial data. */
export function ProductPreview() {
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="overflow-hidden rounded-[26px] border bg-white p-5 shadow-[0_12px_36px_-24px_rgba(34,31,92,0.28)] sm:p-7" style={{ borderColor: "var(--landing-border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-5" style={{ borderColor: "var(--landing-border-subtle)" }}>
          <div>
            <h2 className="mt-1.5 text-lg font-semibold" style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}>Before You Buy</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--landing-text-secondary)" }}>A purchase, viewed through your goals.</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl p-4" style={{ background: "var(--landing-section-bg)" }}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white" style={{ color: "var(--landing-primary)" }}><CircleDollarSign size={21} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-xs" style={{ color: "var(--landing-text-muted)" }}>Considering</p>
              <p className="truncate text-sm font-semibold" style={{ color: "var(--landing-text)" }}>Living room sofa</p>
            </div>
          </div>
          <p className="shrink-0 text-lg font-semibold tabular-nums" style={{ color: "var(--landing-text)" }}>$2,800</p>
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold" style={{ color: "var(--landing-text)" }}>Goals This Could Affect</h3>
            <span className="text-xs" style={{ color: "var(--landing-text-muted)" }}>Goal progress</span>
          </div>
          <div className="space-y-4">
            {GOALS.map((goal) => <div key={goal.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="font-medium" style={{ color: "var(--landing-text-secondary)" }}>{goal.label}</span>
                <span className="tabular-nums" style={{ color: "var(--landing-text-muted)" }}>{goal.progress}% funded</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--landing-border-subtle)" }}>
                <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, background: goal.color }} />
              </div>
            </div>)}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--landing-border-subtle)" }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--landing-text-muted)" }}><CalendarDays size={15} aria-hidden="true" /> Goal date</div>
            <p className="mt-2 text-sm font-semibold" style={{ color: "var(--landing-text)" }}>Feb 2030 <span className="mx-1.5 text-[#a6aabb]">→</span> May 2030</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: "var(--landing-tint-50)" }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--landing-primary-dark)" }}><TrendingUp size={15} aria-hidden="true" /> Possible adjustment</div>
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--landing-primary-dark)" }}>Compare your options <ArrowRight size={15} aria-hidden="true" /></p>
          </div>
        </div>

        <p className="mt-4 text-[11px]" style={{ color: "var(--landing-text-muted)" }}>Illustrative figures only. Your results depend on your accounts and assumptions.</p>
      </div>
    </div>
  );
}
