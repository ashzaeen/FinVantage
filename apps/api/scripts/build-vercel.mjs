// Bundles the API into a Vercel Build Output API v3 directory (.vercel/output), with one Node
// function that serves every route. Vercel uses that directory as-is after `npm run build`.
// https://vercel.com/docs/build-output-api/v3
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, ".vercel/output");
const fn = join(output, "functions/index.func");

rmSync(output, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "src/vercel.ts")],
  outfile: join(fn, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "info",
  // Some dependencies are CommonJS and call require(). Give the ESM bundle one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

writeFileSync(
  join(fn, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
    },
    null,
    2,
  ),
);

writeFileSync(
  join(output, "config.json"),
  JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/index" }] }, null, 2),
);

console.log(`Vercel output written to ${output}`);
