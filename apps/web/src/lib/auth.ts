"use client";

/**
 * Sign-in with SpacetimeAuth: OpenID Connect authorization code flow with PKCE, run entirely in
 * the browser. There is no client secret. The ID token is kept in the TOKEN_COOKIE cookie.
 */
import { readClaims, readCookie, TOKEN_COOKIE } from "./token";

const ISSUER = "https://auth.spacetimedb.com/oidc";
export const AUTH_CLIENT_ID = process.env.NEXT_PUBLIC_SPACETIMEAUTH_CLIENT_ID ?? "";
const PENDING_KEY = "fv_signin";

const redirectUri = () => `${window.location.origin}/auth/callback`;

function randomString(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signIn(): Promise<void> {
  const verifier = randomString();
  const state = randomString(16);
  const challenge = base64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  sessionStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ verifier, state, returnTo: window.location.pathname + window.location.search }),
  );
  const url = new URL(`${ISSUER}/auth`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: AUTH_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: "openid profile email",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  window.location.assign(url);
}

/** Runs on /auth/callback. Returns where to go next. Throws with a readable message on failure. */
export async function completeSignIn(): Promise<string> {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error_description") ?? params.get("error");
  if (error) throw new Error(error);

  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as
    | { verifier: string; state: string; returnTo: string }
    | null;
  sessionStorage.removeItem(PENDING_KEY);
  const code = params.get("code");
  if (!pending || !code || params.get("state") !== pending.state) {
    throw new Error("This sign-in link is stale. Please sign in again.");
  }

  const res = await fetch(`${ISSUER}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: AUTH_CLIENT_ID,
      code_verifier: pending.verifier,
    }),
  });
  const body = (await res.json().catch(() => null)) as { id_token?: string; error_description?: string } | null;
  const claims = body?.id_token ? readClaims(body.id_token) : null;
  if (!res.ok || !body?.id_token || !claims) {
    throw new Error(body?.error_description ?? `Sign-in failed (${res.status}).`);
  }

  const maxAge = Math.max(0, claims.exp - Math.floor(Date.now() / 1000));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(body.id_token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  return pending.returnTo.startsWith("/") && !pending.returnTo.startsWith("/auth") ? pending.returnTo : "/";
}

export function signOut(): void {
  const token = readCookie(document.cookie, TOKEN_COOKIE);
  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  const url = new URL(`${ISSUER}/session/end`);
  url.search = new URLSearchParams({
    client_id: AUTH_CLIENT_ID,
    post_logout_redirect_uri: window.location.origin,
    ...(token ? { id_token_hint: token } : {}),
  }).toString();
  window.location.assign(url);
}
