import { createApiClient } from "@finvantage/contracts";
import { readCookie, TOKEN_COOKIE, usableToken } from "./token";

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

const fetchAsCurrentUser: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${await currentToken()}`);
  return fetch(input, { ...init, headers });
};

/** Works in server and client components. Every response is validated against the contracts. */
export const api = createApiClient({ baseUrl: API_URL, token: API_TOKEN, fetch: fetchAsCurrentUser });
