"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/session";
import { readClaims, readCookie, TOKEN_COOKIE, usableToken } from "@/lib/token";

type Viewer = { kind: "loading" } | { kind: "demo" } | { kind: "user"; name: string; detail: string };

const buttonCls =
  "shrink-0 rounded-xl px-2.5 py-1.5 font-roboto text-xs font-medium text-white transition-colors hover:bg-white/20";
const buttonStyle = { background: "rgba(255, 255, 255, 0.16)" };

/** The sidebar's profile card: who is signed in, with sign-in and sign-out. */
export function AccountCard() {
  const pathname = usePathname();
  const [viewer, setViewer] = useState<Viewer>({ kind: "loading" });

  useEffect(() => {
    const token = usableToken(readCookie(document.cookie, TOKEN_COOKIE));
    const claims = token ? readClaims(token) : null;
    setViewer(
      claims
        ? {
            kind: "user",
            name: claims.name ?? claims.email ?? "Signed in",
            detail: claims.email && claims.email !== claims.name ? claims.email : "Signed in",
          }
        : { kind: "demo" },
    );
  }, []);

  const signedIn = viewer.kind === "user";
  const name = signedIn ? viewer.name : "Jordan Rivera";
  const detail = signedIn ? viewer.detail : "Demo profile";

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
      {viewer.kind === "user" && (
        <button type="button" onClick={signOut} className={buttonCls} style={buttonStyle}>
          Sign out
        </button>
      )}
      {viewer.kind === "demo" && pathname !== "/login" && (
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={buttonCls} style={buttonStyle}>
          Sign in
        </Link>
      )}
    </div>
  );
}
