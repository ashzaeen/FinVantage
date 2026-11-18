/**
 * Restores the MongoDB part of a backup into a database. Decrypt the artifact first:
 *
 *   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in finvantage-backup-DATE.json.gz.enc -out backup.json.gz
 *   MONGODB_URI=... node infra/backup/restore-mongo.mjs backup.json.gz
 *
 * openssl asks for BACKUP_PASSPHRASE. The restore refuses to touch a collection that already has
 * documents, unless you pass --replace, which empties each collection in the backup first.
 * SpacetimeDB data is restored by hand: see infra/README.md.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { BSON, MongoClient } from "mongodb";

const file = process.argv[2];
const replace = process.argv.includes("--replace");
if (!file || !process.env.MONGODB_URI) {
  console.error("Usage: MONGODB_URI=... node infra/backup/restore-mongo.mjs <backup.json.gz> [--replace]");
  process.exit(2);
}
const backup = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
if (backup.format !== "finvantage-backup/1") throw new Error(`Unknown backup format: ${backup.format}`);

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || backup.mongodb.database);
  const collections = Object.entries(backup.mongodb.collections);
  for (const [name] of collections) {
    const existing = await db.collection(name).estimatedDocumentCount();
    if (existing > 0 && !replace) {
      throw new Error(`${name} already has ${existing} documents. Pass --replace to empty it first.`);
    }
  }
  for (const [name, serialized] of collections) {
    const docs = BSON.EJSON.deserialize(serialized, { relaxed: false });
    if (replace) await db.collection(name).deleteMany({});
    if (docs.length > 0) await db.collection(name).insertMany(docs);
    console.log(`${name}: restored ${docs.length}`);
  }
  console.log(`Restored into ${db.databaseName}, from the backup made ${backup.createdAt}.`);
} finally {
  await client.close();
}
