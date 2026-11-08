import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/** Who a valid sign-in token belongs to. `userId` is the token's `sub`. */
export interface SignedInUser {
  userId: string;
  name: string | null;
  email: string | null;
}

/** Returns the user for a valid token, or null for anything else (bad, expired, wrong app). */
export type TokenVerifier = (token: string) => Promise<SignedInUser | null>;

export const SPACETIMEAUTH_ISSUER = "https://auth.spacetimedb.com/oidc";

/**
 * Verifies SpacetimeAuth ID tokens: RS256, signed by the issuer's published keys, issued for
 * this app's client ID, and not expired.
 */
export function createTokenVerifier(options: {
  clientId: string;
  issuer?: string;
  keys?: JWTVerifyGetKey;
}): TokenVerifier {
  const issuer = options.issuer ?? SPACETIMEAUTH_ISSUER;
  const keys = options.keys ?? createRemoteJWKSet(new URL(`${issuer}/jwks`));
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience: options.clientId,
        algorithms: ["RS256"],
      });
      if (!payload.sub) return null;
      const text = (value: unknown) => (typeof value === "string" && value ? value : null);
      return {
        userId: payload.sub,
        name: text(payload.name) ?? text(payload.preferred_username),
        email: text(payload.email),
      };
    } catch {
      return null;
    }
  };
}

/** Used when SPACETIMEAUTH_CLIENT_ID is unset: only the demo token works. */
export const rejectAllTokens: TokenVerifier = async () => null;
