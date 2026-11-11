import { createApiClient } from "@finvantage/contracts";
import { createSessionFetch } from "./session-fetch";
import { readClaims, readCookie, TOKEN_COOKIE, usableToken } from "./token";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
/** Used when nobody is signed in. Also used by the extension and tests. */
export const API_TOKEN = process.env.NEXT_PUBLIC_DEMO_TOKEN ?? "demo-token";

/** The signed-in user's token if there is a good one, otherwise the demo token. */
export async function currentToken(): Promise<string> {
  let saved: string | undefined;
  if (typeof window === "undefined") {
    try {
      const { cookies } = await import("next/headers");
      saved = (await cookies()).get(TOKEN_COOKIE)?.value;
    } catch {
      // Outside a request (build time): signed out.
    }
  } else {
    saved = readCookie(document.cookie, TOKEN_COOKIE);
  }
  return usableToken(saved) ?? API_TOKEN;
}

/** Keeps a token in the sign-in cookie, or clears it with null. Browser only. */
function saveTokenCookie(token: string | null): void {
  const exp = token ? readClaims(token)?.exp : undefined;
  const maxAge = exp ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 0;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOKEN_COOKIE}=${token && exp ? encodeURIComponent(token) : ""}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

// A refused session (for example after the API's signing key changed) is swapped for a fresh guest
// session in the browser, so writes keep working. On the server it falls back to the read-only
// demo token so the page still renders; the browser then recovers on its first call.
const inBrowser = typeof window !== "undefined";
const fetchAsCurrentUser = createSessionFetch({
  demoToken: API_TOKEN,
  readToken: currentToken,
  startGuest: inBrowser
    ? async () => (await createApiClient({ baseUrl: API_URL, token: "" }).startGuestSession()).token
    : undefined,
  saveToken: inBrowser ? saveTokenCookie : undefined,
});

/** Works in server and client components. Every response is validated against the contracts. */
export const api = createApiClient({ baseUrl: API_URL, token: API_TOKEN, fetch: fetchAsCurrentUser });
