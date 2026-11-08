// Bundles the API into a Vercel Build Output API v3 directory (.vercel/output), with one Node
// function that serves every route. Vercel uses that directory as-is after `npm run build`.
// https://vercel.com/docs/build-output-api/v3
import { copyFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
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
  // Some dependencies are CommonJS and call require() or read files from __dirname (pdfkit's
  // built-in fonts). Give the ESM bundle both, pointing at the function directory.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { dirname as __pathDirname } from 'node:path';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "const require = __createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __pathDirname(__filename);",
    ].join(" "),
  },
});

// Files the bundle reads from disk at runtime. Vercel ships only the function directory, so copy
// them in. Without these the API crashes on startup (fonts are resolved at module load).
const requireFromApi = createRequire(join(root, "package.json"));
const pdfkitDir = dirname(requireFromApi.resolve("pdfkit/package.json"));
cpSync(join(pdfkitDir, "js/data"), join(fn, "data"), { recursive: true });

const fontDir = dirname(requireFromApi.resolve("@fontsource/poppins/package.json"));
const fontOut = join(fn, "node_modules/@fontsource/poppins");
mkdirSync(join(fontOut, "files"), { recursive: true });
copyFileSync(join(fontDir, "package.json"), join(fontOut, "package.json"));
for (const weight of [400, 500, 700]) {
  const file = `files/poppins-latin-${weight}-normal.woff`;
  copyFileSync(join(fontDir, file), join(fontOut, file));
}

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
