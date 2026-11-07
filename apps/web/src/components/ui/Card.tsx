import type { ReactNode } from "react";

export function Card({
  title,
  className = "",
  children,
}: {
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-lg border border-line bg-raised p-4 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-medium">{title}</h2>}
      {children}
    </section>
  );
}
