import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Section, SectionHeading } from "./layout-parts";
import { Reveal } from "./motion";
import { AdvisorPreview, CopilotRowPreview, DashboardPreview, GoalsPreview, SpendingPreview } from "./previews";

const ROWS = [
  {
    id: "overview",
    title: "Your Whole Picture, at a Glance",
    body: "Accounts, loans, goals and cash flow in one view, so the next decision starts from where you actually are.",
    href: "/app",
    cta: "Open the Dashboard",
    Visual: DashboardPreview,
  },
  {
    id: "goals",
    title: "Goals That Share One Pool of Savings",
    body: "Every goal draws on the same money, so a change to one shows up in the others. Outcomes come as ranges, never a single promise.",
    href: "/goals",
    cta: "Explore Goals",
    Visual: GoalsPreview,
  },
  {
    id: "advisor",
    title: "Ask in Plain English, Get Options, Not Orders",
    body: "Ask what to cut or what a move costs. The numbers are calculated first and then explained, and you always see more than one path.",
    href: "/advisor",
    cta: "Ask the Advisor",
    Visual: AdvisorPreview,
  },
  {
    id: "spending",
    title: "Spot the Leaks Before They Compound",
    body: "See where the month went and catch the subscription that quietly got more expensive, before it becomes a habit.",
    href: "/spending",
    cta: "See Spending",
    Visual: SpendingPreview,
  },
  {
    id: "copilot",
    title: "A Heads-Up on the Product Page",
    body: "A Chrome extension checks the price against your goals while you shop. It only suggests, and it reads nothing else on the page.",
    href: "/copilot",
    cta: "Get the Extension",
    Visual: CopilotRowPreview,
  },
] as const;

export function UseCases() {
  return (
    <Section id="use-cases">
      <Reveal>
        <SectionHeading
          align="center"
          title="One Place for Every Money Decision"
          body="See your whole picture, plan your goals, and check a purchase before you make it. Each tool runs on the same numbers."
        />
      </Reveal>
      <div className="mt-16 space-y-20 md:mt-24 md:space-y-32">
        {ROWS.map(({ id, title, body, href, cta, Visual }, i) => (
          <div key={id} id={`use-case-${id}`} className="grid scroll-mt-24 grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-20">
            <Reveal className={i % 2 === 1 ? "lg:order-2" : ""}>
              <h3 className="text-balance text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-lp-text sm:text-[34px]">{title}</h3>
              <p className="mt-4 max-w-[44ch] text-pretty text-base leading-7 text-lp-text-2 sm:text-lg sm:leading-8">{body}</p>
              <Link href={href} className="group mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-lp-primary-dark hover:text-lp-primary">
                {cta}
                <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </Reveal>
            <Reveal delay={120} className={i % 2 === 1 ? "lg:order-1" : ""}>
              <Visual />
            </Reveal>
          </div>
        ))}
      </div>
    </Section>
  );
}
