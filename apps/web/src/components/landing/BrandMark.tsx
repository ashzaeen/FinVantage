/** The FinVantage mark from the dashboard sidebar, drawn for light backgrounds. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl bg-accent"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <path d="M12 2C8.5 6 6 9.5 6 13.5a6 6 0 0 0 12 0c0-4-2.5-7.5-6-11.5z" fill="white" />
        <circle cx="12" cy="14" r="2.5" fill="var(--accent)" />
      </svg>
    </span>
  );
}
