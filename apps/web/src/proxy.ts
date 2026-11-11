import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@finvantage/contracts";
import { API_URL } from "@/lib/api";
import { readClaims, TOKEN_COOKIE, usableToken } from "@/lib/token";

/**
 * Gives each signed-out visitor their own guest session before a dashboard page renders.
 *
 * Without this, signed-out visitors all used the shared demo token, so they all read and wrote one
 * demo user: one visitor could plant a goal whose name carried instructions, and every other
 * visitor's Advisor would read it (docs/security-review). Now each visitor gets a private copy of
 * the demo profile. The API still decides what every token may do; this only obtains one.
 *
 * If the API cannot be reached, the page falls back to the shared demo token, which the API keeps
 * read-only, so the demo still renders and nothing is shared.
 */
export async function proxy(request: NextRequest) {
  if (usableToken(request.cookies.get(TOKEN_COOKIE)?.value)) return NextResponse.next();

  let token: string;
  try {
    token = (await createApiClient({ baseUrl: API_URL, token: "" }).startGuestSession()).token;
  } catch {
    return NextResponse.next();
  }
  const claims = readClaims(token);
  if (!claims) return NextResponse.next();

  // Set it on the request too, so server components rendering this same request already see it.
  request.cookies.set(TOKEN_COOKIE, token);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(TOKEN_COOKIE, token, {
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: Math.max(0, claims.exp - Math.floor(Date.now() / 1000)),
  });
  return response;
}

// Dashboard pages only. The landing page, sign-in, and legal pages stay public and session-free.
// Link prefetches are skipped: each would start a session the visitor may never open, and Next
// hides the prefetch headers from `request`, so the matcher has to filter them.
export const config = {
  matcher: [
    {
      source:
        "/:section(app|accounts|advisor|copilot|credit|goals|income|life-events|portfolio|reports|settings|spending|transactions)/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
