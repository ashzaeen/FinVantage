import { randomUUID } from "node:crypto";
import {
  EmailSchedule,
  EmailScheduleLogEntry,
  type EmailScheduleFrequency,
  type QuarterlyReport,
  type UpdateEmailScheduleInput,
} from "@finvantage/contracts";
import type { AppDeps } from "../deps";

const LEASE_MS = 5 * 60 * 1_000;
const RETRY_MS = 15 * 60 * 1_000;
const MAX_JOBS_PER_TICK = 25;

export type ScheduledReportSender = (
  userId: string,
  reportId: string,
  recipientEmail: string,
) => Promise<QuarterlyReport>;

function addMonths(date: Date, count: number) {
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + count);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
}

export function nextScheduledAt(frequency: EmailScheduleFrequency, from: string) {
  const date = new Date(from);
  if (frequency === "hourly") date.setUTCHours(date.getUTCHours() + 1);
  else if (frequency === "daily") date.setUTCDate(date.getUTCDate() + 1);
  else if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else addMonths(date, frequency === "quarterly" ? 3 : 1);
  return date.toISOString();
}

export async function updateEmailSchedule(
  deps: AppDeps,
  userId: string,
  input: UpdateEmailScheduleInput,
) {
  const now = deps.now();
  const existing = await deps.docs.getEmailSchedule(userId);
  return deps.docs.saveEmailSchedule(
    userId,
    EmailSchedule.parse({
      id: existing?.id ?? randomUUID(),
      userId,
      ...input,
      lastSentAt: existing?.lastSentAt ?? null,
      lastStatus: input.enabled ? (existing?.lastStatus ?? "idle") : "idle",
      lastError: input.enabled ? (existing?.lastError ?? null) : null,
      lastReportId: existing?.lastReportId ?? null,
      nextScheduledAt: input.enabled ? nextScheduledAt(input.frequency, now) : null,
      leaseExpiresAt: null,
      activeAttemptId: null,
      updatedAt: now,
    }),
  );
}

async function executeSchedule(
  deps: AppDeps,
  schedule: EmailSchedule,
  attemptId: string,
  send: ScheduledReportSender,
) {
  const attemptedAt = deps.now();
  const regularNext = nextScheduledAt(schedule.frequency, attemptedAt);
  // Advance before SMTP. A process crash cannot send the same scheduled occurrence twice.
  await deps.docs.saveEmailSchedule(schedule.userId, {
    ...schedule,
    nextScheduledAt: regularNext,
    updatedAt: attemptedAt,
  });

  const [report] = await deps.docs.listReports(schedule.userId);
  let delivered: QuarterlyReport | null = null;
  let error: string | null = null;
  if (!report) error = "No quarterly report is available to send.";
  else if (report.pdf.status !== "ready") error = "The latest quarterly report PDF is not ready.";
  else {
    try {
      delivered = await send(schedule.userId, report.id, schedule.recipientEmail);
      if (delivered.email.status !== "sent") {
        error = delivered.email.error ?? "Email delivery failed.";
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Email delivery failed.";
    }
  }

  const success = error === null && delivered !== null;
  const log = EmailScheduleLogEntry.parse({
    id: attemptId,
    attemptId,
    userId: schedule.userId,
    sentAt: attemptedAt,
    recipient: schedule.recipientEmail,
    reportId: report?.id ?? null,
    quarter: report?.quarter ?? null,
    status: success ? "success" : "failed",
    messageId: delivered?.email.messageId ?? null,
    error,
  });
  await deps.docs.recordEmailScheduleLog(schedule.userId, log);
  const completed = await deps.docs.saveEmailSchedule(
    schedule.userId,
    EmailSchedule.parse({
      ...schedule,
      lastSentAt: success ? attemptedAt : schedule.lastSentAt,
      lastStatus: success ? "success" : "failed",
      lastError: error,
      lastReportId: report?.id ?? schedule.lastReportId,
      nextScheduledAt: success
        ? regularNext
        : new Date(new Date(attemptedAt).getTime() + RETRY_MS).toISOString(),
      leaseExpiresAt: null,
      activeAttemptId: null,
      updatedAt: deps.now(),
    }),
  );
  return { success, report: delivered ?? report ?? null, log, schedule: completed };
}

export async function triggerEmailSchedule(
  deps: AppDeps,
  userId: string,
  send: ScheduledReportSender,
) {
  const schedule = await deps.docs.getEmailSchedule(userId);
  if (!schedule) {
    return {
      success: false,
      message: "Save an email schedule before triggering it.",
      report: null,
      log: null,
    };
  }
  if (
    schedule.lastStatus === "pending" &&
    schedule.leaseExpiresAt &&
    schedule.leaseExpiresAt > deps.now()
  ) {
    return {
      success: false,
      message: "This schedule is already being processed.",
      report: null,
      log: null,
    };
  }
  const attemptId = randomUUID();
  const pending = await deps.docs.saveEmailSchedule(userId, {
    ...schedule,
    lastStatus: "pending",
    lastError: null,
    activeAttemptId: attemptId,
    leaseExpiresAt: new Date(new Date(deps.now()).getTime() + LEASE_MS).toISOString(),
    updatedAt: deps.now(),
  });
  const result = await executeSchedule(deps, pending, attemptId, send);
  return {
    success: result.success,
    message: result.success ? "The report email was sent." : result.log.error ?? "Email delivery failed.",
    report: result.report,
    log: result.log,
  };
}

export async function runDueEmailSchedules(deps: AppDeps, send: ScheduledReportSender) {
  let claimed = 0;
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < MAX_JOBS_PER_TICK; index += 1) {
    const now = deps.now();
    const attemptId = randomUUID();
    const schedule = await deps.docs.claimNextDueEmailSchedule(
      now,
      new Date(new Date(now).getTime() + LEASE_MS).toISOString(),
      attemptId,
    );
    if (!schedule) break;
    claimed += 1;
    const result = await executeSchedule(deps, schedule, attemptId, send);
    if (result.success) sent += 1;
    else failed += 1;
  }
  return { claimed, sent, failed };
}
