import { Hono } from "hono";
import { cors } from "hono/cors";
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
  app.get("/health", (c) => c.json({ ok: true, llm: deps.llm.provider, live: deps.live.transport }));

  // Sign-up, log-in, and the public key. No token needed.
  registerAuthRoutes(app, deps);

  // Two kinds of token. A FinVantage sign-in token maps to its `sub`. The shared demo token maps
  // to the demo user, and stays for signed-out visitors, the extension, and tests. EventSource
  // cannot set headers, so the SSE stream also accepts ?token=.
  app.use("/v1/*", async (c, next) => {
    const token = c.req.header("authorization")?.replace(/^Bearer /, "") ?? c.req.query("token");
    if (token && token === demoToken) {
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
