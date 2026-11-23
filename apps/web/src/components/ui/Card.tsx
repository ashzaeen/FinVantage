import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  className = "",
  action,
  children,
  noPad = false,
  lift = true,
}: {
  title?: string;
  subtitle?: string;
  className?: string;
  action?: ReactNode;
  children: ReactNode;
  noPad?: boolean;
  /** Rise on hover, like the Accounts tiles. Turn off for forms and controls. */
  lift?: boolean;
}) {
  return (
    <section
      className={`min-w-0 rounded-3xl bg-raised border border-line ${noPad ? "" : "p-4 sm:p-6"} ${lift ? "card-lift" : ""} ${className}`}
      style={{
        boxShadow: "var(--shadow-resting)",
      }}
    >
      {(title || action) && (
        <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 ${noPad ? "px-5 pt-5 pb-4 sm:px-6 sm:pt-6" : "mb-4"}`}>
          <div className="min-w-0 flex-1 basis-44">
            {title && (
              <h2 className="font-poppins text-base font-bold text-ink">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="font-roboto mt-0.5 text-xs text-muted">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="max-w-full shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
