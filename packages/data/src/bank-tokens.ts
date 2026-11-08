/**
 * Plaid access tokens, one per linked bank. They grant ongoing read access to a user's bank, so
 * they never leave the server: not in API responses, not in logs. In Spacetime they are
 * encrypted with AES-256-GCM before they are stored, with a key (PLAID_TOKEN_KEY) that only the
 * API has. The bank_item_secret table is private and only the API's admin identity reads it.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SpacetimeHttp, sqlString, type SpacetimeConfig } from "./spacetime/client";

export interface BankTokenStore {
  save(userId: string, itemId: string, accessToken: string): Promise<void>;
  /** Null if the user has no such item. */
  get(userId: string, itemId: string): Promise<string | null>;
  remove(userId: string, itemId: string): Promise<void>;
}

export class MemoryBankTokenStore implements BankTokenStore {
  private tokens = new Map<string, { userId: string; accessToken: string }>();

  async save(userId: string, itemId: string, accessToken: string) {
    this.tokens.set(itemId, { userId, accessToken });
  }

  async get(userId: string, itemId: string) {
    const row = this.tokens.get(itemId);
    return row && row.userId === userId ? row.accessToken : null;
  }

  async remove(userId: string, itemId: string) {
    if (this.tokens.get(itemId)?.userId === userId) this.tokens.delete(itemId);
  }
}

/** base64(iv | tag | ciphertext). The item ID is bound in as associated data. */
export function encryptToken(key: Buffer, itemId: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(itemId));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptToken(key: Buffer, itemId: string, encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(itemId));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export function parseTokenKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("PLAID_TOKEN_KEY must be 32 bytes, base64-encoded.");
  return key;
}

export class SpacetimeBankTokenStore implements BankTokenStore {
  private readonly db: SpacetimeHttp;

  constructor(
    config: SpacetimeConfig,
    private readonly key: Buffer,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.db = new SpacetimeHttp(config, fetchImpl);
  }

  async save(userId: string, itemId: string, accessToken: string) {
    await this.db.call("save_bank_item_secret", [itemId, userId, encryptToken(this.key, itemId, accessToken)]);
  }

  async get(userId: string, itemId: string) {
    const [row] = await this.db.sql<{ accessTokenCiphertext: string }>(
      `SELECT access_token_ciphertext FROM bank_item_secret WHERE item_id = ${sqlString(itemId)} AND user_id = ${sqlString(userId)}`,
    );
    return row ? decryptToken(this.key, itemId, row.accessTokenCiphertext) : null;
  }

  /** The remove_bank_item reducer already deletes the secret with the item. */
  async remove() {}
}
