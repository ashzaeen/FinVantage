/**
 * Builds the Copilot Chrome extension and packages it as public/finvantage-copilot.zip, so anyone
 * can install it from the dashboard's Copilot tab (Load unpacked) without a copy of the repo.
 * Runs before `next build` and `next dev`, so the download always matches the current code and
 * points at the API and web app this dashboard was built for.
 *
 * A failure only skips the download: the dashboard still builds.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionBuild = resolve(web, "../extension/scripts/build.mjs");
const out = join(web, "public", "finvantage-copilot.zip");

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const target = {
  EXTENSION_API_URL: process.env.EXTENSION_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  EXTENSION_WEB_URL: process.env.EXTENSION_WEB_URL || (productionHost ? `https://${productionHost}` : "http://localhost:3000"),
  EXTENSION_API_TOKEN: process.env.EXTENSION_API_TOKEN || process.env.NEXT_PUBLIC_DEMO_TOKEN || "demo-token",
};

try {
  const dir = mkdtempSync(join(tmpdir(), "finvantage-copilot-"));
  execFileSync(process.execPath, [extensionBuild], { env: { ...process.env, ...target, EXTENSION_OUT_DIR: dir }, stdio: "pipe" });
  writeFileSync(out, zip(dir, "finvantage-copilot"));
  rmSync(dir, { recursive: true, force: true });
  console.log(`[extension] public/finvantage-copilot.zip: API ${target.EXTENSION_API_URL}, web ${target.EXTENSION_WEB_URL}`);
} catch (error) {
  console.warn(`[extension] Skipped the extension download: ${error instanceof Error ? error.message : error}`);
}

/** A plain zip (deflate) of every file under `dir`, inside a top-level folder `prefix`. */
function zip(dir, prefix) {
  const files = walk(dir).map((path) => ({ name: `${prefix}/${relative(dir, path).split("\\").join("/")}`, data: readFileSync(path) }));
  const local = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt32LE(0x00210000, 10); // 1980-01-01 00:00, so builds are byte-identical
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(0x00210000, 12);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + compressed.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

function walk(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
