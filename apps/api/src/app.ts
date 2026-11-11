import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { DEMO_USER_ID, NotImplementedError } from "@finvantage/data";
import type { AppDeps } from "./deps";
import { HttpError, type AppEnv } from "./mount";
import { registerAccountRoutes } from "./routes/accounts";
import { registerAdvisorRoutes } from "./routes/advisor";
import { registerAgentRoutes } from "./routes/agents";
import { ensureProfile, registerAuthRoutes } from "./routes/auth";
import { registerBankRoutes } from "./routes/bank";
import { registerCopilotRoutes } from "./routes/copilot";
import { registerGoalRoutes } from "./routes/goals";
import { registerLifeEventRoutes } from "./routes/life-events";
import { registerLifeScenarioRoutes } from "./routes/life-scenarios";
import { registerLifeSimulatorRoutes } from "./routes/life-simulator";
import { registerLiveRoutes } from "./routes/live";
import { registerMockedRoutes } from "./routes/mocked";
import { registerProfileRoutes } from "./routes/profile";
import { registerSimulationRoutes } from "./routes/simulations";
import { registerIncomeRoutes } from "./routes/income";
import { registerSpendingRoutes } from "./routes/spending";
import { registerTransactionRoutes } from "./routes/transactions";
import { AUTH_RULES, COMPUTE_RULES, MODEL_RULES, RateLimiter, rateLimit } from "./rate-limit";

/**
 * `WEB_ORIGIN` is a comma-separated list. An entry may use `*` for one subdomain label, such as
 * `https://finvantage-web-*.vercel.app`, so Vercel preview deployments can call the API.
 */
export function originMatcher(list: string): (origin: string) => boolean {
  const patterns = list
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const escaped = entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+");
      return new RegExp(`^${escaped}$`, "i");
    });
  return (origin) => patterns.some((pattern) => pattern.test(origin));
}

/**
 * The shared demo token is public (it ships in the web bundle and the extension), and every holder
 * acts as the same demo user. So it may only read, plus the two Copilot calls the extension makes
 * when nobody is signed in. Writes from a signed-out visitor go through their own guest session
 * (`POST /auth/guest`). An allowlist, so a route added later is refused until someone adds it here.
 */
const DEMO_TOKEN_WRITES: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: "POST", path: /^\/v1\/copilot\/evaluate$/ },
  { method: "POST", path: /^\/v1\/copilot\/events\/[^/]+\/action$/ },
];

/** The only routes that accept `?token=`. */
const TOKEN_IN_URL = /^\/v1\/(?:live|reports\/quarterly\/[^/]+\/pdf)$/;

/** The largest request body the API reads. */
export const MAX_BODY_BYTES = 64 * 1024;

export function demoTokenMayCall(method: string, path: string): boolean {
  if (method === "GET" || method === "HEAD") return true;
  return DEMO_TOKEN_WRITES.some((rule) => rule.method === method && rule.path.test(path));
}

export function createApp(deps: AppDeps, env: NodeJS.ProcessEnv = process.env) {
  const app = new Hono<AppEnv>();
  const allowOrigin = originMatcher(env.WEB_ORIGIN ?? "http://localhost:3000");
  const demoToken = env.DEMO_API_TOKEN ?? "demo-token";

  app.use("*", cors({ origin: (origin) => (allowOrigin(origin) ? origin : null) }));
  // Live pushes are sent in the background; finish them before answering, because a serverless
  // function can be frozen as soon as it responds.
  app.use("*", async (_c, next) => {
    await next();
    await deps.live.flush();
  });
  // nosniff, frame protection, HSTS, no-referrer. The API serves JSON and one PDF, never pages.
  // The web app and the extension call this API from other origins, so that one policy is off.
  app.use("*", secureHeaders({ crossOriginResourcePolicy: false }));
  // Answers hold account data, so no shared cache may keep them.
  app.use("/v1/*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store");
  });
  // No request here needs more than a few kilobytes of JSON. Without a cap a 5 MB body was read
  // and stored (security review N1).
  app.use(
    "*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: { code: "body_too_large", message: "Request body is too large." } }, 413),
    }),
  );
  app.get("/health", (c) => c.json({ ok: true, llm: deps.llm.provider, live: deps.live.transport }));

  // Request limits (security review W4). Registered before the routes they guard, because Hono
  // runs handlers in registration order.
  const limiter = new RateLimiter();
  app.use("/auth/*", rateLimit(limiter, AUTH_RULES, deps.webProxySecret));

  // Sign-up, log-in, and the public key. No token needed.
  registerAuthRoutes(app, deps);

  // Two kinds of token. A FinVantage sign-in token maps to its `sub`. The shared demo token maps
  // to the demo user, and stays for signed-out visitors, the extension, and tests. EventSource
  // cannot set headers, so the SSE stream also accepts ?token=.
  app.use("/v1/*", async (c, next) => {
    // A token in the URL ends up in logs and history, so it is read only where a header can't be
    // sent: the SSE stream (EventSource) and the PDF download link.
    const fromQuery = c.req.method === "GET" && TOKEN_IN_URL.test(c.req.path) ? c.req.query("token") : undefined;
    const token = c.req.header("authorization")?.replace(/^Bearer /, "") ?? fromQuery;
    if (token && token === demoToken) {
      if (!demoTokenMayCall(c.req.method, c.req.path)) {
        return c.json(
          { error: { code: "demo_read_only", message: "The shared demo token is read-only. Start a demo session." } },
          403,
        );
      }
      c.set("userId", DEMO_USER_ID);
      return next();
    }
    const user = token ? await deps.auth.verify(token) : null;
    if (!user) {
      return c.json({ error: { code: "unauthorized", message: "Missing or bad token." } }, 401);
    }
    await ensureProfile(deps, user);
    c.set("userId", user.userId);
    await next();
  });

  // After the token check, so model routes can be counted per user.
  app.use("/v1/*", rateLimit(limiter, MODEL_RULES, deps.webProxySecret));
  app.use("/v1/*", rateLimit(limiter, COMPUTE_RULES, deps.webProxySecret));

  registerProfileRoutes(app, deps);
  registerAccountRoutes(app, deps);
  registerTransactionRoutes(app, deps);
  registerSpendingRoutes(app, deps);
  registerIncomeRoutes(app, deps);
  registerGoalRoutes(app, deps);
  registerLifeEventRoutes(app, deps);
  registerLifeSimulatorRoutes(app, deps);
  registerLifeScenarioRoutes(app, deps);
  registerSimulationRoutes(app, deps);
  registerCopilotRoutes(app, deps);
  registerAgentRoutes(app, deps);
  registerAdvisorRoutes(app, deps);
  registerMockedRoutes(app, deps);
  registerBankRoutes(app, deps);
  registerLiveRoutes(app, deps);

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    if (error instanceof NotImplementedError) {
      return c.json({ error: { code: "not_implemented", message: error.message } }, 501);
    }
    console.error(error);
    return c.json({ error: { code: "internal", message: "Something went wrong." } }, 500);
  });

  return app;
}
