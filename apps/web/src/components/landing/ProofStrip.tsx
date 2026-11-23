import { Eye, Gauge, Hand, Lock } from "lucide-react";
import { Reveal } from "./motion";

/** Four facts the product enforces in code (root AGENTS.md rules 4, 5, 7 and 10), in one quiet line. */
const FACTS = [
  { Icon: Hand, text: "Suggests only, never acts." },
  { Icon: Eye, text: "The extension reads four fields." },
  { Icon: Gauge, text: "Ranges, not guarantees." },
  { Icon: Lock, text: "Sample data in the demo." },
] as const;

export function ProofStrip() {
  return (
    <section aria-label="Product principles" className="border-y border-lp-line bg-lp-surface">
      <Reveal>
        <ul className="mx-auto grid max-w-[1200px] grid-cols-1 gap-x-8 gap-y-4 px-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm font-medium text-lp-text-2">
              <Icon size={18} className="shrink-0 text-lp-ink" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
