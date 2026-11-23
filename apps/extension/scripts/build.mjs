import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// EXTENSION_OUT_DIR lets the web app package its own copy without touching the dev build.
const dist = process.env.EXTENSION_OUT_DIR ? resolve(process.env.EXTENSION_OUT_DIR) : join(root, "dist");
const watch = process.argv.includes("--watch");
const MOCK_PORT = 4100;

// One .env at the repo root serves every app.
const rootEnv = join(root, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const apiUrl = process.env.EXTENSION_API_URL ?? "http://localhost:4000";
// Dark mode is on for everyone, as in the dashboard. EXTENSION_DARK_MODE=0 builds without it.
const darkMode = process.env.EXTENSION_DARK_MODE !== "0";
// The popup is plain HTML, so the dark rules are spliced in at the marker, or dropped.
const POPUP_DARK = `@media (prefers-color-scheme: dark) {
        :root { color-scheme: dark; }
        body { background: #171a33; color: #e8eaf6; }
        p { color: #a6acca; }
        button { background: #101328; border-color: #373c66; color: #e8eaf6; }
        button:hover { border-color: #a29cff; }
        button:focus-visible { outline-color: #a29cff; }
        section { border-top-color: #262a4a; }
        .who { color: #e8eaf6; }
      }`;

mkdirSync(dist, { recursive: true });
// The service worker may only call hosts listed here, so the API origin it was built for is
// added automatically. Building against a deployed API then needs no manifest edit.
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const apiPermission = `${new URL(apiUrl).origin}/*`;
if (!manifest.host_permissions.includes(apiPermission)) manifest.host_permissions.push(apiPermission);
// The web app's origin too, only so chrome.cookies can read its sign-in cookie (SESSION_COOKIE).
const webPermission = `${new URL(process.env.EXTENSION_WEB_URL ?? "http://localhost:3000").origin}/*`;
if (!manifest.host_permissions.includes(webPermission)) manifest.host_permissions.push(webPermission);
writeFileSync(join(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}
`);
writeFileSync(join(dist, "popup.html"), readFileSync(join(root, "popup.html"), "utf8").replace("/* dark-mode */", darkMode ? POPUP_DARK : ""));

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
    __DARK_MODE__: JSON.stringify(darkMode),
  },
};

function serveMockPages() {
  const pages = join(root, "mock-pages");
  createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const file = normalize(join(pages, pathname === "/" ? "index.html" : pathname));
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
    const type = types[extname(file)];
    if (!file.startsWith(pages) || !type || !existsSync(file)) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": type });
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
