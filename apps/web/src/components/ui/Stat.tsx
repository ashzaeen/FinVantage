import type { ReactNode } from "react";

type Trend = "up" | "down" | "neutral";

export function StatCard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  trend = "up",
  trendValue,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  trend?: Trend;
  trendValue?: string;
}) {
  const isUp = trend === "up";

  return (
    <div
      className="rounded-3xl bg-white border border-[#edf0f7] p-6 transition-all duration-200 hover:shadow-[0_8px_24px_rgba(84,74,247,0.06)]"
      style={{
        boxShadow: "0 2px 10px 0 rgba(22, 25, 44, 0.03)",
      }}
    >
      {/* Top row: Icon + Three-dot options */}
      <div className="flex items-center justify-between">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </span>
        <button
          type="button"
          className="text-[#9ea4b8] hover:text-[#544af7] transition-colors p-1"
          aria-label="Options"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>

      {/* Label in Roboto */}
      <p className="mt-5 font-roboto text-xs font-normal text-[#8d94a8]">
        {label}
      </p>

      {/* Key metric in Poppins + Trend badge in Roboto */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="font-poppins text-[26px] font-bold tracking-tight text-[#16192c] tabular-nums">
          {value}
        </span>
        {trendValue && (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 font-roboto text-xs font-medium"
            style={{
              backgroundColor: isUp ? "#e6faf4" : "#ffecee",
              color: isUp ? "#00c48c" : "#ff4d6d",
            }}
          >
            {trendValue}
          </span>
        )}
      </div>
    </div>
  );
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
