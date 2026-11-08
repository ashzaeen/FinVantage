import type { Hono } from "hono";
import type { z } from "zod";
import type { RouteDef } from "@finvantage/contracts";
import type { AppDeps } from "./deps";

export type AppEnv = { Variables: { userId: string } };

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 500 | 501 | 502,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Parsed<T> = [NonNullable<T>] extends [never]
  ? undefined
  : NonNullable<T> extends z.ZodType
    ? z.output<NonNullable<T>>
    : undefined;

export interface HandlerContext<R extends RouteDef> {
  userId: string;
  deps: AppDeps;
  params: Record<string, string>;
  body: Parsed<R["body"]>;
  query: Parsed<R["query"]>;
  /** The request's Authorization header, so a handler can call other routes as the same user. */
  authorization: string;
}

/**
 * Registers a contract route. Request bodies and queries are validated before the handler runs,
 * and the response is validated after, so a handler cannot silently drift from the contract.
 */
export function mount<R extends RouteDef<string, z.ZodType, any, any>>(
  app: Hono<AppEnv>,
  deps: AppDeps,
  route: R,
  handler: (ctx: HandlerContext<R>) => Promise<z.input<R["response"]>>,
): void {
  const method = route.method.toLowerCase() as "get" | "post" | "patch" | "delete";
  app[method](route.path, async (c) => {
    const parse = (schema: z.ZodType | undefined, value: unknown) => {
      if (!schema) return undefined;
      const result = schema.safeParse(value);
      if (!result.success) throw new HttpError(400, "invalid_request", result.error.message);
      return result.data;
    };

    const body = route.body ? parse(route.body, await c.req.json().catch(() => undefined)) : undefined;
    const query = parse(route.query, c.req.query());
    const result = await handler({
      userId: c.get("userId"),
      deps,
      params: c.req.param() as Record<string, string>,
      body: body as HandlerContext<R>["body"],
      query: query as HandlerContext<R>["query"],
      authorization: c.req.header("authorization") ?? "",
    });

    const checked = route.response.safeParse(result);
    if (!checked.success) {
      throw new HttpError(500, "contract_violation", `${route.path}: ${checked.error.message}`);
    }
    return c.json(checked.data as object);
  });
}
