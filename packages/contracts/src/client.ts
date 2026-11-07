import type { z } from "zod";
import { ApiErrorBody, routes, type RouteDef } from "./api";

type PathParams<P extends string> = P extends `${string}:${infer K}/${infer Rest}`
  ? K | PathParams<`/${Rest}`>
  : P extends `${string}:${infer K}`
    ? K
    : never;

type Input<R> =
  R extends RouteDef<infer P, z.ZodType, infer B, infer Q>
    ? ([PathParams<P>] extends [never] ? {} : { params: Record<PathParams<P>, string> }) &
        (B extends z.ZodType ? { body: z.input<B> } : {}) &
        (Q extends z.ZodType ? { query?: z.input<Q> } : {})
    : never;

type Output<R> = R extends RouteDef<string, infer Res> ? z.output<Res> : never;

export type ApiClient = {
  [K in keyof typeof routes]: {} extends Input<(typeof routes)[K]>
    ? (input?: Input<(typeof routes)[K]>) => Promise<Output<(typeof routes)[K]>>
    : (input: Input<(typeof routes)[K]>) => Promise<Output<(typeof routes)[K]>>;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiClientConfig {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
}

/** Typed client used by the web app and the extension. Responses are validated against contracts. */
export function createApiClient(config: ApiClientConfig): ApiClient {
  const doFetch = config.fetch ?? fetch;

  const call = async (def: RouteDef, input: Record<string, unknown> = {}) => {
    const params = (input.params ?? {}) as Record<string, string>;
    const path = def.path.replace(/:(\w+)/g, (_, key: string) =>
      encodeURIComponent(params[key] ?? ""),
    );
    const query = new URLSearchParams(input.query as Record<string, string> | undefined);
    const qs = query.size > 0 ? `?${query}` : "";

    const res = await doFetch(`${config.baseUrl}${path}${qs}`, {
      method: def.method,
      headers: {
        authorization: `Bearer ${config.token}`,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const parsed = ApiErrorBody.safeParse(json);
      throw new ApiError(
        res.status,
        parsed.success ? parsed.data.error.code : "unknown",
        parsed.success ? parsed.data.error.message : `Request failed: ${res.status}`,
      );
    }
    return def.response.parse(json);
  };

  const entries = Object.entries(routes).map(([name, def]) => [
    name,
    (input?: Record<string, unknown>) => call(def as RouteDef, input),
  ]);
  return Object.fromEntries(entries) as ApiClient;
}
