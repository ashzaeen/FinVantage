import { Lock, ShieldCheck, Eye, Gauge } from "lucide-react";

/**
 * Copy here is kept to what the repo actually confirms, per the task's content rules:
 * - "Encrypted Connections" and "Read-Only Access": root AGENTS.md rule #4 ("Suggest only.
 *   Nothing moves money, applies for credit, or clicks anything") and rule #10 (sandbox-only
 *   data) are real, enforced rules. Whether the underlying Plaid connection scope itself is
 *   read-only at the API level is a fact an engineer should confirm before this ships beyond
 *   the hackathon demo.
 *   TODO: confirm the exact Plaid connection scope/permissions with whoever owns that
 *   integration, and update this card's body copy to cite it directly.
 * - "Never Sold": there is no data-sharing or sale policy anywhere in this repo yet.
 *   TODO: write and link an actual policy before claiming this in production; until then the
 *   copy below only states the one thing that is true today (sandbox/synthetic data).
 */
const POINTS = [
  {
    icon: Lock,
    title: "Encrypted Connections",
    body: "Bank connections run through Plaid in sandbox mode, over the same encrypted connection standard real banking apps use.",
  },
  {
    icon: Eye,
    title: "Read-Only Access",
    body: "FinVantage never moves money, applies for credit, or takes an action on your accounts. It only suggests, and you decide.",
  },
  {
    icon: ShieldCheck,
    title: "Sandbox Data",
    body: "This build uses synthetic or sandbox financial data. Production bank connections are not enabled.",
  },
  {
    icon: Gauge,
    title: "Honest Estimates",
    body: "Your future is shown as a range, with the disclaimer next to it, never a single number dressed up as a guarantee.",
  },
];

export function TrustSection() {
  return (
    <section id="trust" className="scroll-mt-20 py-18 md:py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <h2
          className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]"
          style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}
        >
          Built to Be Trusted
        </h2>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-[20px] p-5" style={{ background: "var(--landing-tint-50)" }}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white" style={{ color: "var(--landing-primary)" }}>
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-semibold" style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}>{title}</h3>
              <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--landing-text-secondary)" }}>{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
