/**
 * Checks that each configured database answers, for `GET /health`. A store that runs in memory has
 * no check, so local development and tests report no stores.
 */
export interface HealthCheck {
  name: string;
  check: () => Promise<void>;
}

export interface HealthReport {
  ok: boolean;
  /** Only "ok" or "down": error details stay in the server log, never in the public response. */
  stores: Record<string, "ok" | "down">;
}

export async function runHealthChecks(
  checks: readonly HealthCheck[],
  options: { timeoutMs?: number; onError?: (name: string, error: unknown) => void } = {},
): Promise<HealthReport> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const results = await Promise.all(
    checks.map(async ({ name, check }): Promise<[string, "ok" | "down"]> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          check(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
          }),
        ]);
        return [name, "ok"];
      } catch (error) {
        options.onError?.(name, error);
        return [name, "down"];
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return { ok: results.every(([, status]) => status === "ok"), stores: Object.fromEntries(results) };
}
