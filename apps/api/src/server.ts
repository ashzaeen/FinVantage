import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createDeps } from "./deps";

const port = Number(process.env.API_PORT ?? 4000);

serve({ fetch: createApp(createDeps()).fetch, port }, () => {
  console.log(`FinVantage API on http://localhost:${port}`);
});
