import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { routes, type QuarterlyReport } from "@finvantage/contracts";
import { answerAdvisorChat, generateOptions, generateQuarterlyReport } from "@finvantage/llm";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import {
  buildQuarterlyEvidence,
  InsufficientQuarterDataError,
} from "../reporting/quarterly-report";
import {
  runDueEmailSchedules,
  triggerEmailSchedule,
  updateEmailSchedule,
} from "../reporting/email-scheduler";

type QuarterlyEvidence = Awaited<ReturnType<typeof buildQuarterlyEvidence>>;

async function persistReport(
  deps: AppDeps,
  userId: string,
  input: QuarterlyEvidence,
  previousReportId: string | null,
) {
  const generated = await generateQuarterlyReport(deps.llm, input);
  let saved = await deps.docs.saveReport({
    ...generated.body,
    id: randomUUID(),
    userId,
    quarter: input.quarter,
    previousQuarter: input.previousQuarter,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    evidence: input.evidence,
    largestChange: input.largestChange,
    sourceIds: input.sourceIds,
    narrativeSource: generated.source,
    visuals: input.visuals,
    pdf: { status: "pending", fileName: null, generatedAt: null },
    email: { status: "not_requested", sentAt: null, messageId: null, error: null },
    previousReportId,
    createdAt: deps.now(),
  });
  try {
    const pdf = await deps.pdf.generate(saved);
    saved = await deps.docs.updateReport({ ...saved, pdf: { status: "ready", ...pdf } });
  } catch {
    saved = await deps.docs.updateReport({
      ...saved,
      pdf: { status: "failed", fileName: null, generatedAt: null },
    });
  }
  return saved;
}

async function refreshReport(
  deps: AppDeps,
  existing: QuarterlyReport,
  input: QuarterlyEvidence,
  previousReportId: string | null,
) {
  const generated = await generateQuarterlyReport(deps.llm, input);
  let refreshed = await deps.docs.updateReport({
    ...existing,
    ...generated.body,
    previousQuarter: input.previousQuarter,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    evidence: input.evidence,
    largestChange: input.largestChange,
    sourceIds: input.sourceIds,
    narrativeSource: generated.source,
    visuals: input.visuals,
    previousReportId,
    pdf: { status: "pending", fileName: null, generatedAt: null },
    createdAt: deps.now(),
  });
  try {
    const pdf = await deps.pdf.generate(refreshed);
    refreshed = await deps.docs.updateReport({
      ...refreshed,
      pdf: { status: "ready", ...pdf },
    });
  } catch {
    refreshed = await deps.docs.updateReport({
      ...refreshed,
      pdf: { status: "failed", fileName: null, generatedAt: null },
    });
  }
  return refreshed;
}

async function ensureHistoricalReport(
  deps: AppDeps,
  userId: string,
  input: QuarterlyEvidence,
): Promise<QuarterlyReport> {
  const existing = await deps.docs.getReportByQuarter(userId, input.quarter);
  let previous: QuarterlyReport | null = null;
  if (input.previousQuarter) {
    try {
      const previousInput = await buildQuarterlyEvidence(deps, userId, input.previousQuarter);
      previous = await ensureHistoricalReport(deps, userId, previousInput);
    } catch (error) {
      if (!(error instanceof InsufficientQuarterDataError)) throw error;
    }
  }
  if (existing) {
    return existing.previousReportId === (previous?.id ?? null)
      ? existing
      : deps.docs.updateReport({ ...existing, previousReportId: previous?.id ?? null });
  }
  return persistReport(deps, userId, input, previous?.id ?? null);
}

async function emailReport(
  deps: AppDeps,
  userId: string,
  reportId: string,
  recipientOverride?: string,
) {
  const report = await deps.docs.getReport(userId, reportId);
  if (!report) throw new HttpError(404, "not_found", "Quarterly report not found.");
  if (report.pdf.status !== "ready") {
    throw new HttpError(409, "pdf_not_ready", "The report PDF is not ready.");
  }
  const user = await deps.ledger.getUser(userId);
  const to = recipientOverride ?? deps.reportEmailOverride ?? user?.email ?? null;
  if (!to) {
    const updated = {
      ...report,
      email: {
        status: "failed" as const,
        sentAt: null,
        messageId: null,
        error: "No report email address is configured.",
      },
    };
    return deps.docs.updateReport(updated);
  }
  try {
    const sent = await deps.mail.sendReport({ to, report, pdf: await deps.pdf.read(report) });
    return deps.docs.updateReport({
      ...report,
      email: { status: "sent", sentAt: deps.now(), messageId: sent.messageId, error: null },
    });
  } catch (error) {
    return deps.docs.updateReport({
      ...report,
      email: {
        status: "failed",
        sentAt: null,
        messageId: null,
        error: error instanceof Error ? error.message : "Email delivery failed.",
      },
    });
  }
}

export function registerAgentRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.advisorChat, async ({ userId, body }) => {
    const [accounts, goals, transactions, lifeEvents, runs] = await Promise.all([
      deps.ledger.listAccounts(userId),
      deps.ledger.listGoals(userId),
      deps.ledger.listTransactions(userId, 30),
      deps.docs.listLifeEvents(userId),
      deps.docs.listSimulationRuns(userId),
    ]);
    const context = JSON.stringify({
      accounts: accounts.map(({ type, name, balanceCents, annualRate, minimumPaymentCents }) => ({ type, name, balanceCents, annualRate, minimumPaymentCents })),
      goals: goals.map(({ name, targetCents, currentCents, targetDate, flexibility }) => ({ name, targetCents, currentCents, targetDate, flexibility })),
      recentTransactions: transactions.slice(0, 20).map(({ date, amountCents, merchant, category }) => ({ date, amountCents, merchant, category })),
      lifeEvents: lifeEvents.slice(0, 10).map(({ type, date, dollarImpactCents, recurrence }) => ({ type, date, dollarImpactCents, recurrence })),
      latestSimulation: runs[0] ? { createdAt: runs[0].createdAt, goalOutcomes: runs[0].goalOutcomes } : null,
      note: "All currency values ending in Cents are integer cents.",
    });
    return answerAdvisorChat(deps.llm, body.messages, context);
  });

  mount(app, deps, routes.getAdvice, async ({ userId, body }) => {
    const [goals, runs] = await Promise.all([
      deps.ledger.listGoals(userId),
      deps.docs.listSimulationRuns(userId),
    ]);
    const options = await generateOptions(deps.llm, {
      situation: body.situation,
      goals,
      latestRunId: runs[0]?.id ?? null,
    });
    return deps.docs.saveRecommendation({
      id: randomUUID(),
      userId,
      situation: body.situation,
      options,
      createdAt: deps.now(),
    });
  });

  mount(app, deps, routes.listReports, ({ userId }) => deps.docs.listReports(userId));

  mount(app, deps, routes.getLatestReport, async ({ userId }) => {
    const [latest] = await deps.docs.listReports(userId);
    return latest ?? null;
  });

  mount(app, deps, routes.getReport, async ({ userId, params }) => {
    const report = await deps.docs.getReport(userId, params.id ?? "");
    if (!report) throw new HttpError(404, "not_found", "Quarterly report not found.");
    return report;
  });

  mount(app, deps, routes.generateReport, async ({ userId, body }) => {
    let input;
    try {
      input = await buildQuarterlyEvidence(deps, userId, body.quarter, { fallbackRun: true });
    } catch (error) {
      if (error instanceof InsufficientQuarterDataError) {
        throw new HttpError(409, "insufficient_quarter_data", error.message);
      }
      throw error;
    }
    let previous: QuarterlyReport | null = null;
    if (input.previousQuarter) {
      try {
        const previousInput = await buildQuarterlyEvidence(deps, userId, input.previousQuarter);
        previous = await ensureHistoricalReport(deps, userId, previousInput);
      } catch (error) {
        if (!(error instanceof InsufficientQuarterDataError)) throw error;
      }
    }
    const existing = await deps.docs.getReportByQuarter(userId, input.quarter);
    if (existing) {
      const refreshed = await refreshReport(deps, existing, input, previous?.id ?? null);
      return body.email && refreshed.email.status !== "sent"
        ? emailReport(deps, userId, refreshed.id)
        : refreshed;
    }
    const saved = await persistReport(deps, userId, input, previous?.id ?? null);
    return body.email && saved.pdf.status === "ready"
      ? emailReport(deps, userId, saved.id)
      : saved;
  });

  mount(app, deps, routes.emailReport, ({ userId, params, body }) =>
    emailReport(deps, userId, params.id ?? "", body?.to),
  );

  mount(app, deps, routes.getEmailSchedule, ({ userId }) =>
    deps.docs.getEmailSchedule(userId),
  );

  mount(app, deps, routes.updateEmailSchedule, ({ userId, body }) =>
    updateEmailSchedule(deps, userId, body),
  );

  mount(app, deps, routes.listEmailScheduleLogs, ({ userId }) =>
    deps.docs.listEmailScheduleLogs(userId),
  );

  mount(app, deps, routes.triggerScheduledEmail, ({ userId }) =>
    triggerEmailSchedule(deps, userId, (scheduledUserId, reportId, recipientEmail) =>
      emailReport(deps, scheduledUserId, reportId, recipientEmail),
    ),
  );

  app.post("/internal/reports/schedule/run", async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer /, "");
    if (!deps.schedulerSecret || token !== deps.schedulerSecret) {
      return c.json({ error: { code: "unauthorized", message: "Missing or bad scheduler token." } }, 401);
    }
    const result = await runDueEmailSchedules(
      deps,
      (scheduledUserId, reportId, recipientEmail) =>
        emailReport(deps, scheduledUserId, reportId, recipientEmail),
    );
    return c.json(result);
  });

  // Binary download is the one report route outside the JSON contract table.
  app.get("/v1/reports/quarterly/:id/pdf", async (c) => {
    const userId = c.get("userId");
    const report = await deps.docs.getReport(userId, c.req.param("id"));
    if (!report) throw new HttpError(404, "not_found", "Quarterly report not found.");
    if (report.pdf.status !== "ready" || !report.pdf.fileName) {
      throw new HttpError(409, "pdf_not_ready", "The report PDF is not ready.");
    }
    const pdf = await deps.pdf.read(report);
    c.header("content-type", "application/pdf");
    c.header("content-disposition", `attachment; filename="${report.pdf.fileName}"`);
    return c.body(new Uint8Array(pdf));
  });
}
