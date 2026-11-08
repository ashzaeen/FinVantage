/**
 * A FinVantage sign-in lives in this cookie on the web app's origin. The web app sends it to the
 * API, and the extension reads it (chrome.cookies, scoped to that origin) so the Copilot follows
 * whoever is signed in to the dashboard. Signed out, or once it expires, both use the demo token.
 */
export const SESSION_COOKIE = "fv_token";

export interface TokenClaims {
  sub: string;
  exp: number;
  name?: string;
  email?: string;
}

/** Reads a JWT's claims without verifying it. Only for display and expiry; the API verifies. */
export function readClaims(token: string): TokenClaims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) => c.charCodeAt(0)),
    );
    const claims = JSON.parse(json) as Partial<TokenClaims>;
    return typeof claims.sub === "string" && typeof claims.exp === "number" ? (claims as TokenClaims) : null;
  } catch {
    return null;
  }
}

/** The token if it is still good for at least another 30 seconds, otherwise null. */
export function usableToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const claims = readClaims(token);
  return claims && claims.exp * 1000 > Date.now() + 30_000 ? token : null;
}
