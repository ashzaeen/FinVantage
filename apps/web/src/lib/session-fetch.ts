import { usableToken } from "@finvantage/contracts";

/**
 * The fetch every API call goes through: it sends the visitor's token and recovers when that
 * token stops working.
 *
 * A cookie can look fine here (well formed, not expired) and still be refused by the API with a
 * 401: the API's signing key changed (locally it is a throwaway key, so every `tsx watch` restart
 * changes it), or the token was signed by a different deployment. The page proxy only checks
 * expiry, so it keeps that cookie. Falling back to the shared demo token is not enough: that token
 * is read-only (security review W1), so the visitor's next write, such as starting an Advisor
 * chat, got `403 demo_read_only` and the page said it "couldn't reach the Advisor".
 *
 * In the browser, a refused session is replaced with a fresh guest session and the request is
 * retried, the same thing the page proxy does for a visitor with no cookie. The same happens when
 * the demo token is refused a write. Only when no guest session can be started (the API is down,
 * or the guest limit was hit) does it fall back to the read-only demo token.
 */
export interface SessionFetchOptions {
  /** The shared, read-only demo token. */
  demoToken: string;
  /** The saved sign-in or guest token, if any. */
  readToken: () => string | undefined | Promise<string | undefined>;
  /** Starts a guest session and returns its token. Browser only; leave out on the server. */
  startGuest?: () => Promise<string>;
  /** Saves a new token, or clears the saved one with null. Browser only. */
  saveToken?: (token: string | null) => void;
  fetch?: typeof fetch;
}

export function createSessionFetch(options: SessionFetchOptions): typeof fetch {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  // Several calls can be refused at once (a page loads its data in parallel). They share one new
  // guest session instead of each starting its own.
  let guestInFlight: Promise<string | null> | null = null;

  const send = (input: RequestInfo | URL, init: RequestInit | undefined, token: string) => {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${token}`);
    return doFetch(input, { ...init, headers });
  };

  const freshGuest = (): Promise<string | null> => {
    const start = options.startGuest;
    if (!start) return Promise.resolve(null);
    guestInFlight ??= start()
      .then((token) => {
        options.saveToken?.(token);
        return token;
      })
      .catch(() => null)
      .finally(() => {
        guestInFlight = null;
      });
    return guestInFlight;
  };

  return async (input, init) => {
    const token = usableToken(await options.readToken()) ?? options.demoToken;
    const response = await send(input, init, token);

    const refusedSession = response.status === 401 && token !== options.demoToken;
    const refusedDemoWrite = response.status === 403 && token === options.demoToken && (await errorCode(response)) === "demo_read_only";
    if (!refusedSession && !refusedDemoWrite) return response;

    const guest = await freshGuest();
    if (guest) return send(input, init, guest);
    if (refusedDemoWrite) return response;

    // No guest session to be had: signed out, on the read-only demo profile, so the page still loads.
    options.saveToken?.(null);
    return send(input, init, options.demoToken);
  };
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : undefined;
  } catch {
    return undefined;
  }
}
