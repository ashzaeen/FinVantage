import { getRequestListener } from "@hono/node-server";
import { createApp } from "./app";
import { createDeps } from "./deps";

/**
 * Entry for the Vercel deployment. `scripts/build-vercel.mjs` bundles this file into one
 * Node function, so the workspace packages (which export TypeScript source) need no build step.
 * Local dev keeps using `src/server.ts`.
 */
export default getRequestListener(createApp(createDeps()).fetch);
