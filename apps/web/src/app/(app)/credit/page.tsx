import { Check, CalendarDays, Clock, CreditCard, ExternalLink, Percent, Search, ShieldCheck, WandSparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { formatUsd, formatPercent, type CreditCardsOverview } from "@finvantage/contracts";
import { CardsAtAGlance } from "./CardsAtAGlance";
import { CreditWhatIf } from "./CreditWhatIf";
import { DebtPayoffCard } from "./DebtPayoffCard";
import { ScoreChart } from "./ScoreChart";
import { ScoreGauge } from "./ScoreGauge";
import { VisualCard } from "./VisualCard";

/* ── Icons ─────────────────────────────────────────────────────────── */

const CREDIT_ICONS = {
  check: Check,
  arrow: ExternalLink,
  clock: Clock,
  search: Search,
  spark: WandSparkles,
  card: CreditCard,
  percent: Percent,
  shield: ShieldCheck,
  calendar: CalendarDays,
} as const;

function CreditIcon({ kind }: { kind: keyof typeof CREDIT_ICONS }) {
  const Icon = CREDIT_ICONS[kind];
  return <Icon size={16} strokeWidth={2.2} aria-hidden="true" className="inline-block w-5" />;
}


/* ── Credit factor row ─────────────────────────────────────────────── */

function Factor({ title, detail, icon, tone, value }: { title: string; detail: string; icon: "check" | "arrow" | "clock" | "search" | "percent"; tone: "good" | "attention" | "neutral"; value?: string }) {
  const color = tone === "good" ? "var(--gain)" : tone === "attention" ? "var(--warning)" : "var(--accent-ink)";
  return (
    <div className="tile-lift flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-inset)" }}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)` }}><CreditIcon kind={icon} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{title}</p>
        <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{detail}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        {value && <span className="text-xs font-bold tabular-nums" style={{ color: "var(--ink)" }}>{value}</span>}
        <span className="hidden rounded-full px-2 py-0.5 text-xs font-bold sm:inline" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)` }}>
          {tone === "good" ? "Positive" : tone === "attention" ? "Opportunity" : "Building"}
        </span>
      </div>
    </div>
  );
}


/* ── Factors, from the API's figures ──────────────────────────────── */

/** Every figure comes from `GET /v1/credit/cards`; this only chooses words and a tone for each. */
function factorsFrom(overview: CreditCardsOverview) {
  const { cards, totals, mix } = overview;
  const utilization = totals.utilization ?? 0;

  const utilizationTone: "good" | "attention" | "neutral" = utilization <= 0.30 ? "good" : utilization <= 0.50 ? "neutral" : "attention";
  const utilizationDetail = utilization <= 0.10
    ? "Excellent: well below 10% usage"
    : utilization <= 0.30
      ? "Healthy: under the 30% threshold"
      : utilization <= 0.50
        ? "Moderate: aim to bring it below 30%"
        : "High usage may be lowering your score";

  const pastDue = cards.filter((c) => c.daysUntilDue !== null && c.daysUntilDue < 0);
  const mixDetail = mix.map((m) => `${m.count} ${m.label.toLowerCase()}${m.count === 1 ? "" : "s"}`).join(", ");

  return [
    { title: "Payment History", detail: pastDue.length ? `${pastDue.map((c) => c.name).join(", ")} looks past due` : "On-time payments are a strong foundation", icon: "check" as const, tone: (pastDue.length ? "attention" : "good") as "good" | "attention" | "neutral", value: pastDue.length ? "Past due" : "On time" },
    { title: "Credit Utilization", detail: utilizationDetail, icon: "percent" as const, tone: utilizationTone, value: totals.utilization === null ? undefined : formatPercent(utilization) },
    { title: "Length of Credit History", detail: "Account ages are not tracked in this demo, so this is not scored", icon: "clock" as const, tone: "neutral" as const },
    { title: "Recent Applications", detail: "Hard inquiries are not tracked in this demo", icon: "search" as const, tone: "neutral" as const },
    { title: "Credit Mix", detail: mix.length >= 2 ? `A mix of credit: ${mixDetail}` : `Only ${mixDetail || "no credit accounts"}. More variety can help over time`, icon: "check" as const, tone: (mix.length >= 2 ? "good" : "neutral") as "good" | "attention" | "neutral" },
  ];
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default async function CreditPage() {
  const [credit, accounts, overview, payoff] = await Promise.all([
    api.getCreditScore(),
    api.listAccounts(),
    api.getCreditCards(),
    api.getDebtPayoff({ query: { extraCents: 0 } }).catch(() => null),
  ]);

  const cards = accounts.filter((a) => a.type === "credit_card");
  const { balanceCents: totalBalance, limitCents: totalLimit, utilization } = overview.totals;
  const factors = factorsFrom(overview);

  return (
    <>
      <PageHeader title="Credit" />
      <main className="space-y-6 pb-8">

        {/* ── Score gauge + factors ────────────────────── */}
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
          <Card title="Credit Snapshot" subtitle="A clear view of where you stand" action={<MockedBadge />}>
            <ScoreGauge score={credit.score} />
            <ScoreChart history={credit.history} />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="tile-lift rounded-xl p-2.5" style={{ background: "var(--surface-inset)" }}>
                <p className="text-xs" style={{ color: "var(--ink-muted)" }}>Card Debt</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: "var(--loss)" }}>{formatUsd(totalBalance)}</p>
              </div>
              <div className="tile-lift rounded-xl p-2.5" style={{ background: "var(--surface-inset)" }}>
                <p className="text-xs" style={{ color: "var(--ink-muted)" }}>Credit Limit</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(totalLimit)}</p>
              </div>
              <div className="tile-lift rounded-xl p-2.5" style={{ background: "var(--surface-inset)" }}>
                <p className="text-xs" style={{ color: "var(--ink-muted)" }}>Utilization</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>{utilization === null ? "N/A" : formatPercent(utilization)}</p>
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

        <CardsAtAGlance overview={overview} />

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <CreditWhatIf cards={overview.cards} />
          {payoff && <DebtPayoffCard initial={payoff} />}
        </div>

        {/* ── Credit cards ─────────────────────────────── */}
        <section id="credit-cards" className="scroll-mt-6">
          <div className="mb-4">
            <h2 className="font-poppins text-xl font-bold text-ink">Your Credit Cards</h2>
            <p className="mt-1 text-sm text-muted">Balances, limits, and utilization at a glance</p>
          </div>
          {cards.length === 0 ? (
            <Card>
              <p className="py-4 text-center text-sm" style={{ color: "var(--ink-muted)" }}>No credit cards linked yet.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {cards.map((card, i) => (
                <VisualCard key={card.id} account={card} index={i} />
              ))}
            </div>
          )}
        </section>

        {/* ── Learn section ────────────────────────────── */}
        <section id="credit-learning" className="scroll-mt-6">
          <div className="mb-4">
            <h2 className="font-poppins text-xl font-bold text-ink">Build Stronger Credit</h2>
            <p className="mt-1 text-sm text-muted">Guides from trusted credit education sources</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <a href="https://www.myfico.com/credit-education/improve-your-credit-score" target="_blank" rel="noreferrer" className="group rounded-3xl border border-line bg-raised p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><CreditIcon kind="spark" /></div>
              <h3 className="mt-2 font-poppins text-lg font-bold text-ink">How to Improve Your Credit Score</h3>
              <p className="mt-1 text-xs text-muted">Source: myFICO, credit education</p>
              <p className="mt-2 text-sm leading-6 text-ink-chart">Understand the habits that can strengthen your score over time.</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-accent-ink">Read Article <CreditIcon kind="arrow" /></span>
            </a>
            <a href="https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/how-to-rebuild-your-credit/" target="_blank" rel="noreferrer" className="group rounded-3xl border border-line bg-raised p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-good-bg text-gain"><CreditIcon kind="arrow" /></div>
              <h3 className="mt-2 font-poppins text-lg font-bold text-ink">How to Rebuild Your Credit</h3>
              <p className="mt-1 text-xs text-muted">Source: CFPB, consumer guidance</p>
              <p className="mt-2 text-sm leading-6 text-ink-chart">Practical steps and resources from the Consumer Financial Protection Bureau.</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-accent-ink">Read Article <CreditIcon kind="arrow" /></span>
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
