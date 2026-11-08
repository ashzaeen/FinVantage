"use client";

import { useEffect, useState } from "react";
import { completeSignIn } from "@/lib/auth";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completeSignIn()
      // A full page load, so server-rendered pages pick up the new cookie.
      .then((next) => window.location.replace(next))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Sign-in failed."));
  }, []);

  return (
    <div className="mx-auto mt-24 max-w-md text-center font-roboto">
      {error ? (
        <>
          <p className="font-poppins text-lg font-semibold text-[#1b1b2f]">Sign-in didn&apos;t work</p>
          <p className="mt-2 text-sm text-[#6b6b80]">{error}</p>
          <a href="/" className="mt-6 inline-block rounded-2xl bg-[#544af7] px-5 py-2.5 text-sm font-medium text-white">
            Back to the dashboard
          </a>
        </>
      ) : (
        <p className="text-sm text-[#6b6b80]">Signing you in…</p>
      )}
    </div>
  );
}
