import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApiClient } from "@finvantage/contracts";
import { createApp } from "../app";
import { createDeps } from "../deps";

test("a report PDF still downloads after the local file is gone (another server instance)", async () => {
  const outputDir = path.join(tmpdir(), `finvantage-pdf-test-${Date.now()}`);
  const deps = createDeps({ REPORT_OUTPUT_DIR: outputDir });
  const app = createApp(deps, {});
  const client = createApiClient({
    baseUrl: "http://test",
    token: "demo-token",
    fetch: ((url: string, init: RequestInit) => app.request(url, init)) as typeof fetch,
  });

  const run = await client.runSimulation({ body: { persist: false, seed: 3 } });
  await deps.docs.saveSimulationRun({ ...run, id: "run_q3", createdAt: "2026-08-15T12:00:00.000Z", persisted: true });
  const report = await client.generateReport({ body: { quarter: "2026-Q3", email: false } });
  assert.equal(report.pdf.status, "ready");

  // Simulate a different instance: its /tmp has no copy of the file.
  await rm(outputDir, { recursive: true, force: true });

  const res = await app.request(`/v1/reports/quarterly/${report.id}/pdf?token=demo-token`);
  assert.equal(res.status, 200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
  assert.ok(await deps.docs.getReportPdf(report.userId, report.id));
});
