import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { formatUsd, formatPercent, type Account } from "@finvantage/contracts";
import { ScoreChart } from "./ScoreChart";
import { ScoreGauge } from "./ScoreGauge";
import { VisualCard } from "./VisualCard";

/* ── Icons ─────────────────────────────────────────────────────────── */

function CreditIcon({ kind }: { kind: "check" | "arrow" | "clock" | "search" | "spark" | "card" | "percent" | "shield" | "calendar" }) {
  const iconClasses: Record<string, string> = {
    check: "fa-check",
    arrow: "fa-arrow-up-right-from-square",
    clock: "fa-clock",
    search: "fa-magnifying-glass",
    spark: "fa-wand-magic-sparkles",
    card: "fa-credit-card",
    percent: "fa-percent",
    shield: "fa-shield-halved",
    calendar: "fa-calendar-days",
  };
  return <i aria-hidden="true" className={`fa-solid ${iconClasses[kind]} inline-block w-5 text-center`} />;
}


/* ── Credit factor row ─────────────────────────────────────────────── */

function Factor({ title, detail, icon, tone, value }: { title: string; detail: string; icon: "check" | "arrow" | "clock" | "search" | "percent"; tone: "good" | "attention" | "neutral"; value?: string }) {
  const color = tone === "good" ? "#0b8f69" : tone === "attention" ? "#c47708" : "#544af7";
  return (
    <div className="tile-lift flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-inset)" }}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs" style={{ color, backgroundColor: `${color}12` }}><CreditIcon kind={icon} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{title}</p>
        <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{detail}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        {value && <span className="text-xs font-bold tabular-nums" style={{ color: "var(--ink)" }}>{value}</span>}
        <span className="hidden rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline" style={{ color, backgroundColor: `${color}12` }}>
          {tone === "good" ? "Positive" : tone === "attention" ? "Opportunity" : "Building"}
        </span>
      </div>
    </div>
  );
}


/* ── Compute dynamic factors from accounts ─────────────────────────── */

function computeFactors(cards: Account[]) {
  const totalBalance = cards.reduce((s, c) => s + c.balanceCents, 0);
  const totalLimit = cards.reduce((s, c) => s + (c.creditLimitCents ?? 0), 0);
  const utilization = totalLimit > 0 ? totalBalance / totalLimit : 0;

  const utilizationTone: "good" | "attention" | "neutral" = utilization <= 0.30 ? "good" : utilization <= 0.50 ? "neutral" : "attention";
  const utilizationDetail = utilization <= 0.10
    ? "Excellent — well below 10% usage"
    : utilization <= 0.30
      ? "Healthy — under the 30% threshold"
      : utilization <= 0.50
        ? "Moderate — aim to bring it below 30%"
        : "High usage may be lowering your score";

  const hasOverdue = cards.some((c) => {
    if (!c.nextPaymentDueOn) return false;
    return new Date(c.nextPaymentDueOn) < new Date();
  });

  const numAccounts = cards.length;
  const historyTone: "good" | "neutral" = numAccounts >= 3 ? "good" : "neutral";

  return [
    { title: "Payment History", detail: hasOverdue ? "A payment may be past due" : "On-time payments are a strong foundation", icon: "check" as const, tone: (hasOverdue ? "attention" : "good") as "good" | "attention", value: hasOverdue ? "Past due" : "On time" },
    { title: "Credit Utilization", detail: utilizationDetail, icon: "percent" as const, tone: utilizationTone, value: `${Math.round(utilization * 100)}%` },
    { title: "Length of Credit History", detail: numAccounts >= 3 ? "A solid number of accounts" : "Your account history is still building", icon: "clock" as const, tone: historyTone },
    { title: "Recent Applications", detail: "Recent inquiries may have a short-term impact", icon: "search" as const, tone: "attention" as const },
    { title: "Credit Mix", detail: numAccounts >= 2 ? "A healthy mix of accounts is represented" : "More account variety can help over time", icon: "check" as const, tone: (numAccounts >= 2 ? "good" : "neutral") as "good" | "neutral" },
  ];
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default async function CreditPage() {
  const [credit, accounts] = await Promise.all([
    api.getCreditScore(),
    api.listAccounts(),
  ]);

  const cards = accounts.filter((a) => a.type === "credit_card");
  const totalBalance = cards.reduce((s, c) => s + c.balanceCents, 0);
  const totalLimit = cards.reduce((s, c) => s + (c.creditLimitCents ?? 0), 0);
  const factors = computeFactors(cards);

  return (
    <>
      <PageHeader title="Credit Score" />
      <main className="space-y-6 pb-8">

        {/* ── Score gauge + factors ────────────────────── */}
        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Your Credit Snapshot" subtitle="A clear view of where you stand" action={<MockedBadge />}>
            <ScoreGauge score={credit.score} />
            <ScoreChart history={credit.history} />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="tile-lift rounded-xl p-2.5" style={{ background: "var(--surface-inset)" }}>
                <p className="text-[10px]" style={{ color: "var(--ink-muted)" }}>Card Debt</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: "var(--critical, #d7465d)" }}>{formatUsd(totalBalance)}</p>
              </div>
              <div className="tile-lift rounded-xl p-2.5" style={{ background: "var(--surface-inset)" }}>
                <p className="text-[10px]" style={{ color: "var(--ink-muted)" }}>Credit Limit</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(totalLimit)}</p>
              </div>
              <div className="tile-lift rounded-xl p-2.5" style={{ background: "var(--surface-inset)" }}>
                <p className="text-[10px]" style={{ color: "var(--ink-muted)" }}>Utilization</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>{totalLimit > 0 ? `${Math.round((totalBalance / totalLimit) * 100)}%` : "N/A"}</p>
              </div>
            </div>
            <p className="mt-4 rounded-xl p-3 text-center text-xs leading-5" style={{ background: "var(--surface-inset)", color: "var(--ink-muted)" }}>
              Demo estimate. Real FICO® Scores vary by bureau and model.
            </p>
          </Card>
          <Card title="What Shapes Your Score?" subtitle="The habits that influence credit health">
            <div className="space-y-2">
              {factors.map((f) => (
                <Factor key={f.title} title={f.title} detail={f.detail} icon={f.icon} tone={f.tone} value={f.value} />
              ))}
            </div>
          </Card>
        </div>

        {/* ── Credit cards ─────────────────────────────── */}
        <section id="credit-cards" className="scroll-mt-6">
          <div className="mb-4">
            <h2 className="font-poppins text-xl font-bold text-[#16192c]">Your Credit Cards</h2>
            <p className="mt-1 text-sm text-[#8d94a8]">Balances, limits, and utilization at a glance</p>
          </div>
          {cards.length === 0 ? (
            <Card>
              <p className="py-4 text-center text-sm" style={{ color: "var(--ink-muted)" }}>No credit cards linked yet.</p>
            </Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {cards.map((card, i) => (
                <VisualCard key={card.id} account={card} index={i} />
              ))}
            </div>
          )}
        </section>

        {/* ── Learn section ────────────────────────────── */}
        <section id="credit-learning" className="scroll-mt-6">
          <div className="mb-4">
            <h2 className="font-poppins text-xl font-bold text-[#16192c]">Learn How to Build Stronger Credit</h2>
            <p className="mt-1 text-sm text-[#8d94a8]">Guides from trusted credit education sources</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <a href="https://www.myfico.com/credit-education/improve-your-credit-score" target="_blank" rel="noreferrer" className="group rounded-3xl border border-[#edf0f7] bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef1fc] text-[#544af7]"><CreditIcon kind="spark" /></div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#544af7]">myFICO · Credit Education</p>
              <h3 className="mt-2 font-poppins text-lg font-bold text-[#16192c]">How to Improve Your Credit Score</h3>
              <p className="mt-2 text-sm leading-6 text-[#6c7288]">Understand the habits that can strengthen your score over time.</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#544af7]">Read Article <CreditIcon kind="arrow" /></span>
            </a>
            <a href="https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/how-to-rebuild-your-credit/" target="_blank" rel="noreferrer" className="group rounded-3xl border border-[#edf0f7] bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#e6faf4] text-[#0b8f69]"><CreditIcon kind="arrow" /></div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#0b8f69]">CFPB · Consumer Guidance</p>
              <h3 className="mt-2 font-poppins text-lg font-bold text-[#16192c]">How to Rebuild Your Credit</h3>
              <p className="mt-2 text-sm leading-6 text-[#6c7288]">Practical steps and resources from the Consumer Financial Protection Bureau.</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#544af7]">Read Article <CreditIcon kind="arrow" /></span>
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
