import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWK,
} from "jose";

/** Who a valid sign-in token belongs to. `userId` is the token's `sub`. */
export interface SignedInUser {
  userId: string;
  name: string | null;
  email: string | null;
}

/**
 * FinVantage is its own token issuer: email + password sign-in, RS256 JWTs. The public key is
 * published at /.well-known/jwks.json in the OpenID format, so SpacetimeDB can accept the same
 * tokens for live subscriptions.
 */
export interface Auth {
  readonly issuer: string;
  readonly audience: string;
  issue(user: SignedInUser): Promise<string>;
  /** The user for a valid token, or null for anything else (bad, expired, another issuer). */
  verify(token: string): Promise<SignedInUser | null>;
  /** Public keys, for /.well-known/jwks.json. */
  jwks(): Promise<{ keys: JWK[] }>;
}

export const DEFAULT_ISSUER = "https://finvantage-api.vercel.app";
export const AUDIENCE = "finvantage";
const TOKEN_LIFETIME = "7d";

export function createAuth(options: {
  /** A private RSA JWK as JSON. Omit to generate a throwaway key (local dev and tests only). */
  privateJwk?: string;
  issuer?: string;
}): Auth {
  const issuer = (options.issuer ?? DEFAULT_ISSUER).replace(/\/$/, "");
  // Keys load on first use, so createDeps can stay synchronous.
  let keys: Promise<{ privateKey: CryptoKey; publicKey: CryptoKey; publicJwk: JWK; kid: string }> | null = null;
  const loadKeys = () => (keys ??= loadKeyPair(options.privateJwk));

  return {
    issuer,
    audience: AUDIENCE,
    issue: async (user) => {
      const { privateKey, kid } = await loadKeys();
      return new SignJWT({ name: user.name ?? undefined, email: user.email ?? undefined })
        .setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
        .setIssuer(issuer)
        .setAudience(AUDIENCE)
        .setSubject(user.userId)
        .setIssuedAt()
        .setExpirationTime(TOKEN_LIFETIME)
        .sign(privateKey);
    },
    verify: async (token) => {
      try {
        const { payload } = await jwtVerify(token, (await loadKeys()).publicKey, {
          issuer,
          audience: AUDIENCE,
          algorithms: ["RS256"],
        });
        if (!payload.sub) return null;
        const text = (value: unknown) => (typeof value === "string" && value ? value : null);
        return { userId: payload.sub, name: text(payload.name), email: text(payload.email) };
      } catch {
        return null;
      }
    },
    jwks: async () => ({ keys: [(await loadKeys()).publicJwk] }),
  };
}

async function loadKeyPair(privateJwk: string | undefined) {
  let privateKey: CryptoKey;
  let source: JWK;
  if (privateJwk) {
    source = JSON.parse(privateJwk) as JWK;
    privateKey = (await importJWK({ ...source, alg: "RS256" }, "RS256")) as CryptoKey;
  } else {
    const pair = await generateKeyPair("RS256", { extractable: true });
    privateKey = pair.privateKey;
    source = await exportJWK(pair.publicKey);
  }
  // Only the public parts (n, e) are ever published. The key id is the key's own thumbprint, so a
  // new key gets a new id and verifiers that cache keys (SpacetimeDB does) know to fetch it.
  const kid = await calculateJwkThumbprint({ kty: "RSA", n: source.n!, e: source.e! });
  const publicJwk: JWK = { kty: "RSA", n: source.n, e: source.e, kid, alg: "RS256", use: "sig" };
  const publicKey = (await importJWK(publicJwk, "RS256")) as CryptoKey;
  return { privateKey, publicKey, publicJwk, kid };
}
