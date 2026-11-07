import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");
const MOCK_PORT = 4100;

// One .env at the repo root serves every app.
const rootEnv = join(root, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const apiUrl = process.env.EXTENSION_API_URL ?? "http://localhost:4000";

mkdirSync(dist, { recursive: true });
// The service worker may only call hosts listed here, so the API origin it was built for is
// added automatically. Building against a deployed API then needs no manifest edit.
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const apiPermission = `${new URL(apiUrl).origin}/*`;
if (!manifest.host_permissions.includes(apiPermission)) manifest.host_permissions.push(apiPermission);
writeFileSync(join(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}
`);
copyFileSync(join(root, "popup.html"), join(dist, "popup.html"));

const options = {
  entryPoints: {
    background: join(root, "src/background.ts"),
    content: join(root, "src/content/index.ts"),
    popup: join(root, "src/popup.ts"),
  },
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome120",
  logLevel: "info",
  define: {
    __API_URL__: JSON.stringify(apiUrl),
    __WEB_URL__: JSON.stringify(process.env.EXTENSION_WEB_URL ?? "http://localhost:3000"),
    __API_TOKEN__: JSON.stringify(process.env.EXTENSION_API_TOKEN ?? "demo-token"),
  },
};

function serveMockPages() {
  const pages = join(root, "mock-pages");
  createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const file = normalize(join(pages, pathname === "/" ? "index.html" : pathname));
    if (!file.startsWith(pages) || extname(file) !== ".html" || !existsSync(file)) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    createReadStream(file).pipe(res);
  }).listen(MOCK_PORT, () => console.log(`Mock pages on http://localhost:${MOCK_PORT}`));
}

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  serveMockPages();
} else {
  await esbuild.build(options);
}
