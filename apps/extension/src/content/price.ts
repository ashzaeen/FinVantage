/**
 * Parses a displayed USD price into cents. Returns null for anything else: the PRD says to
 * skip other currencies and never guess.
 */
export function parseUsdCents(text: string): number | null {
  const match = text.trim().match(/^(?:USD\s*)?\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?(?!\d)/i);
  if (!match) return null;
  const dollars = Number(match[1]!.replaceAll(",", ""));
  const cents = match[2] ? Number(match[2]) : 0;
  const total = dollars * 100 + cents;
  return total > 0 ? total : null;
}
