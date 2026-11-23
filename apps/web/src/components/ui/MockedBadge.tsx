"use client";

import { useViewer } from "./ViewerProvider";

/**
 * PRD: mocked data must be labeled. On the demo profile everything is sample data and the profile card
 * says so, so the badge is hidden there. A signed-in account still sees it, because the portfolio and
 * credit score are mocked for everyone.
 */
export function MockedBadge() {
  const { isDemo } = useViewer();
  if (isDemo) return null;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        background: "var(--warning-bg)",
        color: "var(--warning-text)",
        border: "1px solid var(--warning-bg)",
      }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--warning)" }} />
      Mocked data
    </span>
  );
}
