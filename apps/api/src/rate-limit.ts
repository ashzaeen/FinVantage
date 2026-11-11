import { createHash, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { DEMO_USER_ID } from "@finvantage/data";
import type { AppEnv } from "./mount";

/**
 * Request limits (security review W4). Nothing limited requests before: a burst of 25
 * wrong-password logins, guest sessions, or Copilot calls all went through. Login could be guessed
 * at, every guest session copies the demo profile into memory, and the model routes spend Gemini
 * quota (one Advisor message can make several model calls).
 *
 * Counts live in memory, per server instance. That bounds one process and is enough locally and
 * for the demo; with several serverless instances each keeps its own count, so production should
 * also use a shared store (such as Redis) or the host's firewall rules.
 */
export interface RateRule {
  name: string;
  method: string;
  path: RegExp;
  limit: number;
  windowMs: number;
  /** "user" counts per signed-in or guest user (the shared demo user counts per IP); "ip" per address. */
  per: "user" | "ip";
}

const MINUTE = 60_000;
const MODEL_ROUTES = /^\/v1\/(?:copilot\/evaluate|life-events\/parse|advisory|advisory\/chat|advisory\/conversations\/[^/]+\/messages|reports\/quarterly)$/;
const ADVISOR_ROUTES = /^\/v1\/advisory\/(?:chat|conversations\/[^/]+\/messages)$/;

/** Before sign-in: counted per address. */
export const AUTH_RULES: readonly RateRule[] = [
  { name: "login", method: "POST", path: /^\/auth\/login$/, limit: 10, windowMs: 5 * MINUTE, per: "ip" },
  { name: "signup", method: "POST", path: /^\/auth\/signup$/, limit: 5, windowMs: 60 * MINUTE, per: "ip" },
  // Generous: judges at one venue share an address, and each visit needs one session.
  { name: "guest", method: "POST", path: /^\/auth\/guest$/, limit: 30, windowMs: 60 * MINUTE, per: "ip" },
];

/** Routes that call the model. Every matching rule must allow the request. */
export const MODEL_RULES: readonly RateRule[] = [
  // One Advisor message can make several model calls (tool rounds, web search, a retry).
  { name: "advisor", method: "POST", path: ADVISOR_ROUTES, limit: 10, windowMs: MINUTE, per: "user" },
  { name: "model", method: "POST", path: MODEL_ROUTES, limit: 30, windowMs: MINUTE, per: "user" },
  // So a stream of new guest sessions can't multiply the per-user allowance.
  { name: "model-ip", method: "POST", path: MODEL_ROUTES, limit: 60, windowMs: MINUTE, per: "ip" },
];

/**
 * Routes that run the Monte Carlo simulator. A run at the contract's maximum of 50,000 paths took
 * about two seconds on the one thread that serves every request, and nothing limited it (security
 * review N6). The dashboard's sliders call these while the user drags, so the allowance is generous.
 */
const COMPUTE_ROUTES = /^\/v1\/(?:simulations|life-events|life-events\/preview|life-simulator\/analyze|life-simulator\/export\/pdf|advisory\/visuals)$/;
export const COMPUTE_RULES: readonly RateRule[] = [
  { name: "compute", method: "POST", path: COMPUTE_ROUTES, limit: 60, windowMs: MINUTE, per: "user" },
  { name: "compute-ip", method: "POST", path: COMPUTE_ROUTES, limit: 120, windowMs: MINUTE, per: "ip" },
];

/** Fixed-window counters. Old windows are dropped once the map grows, so memory stays bounded. */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  /** Counts one request; returns how long to wait when it is over the limit. */
  hit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.clock();
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.prune(now);
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return { allowed: window.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
  }

  private prune(now: number) {
    if (this.windows.size < this.maxKeys) return;
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
    // Still full of live windows: drop the oldest. Map keeps insertion order.
    while (this.windows.size >= this.maxKeys) this.windows.delete(this.windows.keys().next().value!);
  }
}

/**
 * The caller's address. Behind Vercel, `x-real-ip` and `x-forwarded-for` are set by the platform.
 * Anywhere a client can reach the server directly it can forge them, so per-IP limits there need a
 * trusted proxy in front. Without any header (tests, local calls) every caller shares one key.
 */
export function clientIp(c: Context, webProxySecret: string | null = null): string {
  // The web app asks for guest sessions from its own server, so without this every visitor looked
  // like one address and 30 visitors an hour used up the demo for everyone (second review, R2-1).
  // The web server names the visitor's address, and is believed only with the shared secret.
  const visitor = c.req.header(VISITOR_IP_HEADER)?.trim();
  if (visitor && webProxySecret && sameSecret(c.req.header(PROXY_SECRET_HEADER) ?? "", webProxySecret)) return visitor;
  const real = c.req.header("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const socket = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket;
  return socket?.remoteAddress ?? "unknown";
}

export const VISITOR_IP_HEADER = "x-finvantage-visitor-ip";
export const PROXY_SECRET_HEADER = "x-finvantage-proxy-secret";

/** Compares two secrets without leaking, through timing, how much of a guess was right. */
export function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export function rateLimit(
  limiter: RateLimiter,
  rules: readonly RateRule[],
  webProxySecret: string | null = null,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    for (const rule of rules) {
      if (rule.method !== c.req.method || !rule.path.test(c.req.path)) continue;
      const userId = rule.per === "user" ? c.get("userId") : undefined;
      // Everyone on the shared demo token is one user, so count them by address instead.
      const who = userId && userId !== DEMO_USER_ID ? `user:${userId}` : `ip:${clientIp(c, webProxySecret)}`;
      const { allowed, retryAfterSeconds } = limiter.hit(`${rule.name}:${who}`, rule.limit, rule.windowMs);
      if (!allowed) {
        c.header("Retry-After", String(retryAfterSeconds));
        return c.json(
          { error: { code: "rate_limited", message: `Too many requests. Try again in ${retryAfterSeconds} seconds.` } },
          429,
        );
      }
    }
    await next();
  };
}
