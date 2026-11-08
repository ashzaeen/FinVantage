const STEPS = [
  { number: 1, title: "Bring in Your Financial Data", body: "Connect a supported account or add your balances and transactions manually." },
  { number: 2, title: "Set the Goals That Matter", body: "A trip, a house, an emergency fund. Goals share one pool of savings, the way real money actually works." },
  { number: 3, title: "Test a Decision First", body: "See the effect on your goals before you buy, not after the statement arrives." },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-18 md:py-24" style={{ background: "var(--landing-primary)" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <h2
          className="text-center text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]"
          style={{ fontFamily: "var(--font-landing-heading)", color: "white" }}
        >
          How It Works
        </h2>
        <ol className="mt-10 grid gap-5 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.number} className="rounded-[22px] border bg-white p-6" style={{ borderColor: "var(--landing-border)", boxShadow: "0 8px 24px -20px rgba(55,48,163,0.32)" }}>
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full text-base font-bold"
                style={{ background: "var(--landing-tint-100)", color: "var(--landing-primary-dark)", fontFamily: "var(--font-landing-heading)" }}
                aria-hidden="true"
              >
                {step.number}
              </span>
              <h3 className="mt-4 text-base font-semibold" style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}>{step.title}</h3>
              <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--landing-text-secondary)" }}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
