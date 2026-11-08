import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

/** Stored as `scrypt$<salt>$<hash>`, both base64. A fresh salt per password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface Credential {
  /** Lowercased. */
  email: string;
  userId: string;
  passwordHash: string;
}

export class EmailTakenError extends Error {
  constructor() {
    super("That email is already registered.");
  }
}

/** Where sign-in accounts live. Spacetime in production, memory locally and in tests. */
export interface CredentialStore {
  /** Throws EmailTakenError if the email already has an account. */
  register(credential: Credential): Promise<void>;
  findByEmail(email: string): Promise<Credential | null>;
}

export class MemoryCredentialStore implements CredentialStore {
  private byEmail = new Map<string, Credential>();

  async register(credential: Credential) {
    if (this.byEmail.has(credential.email)) throw new EmailTakenError();
    this.byEmail.set(credential.email, credential);
  }

  async findByEmail(email: string) {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }
}

/**
 * The `credential` table in the Spacetime module, over its HTTP API. Writes go through the
 * admin-only `register_credential` reducer. Reads use SQL with the owner token, which can see
 * private tables.
 */
export class SpacetimeCredentialStore implements CredentialStore {
  constructor(
    private readonly config: { url: string; database: string; token: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private endpoint(path: string) {
    return `${this.config.url.replace(/\/$/, "")}/v1/database/${encodeURIComponent(this.config.database)}${path}`;
  }

  private headers(contentType: string) {
    return { authorization: `Bearer ${this.config.token}`, "content-type": contentType };
  }

  async register(credential: Credential) {
    const res = await this.fetchImpl(this.endpoint("/call/register_credential"), {
      method: "POST",
      headers: this.headers("application/json"),
      body: JSON.stringify([credential.email, credential.userId, credential.passwordHash]),
    });
    if (res.ok) return;
    const text = await res.text();
    if (text.includes("email_taken")) throw new EmailTakenError();
    throw new Error(`Spacetime register_credential failed: ${res.status} ${text.slice(0, 200)}`);
  }

  async findByEmail(email: string) {
    // The email was validated by the contract. Escape quotes anyway, since this is raw SQL.
    const literal = email.toLowerCase().replace(/'/g, "''");
    const res = await this.fetchImpl(this.endpoint("/sql"), {
      method: "POST",
      headers: this.headers("text/plain"),
      body: `SELECT email, user_id, password_hash FROM credential WHERE email = '${literal}'`,
    });
    if (!res.ok) throw new Error(`Spacetime SQL failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const [result] = (await res.json()) as Array<{ rows: unknown[][] }>;
    const row = result?.rows?.[0];
    if (!row) return null;
    const [rowEmail, userId, passwordHash] = row;
    if (typeof rowEmail !== "string" || typeof userId !== "string" || typeof passwordHash !== "string") {
      throw new Error("Spacetime returned an unexpected credential row.");
    }
    return { email: rowEmail, userId, passwordHash };
  }
}
