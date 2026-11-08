"use client";

import { useEffect, useState } from "react";
import { AUTH_CLIENT_ID, signIn, signOut } from "@/lib/auth";
import { readClaims, readCookie, TOKEN_COOKIE, usableToken } from "@/lib/token";

type Viewer = { kind: "loading" } | { kind: "demo" } | { kind: "user"; name: string; detail: string };

/** The sidebar's profile card: who is signed in, with sign-in and sign-out. */
export function AccountCard() {
  const [viewer, setViewer] = useState<Viewer>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = usableToken(readCookie(document.cookie, TOKEN_COOKIE));
    const claims = token ? readClaims(token) : null;
    setViewer(
      claims
        ? {
            kind: "user",
            name: claims.name ?? claims.preferred_username ?? claims.email ?? "Signed in",
            detail: claims.email && claims.email !== claims.name ? claims.email : "Signed in",
          }
        : { kind: "demo" },
    );
  }, []);

  const signedIn = viewer.kind === "user";
  const canSignIn = Boolean(AUTH_CLIENT_ID);
  const name = signedIn ? viewer.name : "Jordan Rivera";
  const detail = signedIn ? viewer.detail : "Demo profile";

  const onClick = () => {
    if (busy || viewer.kind === "loading") return;
    if (signedIn) return signOut();
    if (!canSignIn) return;
    setBusy(true);
    void signIn().catch(() => setBusy(false));
  };

  return (
    <div
      className="mt-4 flex items-center justify-between gap-2 rounded-2xl p-2.5 shrink-0"
      style={{ background: "rgba(255, 255, 255, 0.12)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 shrink-0 rounded-full border-2 border-white/40 bg-white/20 flex items-center justify-center font-poppins font-bold text-white text-base overflow-hidden">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div className="min-w-0">
          <p className="font-poppins truncate text-sm font-semibold text-white leading-tight">{name}</p>
          <p className="font-roboto truncate text-xs text-white/60">{detail}</p>
        </div>
      </div>
      {(signedIn || canSignIn) && (
        <button
          type="button"
          onClick={onClick}
          disabled={busy || viewer.kind === "loading"}
          className="shrink-0 rounded-xl px-2.5 py-1.5 font-roboto text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-60"
          style={{ background: "rgba(255, 255, 255, 0.16)" }}
        >
          {signedIn ? "Sign out" : busy ? "Opening…" : "Sign in"}
        </button>
      )}
    </div>
  );
}
