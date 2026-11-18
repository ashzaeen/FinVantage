/**
 * Exports both databases into one gzipped JSON file. The nightly workflow encrypts it.
 *
 *   MONGODB_URI=... SPACETIME_TOKEN=... node infra/backup/backup.mjs backup.json.gz
 *
 * MongoDB documents are stored as canonical Extended JSON, so binary PDFs and dates come back
 * exactly (restore-mongo.mjs). SpacetimeDB tables are stored as each table's schema and rows, as
 * its SQL endpoint returns them. Every table the module defines is included, read from its schema.
 * Optional: MONGODB_DB (default finvantage), SPACETIME_URL, SPACETIME_MODULE.
 */
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { BSON, MongoClient } from "mongodb";

const out = process.argv[2];
const { MONGODB_URI, SPACETIME_TOKEN } = process.env;
if (!out || !MONGODB_URI || !SPACETIME_TOKEN) {
  console.error("Usage: MONGODB_URI=... SPACETIME_TOKEN=... node infra/backup/backup.mjs <out.json.gz>");
  process.exit(2);
}
const dbName = process.env.MONGODB_DB || "finvantage";
const spacetimeUrl = (process.env.SPACETIME_URL || "https://maincloud.spacetimedb.com").replace(/\/$/, "");
const spacetimeDb = process.env.SPACETIME_MODULE || "finvantage";

async function exportMongo() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
  try {
    await client.connect();
    const db = client.db(dbName);
    const collections = {};
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      const docs = await db.collection(name).find({}).toArray();
      collections[name] = BSON.EJSON.serialize(docs, { relaxed: false });
      console.log(`mongodb ${name}: ${docs.length}`);
    }
    return { database: dbName, collections };
  } finally {
    await client.close();
  }
}

async function spacetime(path, init = {}) {
  const response = await fetch(`${spacetimeUrl}/v1/database/${encodeURIComponent(spacetimeDb)}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${SPACETIME_TOKEN}`, ...init.headers },
    signal: AbortSignal.timeout(60_000),
  });
  // The token travels in a header, so it never appears in this message.
  if (!response.ok) throw new Error(`SpacetimeDB ${path.split("?")[0]} answered ${response.status}`);
  return response.json();
}

async function exportSpacetime() {
  const schema = await spacetime("/schema?version=9");
  const tables = {};
  for (const { name } of schema.tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected table name: ${name}`);
    const [result] = await spacetime("/sql", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: `SELECT * FROM ${name}`,
    });
    tables[name] = { schema: result.schema, rows: result.rows };
    console.log(`spacetime ${name}: ${result.rows.length}`);
  }
  return { database: spacetimeDb, tables };
}

const backup = {
  format: "finvantage-backup/1",
  createdAt: new Date().toISOString(),
  mongodb: await exportMongo(),
  spacetime: await exportSpacetime(),
};
await pipeline(Readable.from([JSON.stringify(backup)]), createGzip(), createWriteStream(out));
console.log(`Wrote ${out}`);
