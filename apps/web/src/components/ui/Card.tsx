import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  className = "",
  action,
  children,
  noPad = false,
}: {
  title?: string;
  subtitle?: string;
  className?: string;
  action?: ReactNode;
  children: ReactNode;
  noPad?: boolean;
}) {
  return (
    <section
      className={`rounded-3xl bg-white border border-[#edf0f7] ${noPad ? "" : "p-6"} ${className}`}
      style={{
        boxShadow: "0 2px 12px 0 rgba(22, 25, 44, 0.03)",
      }}
    >
      {(title || action) && (
        <div className={`flex items-center justify-between gap-3 ${noPad ? "px-6 pt-6 pb-4" : "mb-4"}`}>
          <div>
            {title && (
              <h2 className="font-poppins text-base font-bold text-[#16192c]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="font-roboto mt-0.5 text-xs text-[#8d94a8]">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
