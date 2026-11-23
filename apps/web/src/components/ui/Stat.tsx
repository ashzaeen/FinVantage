import type { ReactNode } from "react";
import Link from "next/link";

type Trend = "up" | "down" | "neutral";

export function StatCard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  trend = "up",
  trendValue,
  badge,
  detail,
  href,
  cardBg = "var(--surface-raised)",
  className: extraClassName = "",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  trend?: Trend;
  trendValue?: string;
  badge?: ReactNode;
  /** One small line under the value, such as what the value is made of. */
  detail?: ReactNode;
  href?: string;
  cardBg?: string;
  /** Extra classes for the tile itself, such as a grid span. */
  className?: string;
}) {
  const trendStyle = trend === "neutral"
    ? { backgroundColor: "var(--surface-inset)", color: "var(--ink-muted)" }
    : trend === "up"
      ? { backgroundColor: "var(--good-bg)", color: "var(--gain)" }
      : { backgroundColor: "var(--critical-bg)", color: "var(--loss)" };

  const content = (
      <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-11 sm:w-11"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </span>
        {badge ?? (trendValue && <span className="inline-flex max-w-[55%] truncate rounded-full px-2.5 py-1 font-roboto text-xs font-medium" style={trendStyle}>{trendValue}</span>)}
      </div>
      <p className="mt-3 font-roboto text-xs font-medium text-muted sm:mt-4">{label}</p>
      <p className="mt-1 truncate font-poppins text-xl sm:text-2xl font-bold leading-tight tracking-tight text-ink tabular-nums" title={value}>{value}</p>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
      </>
  );

  const className = `block min-h-28 rounded-2xl border border-line p-4 [box-shadow:var(--shadow-resting)] transition duration-200 hover:border-[color:var(--border-accent)] hover:[box-shadow:var(--shadow-lift)] sm:min-h-36 sm:p-5 ${extraClassName}`;
  return href ? (
    <Link href={href} style={{ backgroundColor: cardBg }} className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface`}>
      {content}
    </Link>
  ) : <div className={className} style={{ backgroundColor: cardBg }}>{content}</div>;
}

/** Fallback Stat component */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-raised border border-line p-5 shadow-sm">
      <p className="font-roboto text-xs font-normal text-muted">{label}</p>
      <p className="font-poppins mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}
