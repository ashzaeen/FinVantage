"use client";

import { safeNextPath } from "@finvantage/contracts";
import { readClaims, TOKEN_COOKIE } from "./token";

/** Keeps a sign-in token from /auth/login or /auth/signup in the TOKEN_COOKIE cookie. */
export function saveSession(token: string): void {
  const claims = readClaims(token);
  if (!claims) throw new Error("The server sent an unreadable token.");
  const maxAge = Math.max(0, claims.exp - Math.floor(Date.now() / 1000));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/** Back to the demo profile. A full reload, so server-rendered pages drop the old token too. */
export function signOut(): void {
  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  window.location.reload();
}

/** Where to go after signing in: the `next` query value if it is a local path, else the dashboard. */
export function nextPath(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"), window.location.origin);
}
