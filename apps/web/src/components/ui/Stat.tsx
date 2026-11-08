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
  href,
  cardBg = "#ffffff",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  trend?: Trend;
  trendValue?: string;
  badge?: ReactNode;
  href?: string;
  cardBg?: string;
}) {
  const trendStyle = trend === "neutral"
    ? { backgroundColor: "var(--surface-inset)", color: "var(--ink-muted)" }
    : trend === "up"
      ? { backgroundColor: "#e6faf4", color: "#00c48c" }
      : { backgroundColor: "#ffecee", color: "#ff4d6d" };

  const content = (
      <>
      <div className="flex items-center justify-between gap-2">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </span>
        {badge ?? (trendValue && <span className="inline-flex max-w-[55%] truncate rounded-full px-2.5 py-1 font-roboto text-[11px] font-medium" style={trendStyle}>{trendValue}</span>)}
      </div>
      <p className="mt-4 font-roboto text-xs font-medium text-[#8d94a8]">{label}</p>
      <p className="mt-1 truncate font-poppins text-[clamp(1.25rem,2vw,1.7rem)] font-bold leading-tight tracking-tight text-[#16192c] tabular-nums" title={value}>{value}</p>
      </>
  );

  const className = "block min-h-36 rounded-2xl border border-[#edf0f7] p-4 shadow-[0_2px_10px_rgba(22,25,44,0.03)] transition duration-200 hover:border-[#d7d4ff] hover:shadow-[0_8px_24px_rgba(84,74,247,0.08)] sm:p-5";
  return href ? (
    <Link href={href} style={{ backgroundColor: cardBg }} className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7] focus-visible:ring-offset-2`}>
      {content}
    </Link>
  ) : <div className={className} style={{ backgroundColor: cardBg }}>{content}</div>;
}

/** Fallback Stat component */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white border border-[#edf0f7] p-5 shadow-sm">
      <p className="font-roboto text-xs font-normal text-[#8d94a8]">{label}</p>
      <p className="font-poppins mt-1 text-2xl font-bold tabular-nums text-[#16192c]">{value}</p>
    </div>
  );
}
