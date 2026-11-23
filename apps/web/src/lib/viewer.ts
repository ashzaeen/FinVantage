import { readClaims, usableToken } from "./token";

/**
 * Whether the person looking is on the demo profile (no sign-in, or a guest session, which is a private
 * copy of the demo) rather than a signed-in account. In the demo every figure is sample data, so the
 * "Mocked data" badges would only repeat what the profile card already says. For a signed-in account
 * the badge stays: the portfolio and credit score are mocked for everyone.
 */
export function isDemoViewer(token: string | undefined | null): boolean {
  const usable = usableToken(token);
  if (!usable) return true;
  const claims = readClaims(usable);
  return !claims || claims.guest === true;
}
