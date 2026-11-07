import { Hono } from "hono";
import { cors } from "hono/cors";
import { DEMO_USER_ID, NotImplementedError } from "@finvantage/data";
import type { AppDeps } from "./deps";
import { HttpError, type AppEnv } from "./mount";
import { registerAccountRoutes } from "./routes/accounts";
import { registerAgentRoutes } from "./routes/agents";
import { registerBankRoutes } from "./routes/bank";
import { registerCopilotRoutes } from "./routes/copilot";
import { registerGoalRoutes } from "./routes/goals";
import { registerLifeEventRoutes } from "./routes/life-events";
import { registerLiveRoutes } from "./routes/live";
import { registerMockedRoutes } from "./routes/mocked";
import { registerProfileRoutes } from "./routes/profile";
import { registerSimulationRoutes } from "./routes/simulations";
import { registerTransactionRoutes } from "./routes/transactions";

export function createApp(deps: AppDeps, env: NodeJS.ProcessEnv = process.env) {
  const app = new Hono<AppEnv>();
  const webOrigin = env.WEB_ORIGIN ?? "http://localhost:3000";
  const demoToken = env.DEMO_API_TOKEN ?? "demo-token";

  app.use("*", cors({ origin: webOrigin }));
  app.get("/health", (c) => c.json({ ok: true, llm: deps.llm.provider, live: deps.live.transport }));

  // STUB(platform): one shared demo token maps to the demo user. EventSource cannot set headers,
  // so the SSE stream also accepts ?token=. Replace with real auth if time allows.
  app.use("/v1/*", async (c, next) => {
    const header = c.req.header("authorization")?.replace(/^Bearer /, "");
    if ((header ?? c.req.query("token")) !== demoToken) {
      return c.json({ error: { code: "unauthorized", message: "Missing or bad token." } }, 401);
    }
    c.set("userId", DEMO_USER_ID);
    await next();
  });

  registerProfileRoutes(app, deps);
  registerAccountRoutes(app, deps);
  registerTransactionRoutes(app, deps);
  registerGoalRoutes(app, deps);
  registerLifeEventRoutes(app, deps);
  registerSimulationRoutes(app, deps);
  registerCopilotRoutes(app, deps);
  registerAgentRoutes(app, deps);
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
