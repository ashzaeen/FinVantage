/**
 * The sign-in cookie and token helpers are shared with the extension, which reads the same cookie
 * so the Copilot follows whoever is signed in here. They live in @finvantage/contracts.
 */
export { SESSION_COOKIE as TOKEN_COOKIE, readClaims, usableToken, type TokenClaims } from "@finvantage/contracts";

export function readCookie(cookieHeader: string, name: string): string | undefined {
  const prefix = `${name}=`;
  const entry = cookieHeader.split("; ").find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : undefined;
}
