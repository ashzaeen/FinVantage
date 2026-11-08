import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

function CreditIcon({ kind }: { kind: "check" | "arrow" | "clock" | "search" | "spark" }) {
  const iconClasses = {
    check: "fa-check",
    arrow: "fa-arrow-up-right-from-square",
    clock: "fa-clock",
    search: "fa-magnifying-glass",
    spark: "fa-wand-magic-sparkles",
  };
  return <i aria-hidden="true" className={`fa-solid ${iconClasses[kind]} inline-block w-5 text-center`} />;
}

function ScoreGauge({ score }: { score: number }) {
  const min = 300, max = 850;
  const pct = Math.max(0, Math.min(100, ((score - min) / (max - min)) * 100));
  const label = score >= 800 ? "Exceptional" : score >= 740 ? "Very good" : score >= 670 ? "Good" : score >= 580 ? "Fair" : "Poor";
  const color = score >= 740 ? "#0b8f69" : score >= 670 ? "#c47708" : "#d7465d";
  const circumference = 2 * Math.PI * 83;
  return (
    <div className="flex flex-col items-center justify-center py-6 sm:py-10">
      <div className="relative h-64 w-64 sm:h-80 sm:w-80">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="img" aria-label={`Credit score ${score} out of ${max}`}>
          <circle cx="100" cy="100" r="83" fill="none" stroke="#edf0f7" strokeWidth="13" />
          <circle cx="100" cy="100" r="83" fill="none" stroke={color} strokeWidth="13" strokeDasharray={`${circumference * pct / 100} ${circumference}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8d94a8]">FICO range</span>
          <span className="mt-1 font-poppins text-6xl font-bold tracking-tight text-[#16192c] sm:text-7xl">{score}</span>
          <span className="mt-2 rounded-full px-4 py-1 text-sm font-bold" style={{ color, backgroundColor: `${color}18` }}>{label}</span>
        </div>
      </div>
      <p className="mt-4 text-sm text-[#8d94a8]">Score range: {min}–{max}</p>
    </div>
  );
}

function Factor({ title, detail, icon, tone }: { title: string; detail: string; icon: "check" | "arrow" | "clock" | "search"; tone: "good" | "attention" | "neutral" }) {
  const color = tone === "good" ? "#0b8f69" : tone === "attention" ? "#c47708" : "#544af7";
  return <div className="flex items-center gap-4 rounded-2xl border border-[#edf0f7] bg-white p-4">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ color, backgroundColor: `${color}12` }}><CreditIcon kind={icon} /></span>
    <div className="min-w-0 flex-1"><p className="font-semibold text-[#16192c]">{title}</p><p className="mt-0.5 text-sm text-[#8d94a8]">{detail}</p></div>
    <span className="hidden rounded-full px-3 py-1 text-xs font-bold sm:inline" style={{ color, backgroundColor: `${color}12` }}>{tone === "good" ? "Positive" : tone === "attention" ? "Opportunity" : "Building"}</span>
  </div>;
}

export default async function CreditPage() {
  const credit = await api.getCreditScore();
  return <>
    <PageHeader title="Credit Score" />
    <main className="space-y-6 pb-8">
      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="!rounded-[2rem] !p-6 sm:!p-9" title="Your credit snapshot" subtitle="A clear view of where you stand">
          <div className="flex justify-end"><MockedBadge /></div>
          <ScoreGauge score={credit.score} />
          <div className="mx-auto max-w-lg rounded-2xl bg-[#f8f9fe] p-4 text-center text-sm leading-6 text-[#6c7288]">
            Your score is a demo estimate for this experience. Real FICO® Scores can vary by credit bureau and scoring model.
          </div>
        </Card>
        <Card className="!rounded-[2rem] !p-6 sm:!p-9" title="What shapes your score?" subtitle="The habits that influence credit health">
          <div className="mt-6 space-y-3">
            <Factor title="Payment history" detail="On-time payments are a strong foundation" icon="check" tone="good" />
            <Factor title="Credit utilization" detail="Keeping balances low can help" icon="check" tone="good" />
            <Factor title="Length of credit history" detail="Your account history is still building" icon="clock" tone="neutral" />
            <Factor title="Recent applications" detail="Recent inquiries may have an impact" icon="search" tone="attention" />
            <Factor title="Credit mix" detail="A healthy mix of accounts is represented" icon="arrow" tone="good" />
          </div>
          <a href="#credit-learning" className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#544af7] px-5 py-4 font-semibold text-white transition hover:bg-[#4338e3] focus:outline-none focus:ring-4 focus:ring-[#544af7]/20">
            <CreditIcon kind="spark" /> Explore ways to improve your score <CreditIcon kind="arrow" />
          </a>
        </Card>
      </section>
      <section id="credit-learning" className="scroll-mt-6">
        <div className="mb-4"><h2 className="font-poppins text-xl font-bold text-[#16192c]">Learn how to build stronger credit</h2><p className="mt-1 text-sm text-[#8d94a8]">Guides from trusted credit education sources</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          <a href="https://www.myfico.com/credit-education/improve-your-credit-score" target="_blank" rel="noreferrer" className="group rounded-3xl border border-[#edf0f7] bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef1fc] text-[#544af7]"><CreditIcon kind="spark" /></div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#544af7]">myFICO · Credit education</p><h3 className="mt-2 font-poppins text-lg font-bold text-[#16192c]">How to improve your credit score</h3><p className="mt-2 text-sm leading-6 text-[#6c7288]">Understand the habits that can strengthen your score over time.</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#544af7]">Read article <CreditIcon kind="arrow" /></span>
          </a>
          <a href="https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/how-to-rebuild-your-credit/" target="_blank" rel="noreferrer" className="group rounded-3xl border border-[#edf0f7] bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#e6faf4] text-[#0b8f69]"><CreditIcon kind="arrow" /></div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#0b8f69]">CFPB · Consumer guidance</p><h3 className="mt-2 font-poppins text-lg font-bold text-[#16192c]">How to rebuild your credit</h3><p className="mt-2 text-sm leading-6 text-[#6c7288]">Practical steps and resources from the Consumer Financial Protection Bureau.</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#544af7]">Read article <CreditIcon kind="arrow" /></span>
          </a>
        </div>
      </section>
    </main>
  </>;
}
