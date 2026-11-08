/** PRD: mocked data must be labeled. */
export function MockedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        background: "var(--warning-bg)",
        color: "var(--warning)",
        border: "1px solid var(--warning-bg)",
      }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--warning)" }} />
      Mocked data
    </span>
  );
}
