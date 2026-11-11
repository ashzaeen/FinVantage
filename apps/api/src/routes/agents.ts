import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { routes, type QuarterlyReport } from "@finvantage/contracts";
import { generateQuarterlyReport } from "@finvantage/llm";
import { DEMO_USER_ID } from "@finvantage/data";
import { GUEST_PREFIX } from "../auth";
import { RateLimiter, sameSecret } from "../rate-limit";
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

/**
 * The shared demo user and guests are demo copies, not accounts, so they can't email reports: their
 * address is the demo persona's, and anyone can get one (same rule as linking a bank).
 */
function canEmailReports(userId: string): boolean {
  return userId !== DEMO_USER_ID && !userId.startsWith(GUEST_PREFIX);
}

/**
 * Where a user's reports go, decided by the server: the operator's REPORT_EMAIL_OVERRIDE if set,
 * else the account's own address. A request used to name any address and win over both, so anyone
 * with a token could make FinVantage email a report, with text they wrote into it, to anyone
 * (security review W3).
 */
async function reportRecipient(deps: AppDeps, userId: string): Promise<string | null> {
  if (!canEmailReports(userId)) return null;
  return deps.reportEmailOverride ?? (await deps.ledger.getUser(userId))?.email ?? null;
}

/** For routes where the client names a recipient: it must be the one the server would choose. */
async function requireAllowedRecipient(deps: AppDeps, userId: string, requested: string | undefined) {
  if (!canEmailReports(userId)) throw new HttpError(403, "sign_in_required", "Sign in to email reports.");
  if (requested === undefined) return;
  const allowed = await reportRecipient(deps, userId);
  if (!allowed || requested.trim().toLowerCase() !== allowed.trim().toLowerCase()) {
    throw new HttpError(403, "recipient_not_allowed", "Reports can only be emailed to your account's address.");
  }
}

export const REPORT_EMAILS_PER_HOUR = 5;
const emailLimiters = new WeakMap<AppDeps, RateLimiter>();

function emailAllowed(deps: AppDeps, userId: string, to: string): boolean {
  let limiter = emailLimiters.get(deps);
  if (!limiter) emailLimiters.set(deps, (limiter = new RateLimiter()));
  const hour = 60 * 60_000;
  const byRecipient = limiter.hit(`to:${to.trim().toLowerCase()}`, REPORT_EMAILS_PER_HOUR, hour).allowed;
  return limiter.hit(`user:${userId}`, REPORT_EMAILS_PER_HOUR, hour).allowed && byRecipient;
}

async function emailReport(deps: AppDeps, userId: string, reportId: string) {
  const report = await deps.docs.getReport(userId, reportId);
  if (!report) throw new HttpError(404, "not_found", "Quarterly report not found.");
  if (report.pdf.status !== "ready") {
    throw new HttpError(409, "pdf_not_ready", "The report PDF is not ready.");
  }
  const to = await reportRecipient(deps, userId);
  // Sign-up doesn't verify addresses, and nothing limited sends: one account could email its
  // address without end (second review, R2-2). Counted per account and per recipient.
  if (to && !emailAllowed(deps, userId, to)) {
    return deps.docs.updateReport({
      ...report,
      email: { status: "failed" as const, sentAt: null, messageId: null, error: "Too many report emails. Try again later." },
    });
  }
  if (!to) {
    const updated = {
      ...report,
      email: {
        status: "failed" as const,
        sentAt: null,
        messageId: null,
        error: canEmailReports(userId) ? "No report email address is configured." : "Sign in to email reports.",
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

  mount(app, deps, routes.emailReport, async ({ userId, params, body }) => {
    await requireAllowedRecipient(deps, userId, body?.to);
    return emailReport(deps, userId, params.id ?? "");
  });

  mount(app, deps, routes.getEmailSchedule, ({ userId }) =>
    deps.docs.getEmailSchedule(userId),
  );

  mount(app, deps, routes.updateEmailSchedule, async ({ userId, body }) => {
    await requireAllowedRecipient(deps, userId, body.recipientEmail);
    return updateEmailSchedule(deps, userId, body);
  });

  mount(app, deps, routes.listEmailScheduleLogs, ({ userId }) =>
    deps.docs.listEmailScheduleLogs(userId),
  );

  mount(app, deps, routes.triggerScheduledEmail, ({ userId }) =>
    // The stored recipient is not trusted: emailReport looks the address up again at send time.
    triggerEmailSchedule(deps, userId, (scheduledUserId, reportId) => emailReport(deps, scheduledUserId, reportId)),
  );

  app.post("/internal/reports/schedule/run", async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer /, "");
    if (!deps.schedulerSecret || !token || !sameSecret(token, deps.schedulerSecret)) {
      return c.json({ error: { code: "unauthorized", message: "Missing or bad scheduler token." } }, 401);
    }
    const result = await runDueEmailSchedules(
      deps,
      (scheduledUserId, reportId) => emailReport(deps, scheduledUserId, reportId),
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
