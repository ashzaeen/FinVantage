import {
  CopilotEvent,
  EmailSchedule,
  EmailScheduleLogEntry,
  LifeEvent,
  QuarterlyReport,
  Recommendation,
  SimulationRun,
  type CopilotAction,
} from "@finvantage/contracts";
import { Binary, MongoClient, type Document } from "mongodb";
import type { DocumentStore, TimeRange } from "../stores";

function rangeFilter(range?: TimeRange): Document {
  return range ? { createdAt: { $gte: range.start, $lt: range.end } } : {};
}

/** MongoDB Atlas implementation for nested, variable-shape financial documents. */
class MongoDocumentStore implements DocumentStore {
  private readonly client: MongoClient;
  private readonly db;
  private initialized: Promise<void> | null = null;

  constructor(uri: string, dbName: string) {
    if (!uri) throw new Error("MONGODB_URI is required when DOCUMENT_BACKEND=mongodb.");
    this.client = new MongoClient(uri);
    this.db = this.client.db(dbName);
  }

  private ready() {
    this.initialized ??= (async () => {
      await this.client.connect();
      await Promise.all([
        this.db.collection("life_events").createIndex({ userId: 1, createdAt: -1 }),
        this.db.collection("simulation_runs").createIndex({ userId: 1, createdAt: -1 }),
        this.db.collection("copilot_events").createIndex({ userId: 1, createdAt: -1 }),
        this.db.collection("recommendations").createIndex({ userId: 1, createdAt: -1 }),
        this.db
          .collection("quarterly_reports")
          .createIndex({ userId: 1, quarter: 1 }, { unique: true }),
        this.db
          .collection("email_schedules")
          .createIndex({ enabled: 1, nextScheduledAt: 1, leaseExpiresAt: 1 }),
        this.db.collection("email_schedule_logs").createIndex({ id: 1 }, { unique: true }),
        this.db.collection("report_pdfs").createIndex({ userId: 1, reportId: 1 }, { unique: true }),
      ]);
    })();
    return this.initialized;
  }

  private async save(collection: string, value: { id: string; userId: string }) {
    await this.ready();
    await this.db
      .collection(collection)
      .replaceOne({ id: value.id, userId: value.userId }, value, { upsert: true });
  }

  private async list(collection: string, userId: string, range?: TimeRange) {
    await this.ready();
    return this.db
      .collection(collection)
      .find({ userId, ...rangeFilter(range) })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async listLifeEvents(userId: string) {
    return LifeEvent.array().parse(await this.list("life_events", userId));
  }

  async saveLifeEvent(event: LifeEvent) {
    await this.save("life_events", event);
    return event;
  }

  async saveSimulationRun(run: SimulationRun) {
    await this.save("simulation_runs", run);
    return run;
  }

  async getSimulationRun(userId: string, id: string) {
    await this.ready();
    const value = await this.db.collection("simulation_runs").findOne({ userId, id });
    return value ? SimulationRun.parse(value) : null;
  }

  async listSimulationRuns(userId: string, range?: TimeRange) {
    return SimulationRun.array().parse(await this.list("simulation_runs", userId, range));
  }

  async saveCopilotEvent(event: CopilotEvent) {
    await this.save("copilot_events", event);
    return event;
  }

  async getCopilotEvent(userId: string, id: string) {
    await this.ready();
    const value = await this.db.collection("copilot_events").findOne({ userId, id });
    return value ? CopilotEvent.parse(value) : null;
  }

  async setCopilotAction(userId: string, id: string, action: CopilotAction) {
    await this.ready();
    const result = await this.db.collection("copilot_events").findOneAndUpdate(
      { userId, id },
      { $set: { userAction: action } },
      { returnDocument: "after" },
    );
    return result ? CopilotEvent.parse(result) : null;
  }

  async listCopilotEvents(userId: string, range?: TimeRange) {
    return CopilotEvent.array().parse(await this.list("copilot_events", userId, range));
  }

  async saveRecommendation(recommendation: Recommendation) {
    await this.save("recommendations", recommendation);
    return recommendation;
  }

  async listRecommendations(userId: string, range?: TimeRange) {
    return Recommendation.array().parse(await this.list("recommendations", userId, range));
  }

  async saveReportPdf(userId: string, reportId: string, pdf: Buffer) {
    await this.ready();
    // Report PDFs are tens of KB, far under MongoDB's 16 MB document limit, so no GridFS.
    await this.db
      .collection("report_pdfs")
      .replaceOne({ userId, reportId }, { userId, reportId, pdf: new Binary(pdf), savedAt: new Date() }, { upsert: true });
  }

  async getReportPdf(userId: string, reportId: string) {
    await this.ready();
    const doc = await this.db.collection("report_pdfs").findOne({ userId, reportId });
    return doc?.pdf instanceof Binary ? Buffer.from(doc.pdf.buffer) : null;
  }

  async saveReport(report: QuarterlyReport) {
    await this.ready();
    await this.db.collection("quarterly_reports").replaceOne(
      { userId: report.userId, quarter: report.quarter },
      report,
      { upsert: true },
    );
    return report;
  }

  async getReport(userId: string, id: string) {
    await this.ready();
    const value = await this.db.collection("quarterly_reports").findOne({ userId, id });
    return value ? QuarterlyReport.parse(value) : null;
  }

  async getReportByQuarter(userId: string, quarter: string) {
    await this.ready();
    const value = await this.db.collection("quarterly_reports").findOne({ userId, quarter });
    return value ? QuarterlyReport.parse(value) : null;
  }

  async updateReport(report: QuarterlyReport) {
    return this.saveReport(report);
  }

  async listReports(userId: string) {
    return QuarterlyReport.array().parse(await this.list("quarterly_reports", userId));
  }

  async getEmailSchedule(userId: string) {
    await this.ready();
    const doc = await this.db.collection("email_schedules").findOne({ userId });
    return doc ? EmailSchedule.parse(doc) : null;
  }

  async saveEmailSchedule(userId: string, schedule: EmailSchedule) {
    await this.ready();
    await this.db
      .collection("email_schedules")
      .replaceOne({ userId }, schedule, { upsert: true });
    return schedule;
  }

  async claimNextDueEmailSchedule(now: string, leaseExpiresAt: string, attemptId: string) {
    await this.ready();
    const claimed = await this.db.collection("email_schedules").findOneAndUpdate(
      {
        enabled: true,
        nextScheduledAt: { $ne: null, $lte: now },
        $or: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { $exists: false } },
          { leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          lastStatus: "pending",
          lastError: null,
          leaseExpiresAt,
          activeAttemptId: attemptId,
          updatedAt: now,
        },
      },
      { sort: { nextScheduledAt: 1 }, returnDocument: "after" },
    );
    return claimed ? EmailSchedule.parse(claimed) : null;
  }

  async recordEmailScheduleLog(userId: string, entry: EmailScheduleLogEntry) {
    await this.ready();
    await this.db.collection("email_schedule_logs").insertOne({ ...entry, userId });
  }

  async listEmailScheduleLogs(userId: string, limit = 20) {
    await this.ready();
    const docs = await this.db
      .collection("email_schedule_logs")
      .find({ userId })
      .sort({ sentAt: -1 })
      .limit(limit)
      .toArray();
    return EmailScheduleLogEntry.array().parse(docs);
  }
}

export function createMongoDocumentStore(uri: string, dbName = "finvantage"): DocumentStore {
  return new MongoDocumentStore(uri, dbName);
}
