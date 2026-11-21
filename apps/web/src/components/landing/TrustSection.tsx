import { Section, SectionHeading } from "./layout-parts";
import { Reveal } from "./motion";

/**
 * Copy here states only what the product enforces today (root AGENTS.md rules 1 to 5, 7, 8 and 10).
 * TODO: before this goes beyond the demo, confirm the Plaid connection scope and add a written
 * data policy; only then can this page say anything about bank-side permissions or data sale.
 */
const PIPELINE = [
  { title: "Calculated in Code", body: "Every figure is computed by deterministic code before any AI writes a word." },
  { title: "Worded by AI", body: "The model turns those figures into plain sentences. It cannot add or change a number." },
  { title: "Checked Before You See It", body: "Each number in the text must match an input, or a plain template card is shown instead." },
] as const;

const LIMITS = [
  { title: "It never acts for you", body: "Nothing moves money, applies for credit, or clicks anything on a page. You decide." },
  { title: "It never guesses out loud", body: "Probabilities show as ranges with a note beside them, never one number dressed up as a promise." },
  { title: "It never saves a misread", body: "Describe a life event in your own words and you confirm it before anything changes." },
  { title: "It labels what is not real", body: "Portfolio and credit score values are mocked and say so. This build uses sandbox and synthetic data." },
] as const;

export function TrustSection() {
  return (
    <Section id="trust" tone="tint">
      <Reveal>
        <SectionHeading
          title="Built to Be Trusted, Honest About Its Limits"
          body="A finance tool is only useful if you can check its work. Here is how the numbers are made, and what the product will not do."
        />
      </Reveal>

      <ol className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
        {PIPELINE.map((step, i) => (
          <li key={step.title}>
            <Reveal delay={i * 110}>
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lp-primary text-sm font-semibold text-white">{i + 1}</span>
                <span className="h-px flex-1 bg-lp-tint-200" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-lp-text">{step.title}</h3>
              <p className="mt-2 max-w-[36ch] text-pretty text-[15px] leading-7 text-lp-text-2">{step.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>

      <Reveal>
        <dl className="mt-16 grid grid-cols-1 gap-x-12 border-t border-lp-line md:mt-20 md:grid-cols-2">
          {LIMITS.map((item) => (
            <div key={item.title} className="border-b border-lp-line py-6">
              <dt className="text-base font-semibold text-lp-text">{item.title}</dt>
              <dd className="mt-1.5 max-w-[52ch] text-pretty text-[15px] leading-7 text-lp-text-2">{item.body}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </Section>
  );
}
