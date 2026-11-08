/**
 * A small client for SpacetimeDB's HTTP API: one SQL statement per request (the endpoint rejects
 * several), and reducer calls. Serverless functions can't hold the SDK's WebSocket open between
 * requests, so the API uses this; browsers use the SDK (Sprint 5).
 *
 * SQL rows come back as SATS-JSON arrays in column order: options are [0, value] (some) or
 * [1, []] (none), nested objects are arrays, timestamps are [micros]. `sql` decodes them with the
 * column types into plain camelCase objects, with null for none.
 */

export interface SpacetimeConfig {
  /** For example https://maincloud.spacetimedb.com. */
  url: string;
  database: string;
  /** An admin identity's token. */
  token: string;
}

export class SpacetimeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type AlgebraicType = Record<string, unknown>;
interface Element {
  name: { some?: string };
  algebraic_type: AlgebraicType;
}

const camel = (name: string) => name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Decodes one SATS-JSON value using its column type. */
export function decodeSats(type: AlgebraicType, value: unknown): unknown {
  const [kind] = Object.keys(type);
  const inner = type[kind!];
  if (kind === "Array") return (value as unknown[]).map((v) => decodeSats(inner as AlgebraicType, v));
  if (kind === "Product") {
    const elements = (inner as { elements: Element[] }).elements;
    const values = value as unknown[];
    // Timestamps and durations are one-field products: return the number.
    if (elements.length === 1 && elements[0]!.name.some?.startsWith("__")) return values[0];
    return Object.fromEntries(
      elements.map((e, i) => [camel(e.name.some ?? String(i)), decodeSats(e.algebraic_type, values[i])]),
    );
  }
  if (kind === "Sum") {
    const variants = (inner as { variants: Element[] }).variants;
    const [tag, payload] = value as [number, unknown];
    const variant = variants[tag]!;
    const name = variant.name.some;
    if (name === "none") return null;
    if (name === "some") return decodeSats(variant.algebraic_type, payload);
    return { tag: name, value: decodeSats(variant.algebraic_type, payload) };
  }
  return value;
}

/** A SQL string literal. Single quotes are doubled, so any value is safe to embed. */
export const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

export class SpacetimeHttp {
  constructor(
    private readonly config: SpacetimeConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private endpoint(path: string) {
    return `${this.config.url.replace(/\/$/, "")}/v1/database/${encodeURIComponent(this.config.database)}${path}`;
  }

  /** Runs one SQL statement and returns its rows as camelCase objects. */
  async sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
    const res = await this.fetchImpl(this.endpoint("/sql"), {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.token}`, "content-type": "text/plain" },
      body: query,
    });
    if (!res.ok) throw new SpacetimeError(`Spacetime SQL failed: ${res.status} ${(await res.text()).slice(0, 300)}`, res.status);
    const [result] = (await res.json()) as Array<{ schema: { elements: Element[] }; rows: unknown[][] }>;
    if (!result) return [];
    const product: AlgebraicType = { Product: { elements: result.schema.elements } };
    return result.rows.map((row) => decodeSats(product, row) as T);
  }

  /** Calls a reducer. `args` are positional and already in wire format (see toWire). */
  async call(reducer: string, args: unknown[]): Promise<void> {
    const res = await this.fetchImpl(this.endpoint(`/call/${encodeURIComponent(reducer)}`), {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new SpacetimeError(`Spacetime ${reducer} failed: ${res.status} ${(await res.text()).slice(0, 300)}`, res.status);
  }
}
