import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { routes, type User } from "@finvantage/contracts";
import type { SignedInUser } from "../auth";
import { EmailTakenError, hashPassword, verifyPassword } from "../credentials";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";

/**
 * Makes sure a signed-in user has a profile in the ledger: on their first request ever, a copy
 * of the demo profile, renamed to them. Returns the profile when it had to look, or null when this
 * instance already knew the user exists.
 */
export async function ensureProfile(deps: AppDeps, user: SignedInUser): Promise<User | null> {
  // Once a user has a profile they keep it, so each instance checks the store only once per user.
  const known = knownUsers.get(deps) ?? new Set<string>();
  knownUsers.set(deps, known);
  if (known.has(user.userId)) return null;
  const existing = await deps.ledger.getUser(user.userId);
  if (existing) {
    known.add(user.userId);
    return existing;
  }
  await deps.ledger.loadDemoProfile(user.userId);
  const profile = await deps.ledger.getUser(user.userId);
  if (!profile) throw new Error(`Demo profile did not load for ${user.userId}.`);
  const saved = await deps.ledger.saveUser({
    ...profile,
    displayName: user.name ?? user.email ?? profile.displayName,
    email: user.email ?? profile.email,
  });
  known.add(user.userId);
  return saved;
}

const knownUsers = new WeakMap<AppDeps, Set<string>>();

/** The user's profile, creating it on first sign-in. */
async function profileOf(deps: AppDeps, user: SignedInUser): Promise<User> {
  const profile = (await ensureProfile(deps, user)) ?? (await deps.ledger.getUser(user.userId));
  if (!profile) throw new Error(`No profile for ${user.userId}.`);
  return profile;
}

const BAD_LOGIN = "Wrong email or password.";
// Checked against when the email is unknown, so both failures take about the same time.
let dummyHash: Promise<string> | null = null;

export function registerAuthRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.signUp, async ({ body }) => {
    const user: SignedInUser = { userId: `usr_${randomUUID()}`, name: body.displayName, email: body.email };
    try {
      await deps.credentials.register({
        email: body.email,
        userId: user.userId,
        passwordHash: await hashPassword(body.password),
      });
    } catch (error) {
      if (error instanceof EmailTakenError) throw new HttpError(409, "email_taken", error.message);
      throw error;
    }
    return { token: await deps.auth.issue(user), user: await profileOf(deps, user) };
  });

  mount(app, deps, routes.logIn, async ({ body }) => {
    const credential = await deps.credentials.findByEmail(body.email);
    if (!credential) {
      await verifyPassword(body.password, await (dummyHash ??= hashPassword("not-a-real-password")));
      throw new HttpError(401, "bad_login", BAD_LOGIN);
    }
    if (!(await verifyPassword(body.password, credential.passwordHash))) {
      throw new HttpError(401, "bad_login", BAD_LOGIN);
    }
    // The name lives in the ledger profile; the token carries it so a cold instance can rebuild it.
    const known = await deps.ledger.getUser(credential.userId);
    const user: SignedInUser = {
      userId: credential.userId,
      name: known?.displayName ?? null,
      email: credential.email,
    };
    return { token: await deps.auth.issue(user), user: await profileOf(deps, user) };
  });

  // OpenID discovery, so SpacetimeDB (and anyone else) can check our tokens with the public key.
  app.get("/.well-known/openid-configuration", (c) =>
    c.json({
      issuer: deps.auth.issuer,
      jwks_uri: `${deps.auth.issuer}/.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ["RS256"],
      subject_types_supported: ["public"],
      response_types_supported: ["id_token"],
    }),
  );
  app.get("/.well-known/jwks.json", async (c) => c.json(await deps.auth.jwks()));
}
