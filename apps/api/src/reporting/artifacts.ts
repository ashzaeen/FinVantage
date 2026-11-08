import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import PDFDocument from "pdfkit";
import {
  formatPercent,
  formatUsd,
  type QuarterlyReport,
  type ReportVisuals,
} from "@finvantage/contracts";

const COLORS = {
  ink: "#20204A",
  muted: "#77769A",
  line: "#DFDFF2",
  page: "#F5F5FC",
  card: "#FFFFFF",
  purple: "#5E55E7",
  indigo: "#4438B8",
  cyan: "#56C4EB",
  blue: "#4B8DF8",
  green: "#36C98F",
  amber: "#F4B84A",
  coral: "#FF737A",
  lavender: "#ECEBFF",
};

const CHART_COLORS = [COLORS.purple, COLORS.cyan, COLORS.green, COLORS.amber, COLORS.coral];
const require = createRequire(import.meta.url);
const POPPINS_REGULAR = require.resolve(
  "@fontsource/poppins/files/poppins-latin-400-normal.woff",
);
const POPPINS_MEDIUM = require.resolve(
  "@fontsource/poppins/files/poppins-latin-500-normal.woff",
);
const POPPINS_BOLD = require.resolve(
  "@fontsource/poppins/files/poppins-latin-700-normal.woff",
);

function registerFonts(document: PDFKit.PDFDocument) {
  document.registerFont("Poppins", POPPINS_REGULAR);
  document.registerFont("Poppins-Medium", POPPINS_MEDIUM);
  document.registerFont("Poppins-Bold", POPPINS_BOLD);
}

function printable(value: string) {
  return value
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

function pageBackground(document: PDFKit.PDFDocument) {
  document.save().rect(0, 0, 612, 792).fill(COLORS.page).restore();
}

function header(
  document: PDFKit.PDFDocument,
  title: string,
  subtitle: string,
) {
  pageBackground(document);
  const gradient = document.linearGradient(0, 0, 612, 102);
  gradient.stop(0, COLORS.indigo).stop(0.55, COLORS.purple).stop(1, COLORS.blue);
  document.save().rect(0, 0, 612, 102).fill(gradient).restore();
  document.save().fillOpacity(0.12).circle(540, 15, 70).fill("#FFFFFF").restore();
  document.save().fillOpacity(0.08).circle(465, 110, 55).fill("#FFFFFF").restore();
  document.fillColor("#FFFFFF").font("Poppins-Bold").fontSize(12).text("FinVantage", 36, 24);
  document.fontSize(23).text(printable(title), 36, 47, { width: 410 });
  document.font("Poppins").fontSize(9).fillColor("#E8E7FF").text(printable(subtitle), 455, 28, {
    width: 121,
    align: "right",
  });
}

function card(
  document: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  title?: string,
  accent?: string,
) {
  document.save().roundedRect(x, y, width, height, 8).fill(COLORS.card).restore();
  document.save().roundedRect(x, y, width, height, 8).lineWidth(0.6).stroke(COLORS.line).restore();
  if (accent) {
    document.save().roundedRect(x, y, 5, height, 3).fill(accent).restore();
  }
  if (title) {
    document.fillColor(COLORS.ink).font("Poppins-Bold").fontSize(11).text(printable(title), x + 14, y + 13, {
      width: width - 28,
    });
  }
}

function kpi(
  document: PDFKit.PDFDocument,
  x: number,
  label: string,
  value: string,
  accent: string,
) {
  card(document, x, 116, 129, 72);
  document.save().circle(x + 19, 136, 8).fill(accent).restore();
  document.fillColor(COLORS.muted).font("Poppins").fontSize(7.5).text(label, x + 12, 151, {
    width: 105,
  });
  document.fillColor(COLORS.ink).font("Poppins-Bold").fontSize(13).text(printable(value), x + 12, 164, {
    width: 105,
  });
}

function pieChart(
  document: PDFKit.PDFDocument,
  values: ReportVisuals["accountAllocation"],
  x: number,
  y: number,
) {
  const total = values.reduce((sum, item) => sum + item.balanceCents, 0);
  if (total <= 0) {
    document.fillColor(COLORS.muted).fontSize(9).text("No asset allocation data", x, y, { width: 220 });
    return;
  }
  const centerX = x + 64;
  const centerY = y + 65;
  const radius = 48;
  let angle = -Math.PI / 2;
  values.slice(0, 5).forEach((item, index) => {
    const sweep = (item.balanceCents / total) * Math.PI * 2;
    const steps = Math.max(4, Math.ceil(sweep * 12));
    document.save().moveTo(centerX, centerY);
    for (let step = 0; step <= steps; step += 1) {
      const pointAngle = angle + (sweep * step) / steps;
      document.lineTo(
        centerX + Math.cos(pointAngle) * radius,
        centerY + Math.sin(pointAngle) * radius,
      );
    }
    document.closePath().fill(CHART_COLORS[index % CHART_COLORS.length]).restore();
    angle += sweep;
  });
  document.save().circle(centerX, centerY, 23).fill(COLORS.card).restore();
  document.fillColor(COLORS.ink).font("Poppins-Bold").fontSize(8).text("Assets", centerX - 20, centerY - 5, {
    width: 40,
    align: "center",
  });
  values.slice(0, 5).forEach((item, index) => {
    const rowY = y + 10 + index * 25;
    document.save().roundedRect(x + 126, rowY + 1, 8, 8, 2).fill(CHART_COLORS[index % CHART_COLORS.length]).restore();
    document.fillColor(COLORS.ink).font("Poppins").fontSize(7.5).text(printable(item.label), x + 140, rowY, {
      width: 72,
      ellipsis: true,
    });
    document.fillColor(COLORS.muted).fontSize(7).text(
      `${Math.round((item.balanceCents / total) * 100)}%`,
      x + 140,
      rowY + 10,
      { width: 72 },
    );
  });
}

function rangeBar(
  document: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  low: number,
  high: number,
  color: string,
) {
  document.save().roundedRect(x, y, width, 7, 3.5).fill(COLORS.lavender).restore();
  document
    .save()
    .roundedRect(x + width * low, y, Math.max(3, width * (high - low)), 7, 3.5)
    .fill(color)
    .restore();
}

function goalBars(
  document: PDFKit.PDFDocument,
  goals: ReportVisuals["goalComparisons"],
  x: number,
  y: number,
) {
  goals.slice(0, 3).forEach((goal, index) => {
    const rowY = y + index * 54;
    document.fillColor(COLORS.ink).font("Poppins-Bold").fontSize(7.5).text(printable(goal.goalName), x, rowY, {
      width: 220,
      ellipsis: true,
    });
    document.fillColor(COLORS.muted).font("Poppins").fontSize(6.5).text("Previous", x, rowY + 14);
    rangeBar(document, x + 44, rowY + 14, 130, goal.previousLow, goal.previousHigh, COLORS.cyan);
    document.fillColor(COLORS.muted).fontSize(6.5).text(
      `${formatPercent(goal.previousLow)}-${formatPercent(goal.previousHigh)}`,
      x + 180,
      rowY + 12,
      { width: 42, align: "right" },
    );
    document.fillColor(COLORS.muted).fontSize(6.5).text("Current", x, rowY + 31);
    rangeBar(document, x + 44, rowY + 31, 130, goal.currentLow, goal.currentHigh, COLORS.purple);
    document.fillColor(COLORS.muted).fontSize(6.5).text(
      `${formatPercent(goal.currentLow)}-${formatPercent(goal.currentHigh)}`,
      x + 180,
      rowY + 29,
      { width: 42, align: "right" },
    );
  });
}

function currentGoalBars(
  document: PDFKit.PDFDocument,
  goals: ReportVisuals["goalPathways"],
  x: number,
  y: number,
) {
  goals.slice(0, 3).forEach((goal, index) => {
    const rowY = y + index * 54;
    const accent = CHART_COLORS[index % CHART_COLORS.length];
    document.fillColor(COLORS.ink).font("Poppins-Bold").fontSize(7.5).text(printable(goal.goalName), x, rowY, {
      width: 220,
      ellipsis: true,
    });
    document.fillColor(COLORS.muted).font("Poppins").fontSize(6.5).text("Current", x, rowY + 22);
    rangeBar(document, x + 44, rowY + 22, 130, goal.probabilityLow, goal.probabilityHigh, accent);
    document.fillColor(COLORS.muted).fontSize(6.5).text(
      `${formatPercent(goal.probabilityLow)}-${formatPercent(goal.probabilityHigh)}`,
      x + 180,
      rowY + 20,
      { width: 42, align: "right" },
    );
  });
}

function spendingLine(
  document: PDFKit.PDFDocument,
  points: ReportVisuals["spendingTrend"],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (points.length === 0) return;
  const max = Math.max(...points.map((point) => point.monthlySpendingCents), 1);
  for (let grid = 0; grid <= 3; grid += 1) {
    const gridY = y + (height * grid) / 3;
    document.save().moveTo(x, gridY).lineTo(x + width, gridY).dash(2, { space: 3 }).strokeColor(COLORS.line).stroke().undash().restore();
  }
  const coords = points.map((point, index) => ({
    x: points.length === 1 ? x + width / 2 : x + (width * index) / (points.length - 1),
    y: y + height - (point.monthlySpendingCents / max) * (height - 8),
    point,
  }));
  if (coords.length > 1) {
    document.save().moveTo(coords[0].x, y + height);
    coords.forEach((coordinate) => document.lineTo(coordinate.x, coordinate.y));
    document.lineTo(coords.at(-1)!.x, y + height).closePath().fillOpacity(0.14).fill(COLORS.cyan).fillOpacity(1).restore();
  }
  document.save().lineWidth(3).strokeColor(COLORS.cyan).moveTo(coords[0].x, coords[0].y);
  coords.slice(1).forEach((coordinate) => document.lineTo(coordinate.x, coordinate.y));
  document.stroke().restore();
  coords.forEach(({ x: pointX, y: pointY, point }) => {
    document.save().circle(pointX, pointY, 4).fill(COLORS.purple).restore();
    document.fillColor(COLORS.ink).font("Poppins-Bold").fontSize(7).text(formatUsd(point.monthlySpendingCents), pointX - 35, pointY - 17, {
      width: 70,
      align: "center",
    });
    document.fillColor(COLORS.muted).font("Poppins").fontSize(7).text(point.quarter, pointX - 30, y + height + 8, {
      width: 60,
      align: "center",
    });
  });
}

function pathwayStatus(status: ReportVisuals["goalPathways"][number]["status"]) {
  if (status === "on_track") return { label: "On track", color: COLORS.green };
  if (status === "watch") return { label: "Watch", color: COLORS.amber };
  return { label: "Needs attention", color: COLORS.coral };
}

function pathwayChart(
  document: PDFKit.PDFDocument,
  goal: ReportVisuals["goalPathways"][number],
  x: number,
  y: number,
  width: number,
  height: number,
  accent = COLORS.purple,
) {
  if (goal.points.length < 2) return;
  const max = Math.max(goal.targetCents, ...goal.points.map((point) => point.p90Cents), 1);
  const coordinate = (value: number, index: number) => ({
    x: x + (width * index) / (goal.points.length - 1),
    y: y + height - (Math.max(0, value) / max) * height,
  });
  const upper = goal.points.map((point, index) => coordinate(point.p90Cents, index));
  const lower = goal.points.map((point, index) => coordinate(point.p10Cents, index)).reverse();
  document.save().moveTo(upper[0].x, upper[0].y);
  [...upper.slice(1), ...lower].forEach((point) => document.lineTo(point.x, point.y));
  document.closePath().fillOpacity(0.16).fill(accent).fillOpacity(1).restore();
  const median = goal.points.map((point, index) => coordinate(point.p50Cents, index));
  document.save().moveTo(median[0].x, median[0].y).lineWidth(2.3).strokeColor(accent);
  median.slice(1).forEach((point) => document.lineTo(point.x, point.y));
  document.stroke().restore();
  const targetY = y + height - (goal.targetCents / max) * height;
  document.save().moveTo(x, targetY).lineTo(x + width, targetY).dash(4, { space: 3 }).strokeColor(COLORS.coral).stroke().undash().restore();
  document.fillColor(COLORS.coral).font("Poppins-Bold").fontSize(6.5).text("Target", x + width - 34, targetY - 10, { width: 34, align: "right" });
  document.fillColor(COLORS.muted).font("Poppins").fontSize(6.5).text(goal.points[0].date.slice(0, 7), x, y + height + 5, { width: 60 });
  document.text(goal.points.at(-1)?.date.slice(0, 7) ?? "", x + width - 60, y + height + 5, { width: 60, align: "right" });
}

function suggestionStyle(category: ReportVisuals["suggestions"][number]["category"]) {
  if (category === "maintain") return { label: "MAINTAIN", color: COLORS.green, tint: "#E7FAF3" };
  if (category === "review") return { label: "REVIEW", color: COLORS.amber, tint: "#FFF6DF" };
  return { label: "EXPLORE", color: COLORS.coral, tint: "#FFF0F1" };
}

function footer(document: PDFKit.PDFDocument) {
  const range = document.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    document.switchToPage(index);
    document.fillColor(COLORS.muted).font("Poppins").fontSize(7).text(
      `FinVantage quarterly review | Page ${index - range.start + 1} of ${range.count}`,
      36,
      765,
      { width: 540, align: "center" },
    );
  }
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface PdfStore {
  generate(report: QuarterlyReport): Promise<{ fileName: string; generatedAt: string }>;
  read(report: QuarterlyReport): Promise<Buffer>;
  pathFor(report: QuarterlyReport): string;
}

class LocalPdfStore implements PdfStore {
  constructor(
    private readonly root: string,
    private readonly now: () => string,
  ) {}

  pathFor(report: QuarterlyReport) {
    const fileName = `${safeSegment(report.quarter)}-${safeSegment(report.id)}.pdf`;
    return path.join(this.root, safeSegment(report.userId), fileName);
  }

  async generate(report: QuarterlyReport) {
    const filePath = this.pathFor(report);
    await mkdir(path.dirname(filePath), { recursive: true });
    const document = new PDFDocument({
      size: "LETTER",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      autoFirstPage: false,
      bufferPages: true,
    });
    registerFonts(document);
    const output = createWriteStream(filePath);
    document.pipe(output);

    const hasComparison = Boolean(report.previousQuarter && report.largestChange);
    document.addPage();
    header(
      document,
      `${report.quarter} Financial Dashboard`,
      hasComparison
        ? `Compared with ${report.previousQuarter}\nGenerated ${report.createdAt.slice(0, 10)}`
        : `Single-quarter baseline\nGenerated ${report.createdAt.slice(0, 10)}`,
    );
    const summary = report.visuals.summary;
    kpi(document, 36, "NET WORTH", formatUsd(summary.netWorthCents), COLORS.purple);
    kpi(document, 173, "MONTHLY INCOME", formatUsd(summary.monthlyIncomeCents), COLORS.blue);
    kpi(document, 310, "MONTHLY SAVINGS", formatUsd(summary.monthlySavingsCents), COLORS.green);
    kpi(document, 447, "MONTHLY SPENDING", formatUsd(summary.monthlySpendingCents), COLORS.coral);
    card(document, 36, 202, 260, 242, "Asset allocation", COLORS.cyan);
    pieChart(document, report.visuals.accountAllocation, 50, 242);
    card(document, 308, 202, 268, 242, "Goal probability ranges", COLORS.purple);
    document.fillColor(COLORS.muted).font("Poppins").fontSize(7).text(
      hasComparison ? "Low-to-high estimate: previous vs current" : "Current low-to-high planning estimate",
      322,
      232,
      { width: 235 },
    );
    if (hasComparison) goalBars(document, report.visuals.goalComparisons, 322, 252);
    else currentGoalBars(document, report.visuals.goalPathways, 322, 252);
    card(document, 36, 456, 540, 270, "Monthly spending trend", COLORS.green);
    document.fillColor(COLORS.muted).font("Poppins").fontSize(7).text("Source: stored simulation snapshots", 50, 486);
    spendingLine(document, report.visuals.spendingTrend, 76, 518, 460, 142);

    let pathwayY = 118;
    document.addPage();
    header(document, "Goal pathways", "Simulator median path with uncertainty band");
    for (const [goalIndex, goal] of report.visuals.goalPathways.entries()) {
      if (pathwayY + 186 > 742) {
        document.addPage();
        header(document, "Goal pathways", "Continued");
        pathwayY = 118;
      }
      const chartAccent = CHART_COLORS[goalIndex % CHART_COLORS.length];
      card(document, 36, pathwayY, 540, 176, undefined, chartAccent);
      const status = pathwayStatus(goal.status);
      document.fillColor(COLORS.ink).font("Poppins-Bold").fontSize(13).text(printable(goal.goalName), 52, pathwayY + 18, { width: 190 });
      document.save().roundedRect(52, pathwayY + 44, 82, 20, 10).fill(status.color).restore();
      document.fillColor("#FFFFFF").font("Poppins-Bold").fontSize(7.5).text(status.label, 52, pathwayY + 51, { width: 82, align: "center" });
      document.fillColor(COLORS.muted).font("Poppins").fontSize(7).text("Probability range", 52, pathwayY + 77);
      document.fillColor(COLORS.ink).font("Poppins-Bold").fontSize(11).text(`${formatPercent(goal.probabilityLow)} to ${formatPercent(goal.probabilityHigh)}`, 52, pathwayY + 89);
      document.fillColor(COLORS.muted).font("Poppins").fontSize(7).text(`Target ${formatUsd(goal.targetCents)} by ${goal.targetDate}`, 52, pathwayY + 111, { width: 188 });
      document.text(`Median completion: ${goal.medianCompletionDate ?? "not projected"}`, 52, pathwayY + 125, { width: 188 });
      pathwayChart(document, goal, 258, pathwayY + 28, 288, 105, chartAccent);
      document.fillColor(COLORS.muted).fontSize(6.5).text("Shaded area: 10th-90th percentile | Line: median path | Dashed: target", 258, pathwayY + 150, { width: 288, align: "center" });
      pathwayY += 190;
    }
    document.fillColor(COLORS.muted).font("Poppins").fontSize(7).text(
      "On track, watch, and needs attention are planning labels based on probability ranges. They are not guarantees.",
      52,
      Math.min(pathwayY + 2, 744),
      { width: 508, align: "center" },
    );

    document.addPage();
    header(document, "Suggested focus", "Organized by the level of attention each goal may need");
    document.fillColor(COLORS.ink).font("Poppins-Medium").fontSize(9).text(
      "These are planning prompts based on stored simulator ranges. Choose what fits your priorities.",
      52,
      122,
      { width: 508, align: "center" },
    );
    let suggestionY = 158;
    for (const suggestion of report.visuals.suggestions.slice(0, 3)) {
      const style = suggestionStyle(suggestion.category);
      const goal = report.visuals.goalPathways.find((candidate) => candidate.goalId === suggestion.goalId);
      card(document, 52, suggestionY, 508, 126, undefined, style.color);
      document.save().roundedRect(72, suggestionY + 18, 74, 20, 10).fill(style.tint).restore();
      document.fillColor(style.color).font("Poppins-Bold").fontSize(7).text(style.label, 72, suggestionY + 25, {
        width: 74,
        align: "center",
      });
      document.fillColor(COLORS.ink).font("Poppins-Bold").fontSize(13).text(printable(suggestion.title), 72, suggestionY + 51, {
        width: 220,
      });
      document.fillColor(COLORS.muted).font("Poppins").fontSize(8).text(printable(suggestion.detail), 72, suggestionY + 75, {
        width: 300,
        height: 38,
        ellipsis: true,
      });
      if (goal) {
        document.fillColor(style.color).font("Poppins-Bold").fontSize(18).text(
          `${formatPercent(goal.probabilityLow)}-${formatPercent(goal.probabilityHigh)}`,
          390,
          suggestionY + 42,
          { width: 142, align: "right" },
        );
        document.fillColor(COLORS.muted).font("Poppins").fontSize(7).text("CURRENT RANGE", 390, suggestionY + 69, {
          width: 142,
          align: "right",
        });
      }
      suggestionY += 140;
    }
    card(document, 52, 594, 508, 118, "Look ahead", COLORS.blue);
    document.fillColor(COLORS.ink).font("Poppins").fontSize(9).text(printable(report.lookAhead), 72, 628, {
      width: 468,
      height: 56,
      ellipsis: true,
    });

    document.addPage();
    header(
      document,
      hasComparison ? "Quarterly recap" : "Quarter baseline",
      hasComparison ? `${report.previousQuarter} to ${report.quarter}` : `${report.quarter} - first available report`,
    );
    card(document, 36, 118, 540, 146, "What went well", COLORS.green);
    document.fillColor(COLORS.ink).font("Poppins").fontSize(8.5).text(
      printable(report.wentWell.map((item) => `- ${item}`).join("\n\n")),
      52,
      150,
      { width: 508, height: 98, ellipsis: true },
    );
    card(document, 36, 276, 540, 126, "What needs attention", COLORS.coral);
    document.fillColor(COLORS.ink).font("Poppins").fontSize(8.5).text(
      printable(report.didNotGoWell.map((item) => `- ${item}`).join("\n\n")),
      52,
      308,
      { width: 508, height: 78, ellipsis: true },
    );
    card(document, 36, 414, 540, 122, hasComparison ? "Largest change and why" : "Baseline context", COLORS.purple);
    if (report.largestChange) {
      document.fillColor(COLORS.purple).font("Poppins-Bold").fontSize(9).text(printable(report.largestChange.label), 52, 446, { width: 508 });
      document.fillColor(COLORS.ink).font("Poppins").fontSize(8.5).text(
        printable(`Previous: ${report.largestChange.previousValue}. Current: ${report.largestChange.currentValue}. ${report.largestChange.change}. ${report.largestChange.cause}`),
        52,
        466,
        { width: 508, height: 54, ellipsis: true },
      );
    } else {
      document.fillColor(COLORS.ink).font("Poppins").fontSize(9).text(
        "No prior-quarter simulation was available. This report records the current quarter as the baseline for future comparisons.",
        52,
        452,
        { width: 508, height: 55 },
      );
    }
    card(document, 36, 548, 260, 154, "Look ahead", COLORS.blue);
    document.fillColor(COLORS.ink).font("Poppins").fontSize(8.5).text(printable(report.lookAhead), 52, 580, { width: 228, height: 102, ellipsis: true });
    card(document, 308, 548, 268, 154, "Next steps", COLORS.amber);
    document.fillColor(COLORS.ink).font("Poppins").fontSize(8.5).text(printable(report.nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n\n")), 324, 580, { width: 236, height: 102, ellipsis: true });

    document.addPage();
    header(document, "Evidence and agent coverage", `${report.quarter} traceable report sources`);
    card(document, 36, 118, 540, 250, hasComparison ? "Evidence from consecutive quarters" : "Current-quarter evidence", COLORS.cyan);
    document.fillColor(COLORS.ink).font("Poppins").fontSize(8).text(
      printable(report.evidence.map((item) => `${item.quarter} | ${item.label}: ${item.value}`).join("\n")),
      52,
      152,
      { width: 508, height: 190, ellipsis: true },
    );
    card(document, 36, 382, 540, 174, "Sources reviewed by the quarterly agent", COLORS.purple);
    const coverage = [
      ["Simulation runs", report.sourceIds.simulationRunIds.length],
      ["Copilot events", report.sourceIds.copilotEventIds.length],
      ["Recommendations", report.sourceIds.recommendationIds.length],
    ] as const;
    coverage.forEach(([label, count], index) => {
      const x = 52 + index * 170;
      document.save().roundedRect(x, 426, 154, 86, 12).fill(COLORS.lavender).restore();
      document.fillColor(COLORS.purple).font("Poppins-Bold").fontSize(22).text(String(count), x, 444, { width: 154, align: "center" });
      document.fillColor(COLORS.muted).font("Poppins-Medium").fontSize(7.5).text(label.toUpperCase(), x, 478, { width: 154, align: "center" });
    });
    document.fillColor(COLORS.muted).fontSize(7).text(
      "Probability ranges are educational estimates, not guarantees. FinVantage suggests options and does not move money.",
      52,
      590,
      { width: 508, align: "center" },
    );

    footer(document);
    document.end();
    await new Promise<void>((resolve, reject) => {
      output.on("finish", resolve);
      output.on("error", reject);
    });
    return { fileName: path.basename(filePath), generatedAt: this.now() };
  }

  read(report: QuarterlyReport) {
    return readFile(this.pathFor(report));
  }
}

export interface MailClient {
  readonly provider: string;
  sendReport(input: {
    to: string;
    report: QuarterlyReport;
    pdf: Buffer;
  }): Promise<{ messageId: string }>;
}

class MockMailClient implements MailClient {
  readonly provider = "mock";
  async sendReport(input: { report: QuarterlyReport }) {
    return { messageId: `mock-${input.report.id}` };
  }
}

class SmtpMailClient implements MailClient {
  readonly provider = "smtp";
  private transporter: Transporter;
  private from: string;

  constructor(options: {
    host: string;
    port: number;
    secure?: boolean;
    user: string;
    pass: string;
    from: string;
  }) {
    this.from = options.from;
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure ?? false,
      auth: {
        user: options.user,
        pass: options.pass,
      },
    });
  }

  async sendReport(input: { to: string; report: QuarterlyReport; pdf: Buffer }) {
    if (!input.to) throw new Error("Recipient email address is required.");
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: `${input.report.quarter} FinVantage Financial Review`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #16192c;">
            <div style="background: #544af7; padding: 20px; border-radius: 16px; margin-bottom: 24px; color: white;">
              <h1 style="margin: 0; font-size: 24px; font-weight: bold;">FinVantage Quarterly Review</h1>
              <p style="margin: 4px 0 0 0; opacity: 0.85; font-size: 14px;">${escapeHtml(input.report.quarter)} Performance & Forecast</p>
            </div>
            <p style="font-size: 15px; line-height: 1.6; color: #4a4f68;">${escapeHtml(input.report.why)}</p>
            <div style="background: #f4f5fa; padding: 16px; border-radius: 12px; margin: 20px 0;">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #16192c;">Immediate Next Steps</h3>
              <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #4a4f68; line-height: 1.6;">
                ${input.report.nextSteps.map((step) => `<li style="margin-bottom: 4px;">${escapeHtml(step)}</li>`).join("")}
              </ol>
            </div>
            <p style="font-size: 13px; color: #8d94a8;">Your full quarterly report PDF is attached to this email.</p>
          </div>
        `,
        attachments: [
          {
            filename: input.report.pdf.fileName ?? `${input.report.quarter}-report.pdf`,
            content: input.pdf,
          },
        ],
      });
      return { messageId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("Invalid login") ||
        message.includes("535") ||
        message.includes("Username and Password not accepted")
      ) {
        throw new Error("Gmail authentication failed: Invalid login credentials or expired App Password.");
      }
      throw new Error(`Email delivery failed via SMTP (${this.from}): ${message}`);
    }
  }
}

class ResendMailClient implements MailClient {
  readonly provider = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendReport(input: { to: string; report: QuarterlyReport; pdf: Buffer }) {
    if (!this.apiKey || !this.from) throw new Error("Resend email settings are incomplete.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: `${input.report.quarter} FinVantage Financial Review`,
        html: `<h1>${escapeHtml(input.report.quarter)} Financial Review</h1><p>${escapeHtml(input.report.why)}</p><p>Your full report is attached.</p>`,
        attachments: [
          {
            filename: input.report.pdf.fileName ?? `${input.report.quarter}-report.pdf`,
            content: input.pdf.toString("base64"),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Email provider returned status ${response.status}.`);
    const result = (await response.json()) as { id?: string };
    if (!result.id) throw new Error("Email provider returned no message ID.");
    return { messageId: result.id };
  }
}

export function createPdfStore(env: NodeJS.ProcessEnv, now: () => string): PdfStore {
  const root = path.resolve(env.REPORT_OUTPUT_DIR ?? path.join(process.cwd(), "data", "reports"));
  return new LocalPdfStore(root, now);
}

export function createMailClient(env: NodeJS.ProcessEnv): MailClient {
  if (env.MAIL_PROVIDER === "smtp") {
    return new SmtpMailClient({
      host: env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(env.SMTP_PORT ?? 587),
      secure: env.SMTP_SECURE === "true",
      user: env.SMTP_USER ?? "",
      pass: env.SMTP_PASSWORD ?? "",
      from: env.REPORT_EMAIL_FROM ?? env.SMTP_USER ?? "",
    });
  }
  return env.MAIL_PROVIDER === "resend"
    ? new ResendMailClient(env.RESEND_API_KEY ?? "", env.REPORT_EMAIL_FROM ?? "")
    : new MockMailClient();
}
