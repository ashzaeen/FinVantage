import type { ReactNode } from "react";

/** One section per screen: consistent vertical rhythm and the same 1200px column everywhere. */
export function Section({
  id,
  tone = "white",
  children,
  className = "",
  tight = false,
}: {
  id?: string;
  /** Less vertical padding on laptops, for a section that must fit one 720px-tall screen. */
  tight?: boolean;
  tone?: "white" | "tint" | "dark" | "brand";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    white: "bg-white",
    tint: "bg-lp-bg",
    dark: "lp-dark bg-lp-dark text-white",
    brand: "lp-dark bg-lp-primary text-white",
  } as const;
  return (
    <section id={id} className={`scroll-mt-20 py-20 ${tight ? "md:py-20 lg:py-12" : "md:py-28"} ${tones[tone]} ${className}`}>
      <div className="mx-auto max-w-[1200px] px-6">{children}</div>
    </section>
  );
}

/** Heading plus one supporting sentence. No eyebrow: the heading carries the section. */
export function SectionHeading({
  title,
  body,
  align = "left",
  onDark = false,
}: {
  title: string;
  body?: string;
  align?: "left" | "center";
  onDark?: boolean;
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-[44rem] text-center" : "max-w-[44rem]"}>
      <h2 className={`text-balance text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[40px] ${onDark ? "text-white" : "text-lp-text"}`}>{title}</h2>
      {body && <p className={`mt-4 text-pretty text-base leading-7 sm:text-lg sm:leading-8 ${onDark ? "text-lp-dark-text" : "text-lp-text-2"}`}>{body}</p>}
    </div>
  );
}

/** A small caption that marks scripted figures, per the landing rule: never pass invented numbers off as the visitor's own. */
export function ExampleTag({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold ${onDark ? "bg-white/10 text-white/80" : "bg-lp-tint-50 text-lp-primary-dark"}`}
    >
      Example
    </span>
  );
}
