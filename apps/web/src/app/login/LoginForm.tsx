"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { nextPath, saveSession } from "@/lib/session";

type Mode = "signin" | "signup";

const inputCls =
  "mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent";
const inputStyle = { borderColor: "var(--border)", background: "var(--surface-inset)", color: "var(--ink)" };

function messageFor(error: unknown, mode: Mode): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Wrong email or password.";
    if (error.status === 409) return "That email is already registered. Sign in instead.";
    if (error.status === 400) {
      return mode === "signup"
        ? "Check your details: a valid email, and a password of at least 8 characters."
        : "Enter a valid email and your password.";
    }
  }
  return "Something went wrong. Please try again.";
}

interface LoginFormProps {
  /** Drops the page margins and uses an h2, for placing the form inside another page. */
  embedded?: boolean;
  /** Replaces the "Just looking?" note under the card. */
  footer?: ReactNode;
}

/** Reads ?mode=signup so a link can deep-link straight into account creation. Read directly from
 * window.location rather than useSearchParams, so this client component needs no Suspense
 * boundary at its call sites (matches the window.location pattern already used for ?copilotEvent
 * on the life-events page). */
function initialModeFromUrl(): Mode {
  if (typeof window === "undefined") return "signin";
  return new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin";
}

export function LoginForm({ embedded = false, footer }: LoginFormProps = {}) {
  const [mode, setMode] = useState<Mode>(initialModeFromUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setBusy(true);
    setError(null);
    try {
      const { token } =
        mode === "signup"
          ? await api.signUp({ body: { displayName: String(form.get("name") ?? ""), email, password } })
          : await api.logIn({ body: { email, password } });
      saveSession(token);
      // A full load, so server-rendered pages pick up the new cookie.
      window.location.replace(nextPath());
    } catch (e) {
      setError(messageFor(e, mode));
      setBusy(false);
    }
  }

  const Heading = embedded ? "h2" : "h1";

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(value);
        setError(null);
      }}
      className="flex-1 rounded-xl py-2 text-sm font-semibold transition-colors"
      style={
        mode === value
          ? { background: "var(--surface-raised)", color: "var(--accent)", boxShadow: "var(--shadow-sm)" }
          : { color: "var(--ink-muted)" }
      }
    >
      {label}
    </button>
  );

  return (
    <div className={embedded ? "w-full" : "mx-auto mt-6 w-full max-w-md md:mt-16"}>
      <section
        className={`rounded-3xl border bg-white ${embedded ? "p-6" : "p-7"}`}
        style={{ borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}
      >
        <Heading
          className={`font-poppins font-bold tracking-tight ${embedded ? "text-xl" : "text-2xl"}`}
          style={{ color: "var(--ink)" }}
        >
          {mode === "signin" ? "Welcome Back" : "Create Your Account"}
        </Heading>
        <p className="mt-1 font-roboto text-sm" style={{ color: "var(--ink-muted)" }}>
          {mode === "signin"
            ? "Sign in to see your own FinVantage dashboard."
            : "New accounts start with a demo profile you can explore."}
        </p>

        <div className={`${embedded ? "mt-4" : "mt-6"} flex gap-1 rounded-2xl p-1`} style={{ background: "var(--surface-inset)" }}>
          {tab("signin", "Sign In")}
          {tab("signup", "Create Account")}
        </div>

        <form onSubmit={onSubmit} className={`${embedded ? "mt-4 gap-3" : "mt-5 gap-4"} flex flex-col font-roboto`}>
          {mode === "signup" && (
            <label className="text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
              Name
              <input name="name" required autoComplete="name" maxLength={80} className={inputCls} style={inputStyle} />
            </label>
          )}
          <label className="text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
            Email
            <input name="email" type="email" required autoComplete="email" className={inputCls} style={inputStyle} />
          </label>
          <label className="text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={mode === "signup" ? 8 : 1}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className={inputCls}
              style={inputStyle}
            />
            {mode === "signup" && (
              <span className="mt-1 block text-xs font-normal" style={{ color: "var(--ink-muted)" }}>
                At least 8 characters.
              </span>
            )}
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-xl px-3 py-2.5 text-sm"
              style={{ background: "var(--critical-bg)", color: "var(--critical)" }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-xl py-3 text-sm font-bold text-white transition-colors disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "One Moment…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </section>
      {footer ?? (
        <p className="mt-4 text-center font-roboto text-xs" style={{ color: "var(--ink-muted)" }}>
          Just looking? The dashboard works without an account, using the demo profile.
        </p>
      )}
    </div>
  );
}
