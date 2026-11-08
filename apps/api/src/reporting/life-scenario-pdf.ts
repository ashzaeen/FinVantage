import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import { formatUsd, type LifeScenarioAnalysis, type LifeScenarioInput, type LifeSimulatorContext } from "@finvantage/contracts";

const require = createRequire(import.meta.url);
const FONT_REGULAR = require.resolve("@fontsource/poppins/files/poppins-latin-400-normal.woff");
const FONT_MEDIUM = require.resolve("@fontsource/poppins/files/poppins-latin-500-normal.woff");
const FONT_BOLD = require.resolve("@fontsource/poppins/files/poppins-latin-700-normal.woff");
const COLORS = {
  ink: "#18221f",
  muted: "#64716b",
  line: "#dce4df",
  paper: "#f6f8f5",
  green: "#126c56",
  greenSoft: "#e3f2eb",
  orange: "#b45309",
  orangeSoft: "#fff0df",
  neutral: "#75827c",
  palette: ["#287a78", "#4e69b1", "#b66831", "#8d5b8d", "#3e7d48", "#b34d62"],
};

const printable = (value: string) => value.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 7)}-01T12:00:00Z`))
  : "Not funded";
const monthIndex = (value: string) => {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return year! * 12 + month! - 1;
};

function eventLabel(input: LifeScenarioInput) {
  const labels = {
    new_baby: "New Baby",
    buy_home: "Buy a Home",
    job_change: "Job Change",
    move_city: "Move Cities",
    wedding: "Wedding",
    custom: input.customEventName.trim() || "Your Event",
  };
  return labels[input.eventType];
}

function setFont(document: PDFKit.PDFDocument, weight: "regular" | "medium" | "bold") {
  document.font(weight === "bold" ? "Poppins-Bold" : weight === "medium" ? "Poppins-Medium" : "Poppins");
}

function pageHeader(document: PDFKit.PDFDocument, title: string, subtitle: string) {
  document.rect(0, 0, 612, 792).fill(COLORS.paper);
  document.rect(0, 0, 612, 94).fill(COLORS.green);
  setFont(document, "medium");
  document.fillColor("#d8eee3").fontSize(8).text("FINVANTAGE  /  LIFE EVENTS", 38, 22);
  setFont(document, "bold");
  document.fillColor("#ffffff").fontSize(20).text(printable(title), 38, 40, { width: 400, ellipsis: true });
  setFont(document, "regular");
  document.fillColor("#d8eee3").fontSize(8).text(printable(subtitle), 418, 48, { width: 155, align: "right" });
}

function sectionTitle(document: PDFKit.PDFDocument, title: string, x: number, y: number) {
  setFont(document, "bold");
  document.fillColor(COLORS.ink).fontSize(11).text(printable(title), x, y);
}

function drawSummaryTile(document: PDFKit.PDFDocument, x: number, label: string, value: string, accent: string) {
  document.roundedRect(x, 122, 128, 66, 8).fill("#ffffff").stroke(COLORS.line);
  document.roundedRect(x, 122, 4, 66, 2).fill(accent);
  setFont(document, "medium");
  document.fillColor(COLORS.muted).fontSize(7).text(printable(label.toUpperCase()), x + 12, 135, { width: 106 });
  setFont(document, "bold");
  document.fillColor(COLORS.ink).fontSize(12).text(printable(value), x + 12, 155, { width: 106, ellipsis: true });
}

function timelinePage(document: PDFKit.PDFDocument, analysis: LifeScenarioAnalysis, generatedAt: string) {
  const rows = analysis.goals.filter((goal) => goal.included);
  const dates = rows.flatMap((goal) => [goal.beforeDisplayDate, goal.displayDate]).filter((date): date is string => date !== null);
  const start = dates.length ? Math.min(...dates.map(monthIndex)) : monthIndex(analysis.asOf);
  const end = Math.max(start + 1, ...dates.map(monthIndex));
  const span = end - start;

  pageHeader(document, "Goal Funding Timeline", `Generated ${generatedAt.slice(0, 10)}`);
  sectionTitle(document, "Current plan compared with this event", 38, 116);
  setFont(document, "regular");
  document.fillColor(COLORS.muted).fontSize(8).text("Each row shows the current funding date and the projected date after the event.", 38, 133);

  const xName = 38;
  const xTrack = 225;
  const trackWidth = 230;
  const xResult = 474;
  let y = 162;
  rows.forEach((goal, index) => {
    if (y > 710) {
      document.addPage();
      pageHeader(document, "Goal Funding Timeline", `Continued · ${generatedAt.slice(0, 10)}`);
      y = 124;
    }
    const color = COLORS.palette[index % COLORS.palette.length]!;
    document.roundedRect(34, y - 5, 544, 40, 6).fill(index % 2 === 0 ? "#ffffff" : "#f0f4f0");
    document.roundedRect(34, y - 5, 3, 40, 1).fill(color);
    setFont(document, "medium");
    document.fillColor(COLORS.ink).fontSize(8).text(printable(goal.name), xName + 7, y, { width: 155, ellipsis: true });
    setFont(document, "regular");
    document.fillColor(COLORS.muted).fontSize(7).text(`${formatUsd(goal.targetCents)} target`, xName + 7, y + 14);

    const before = goal.beforeDisplayDate ? Math.max(0, Math.min(1, (monthIndex(goal.beforeDisplayDate) - start) / span)) : null;
    const after = goal.displayDate ? Math.max(0, Math.min(1, (monthIndex(goal.displayDate) - start) / span)) : null;
    const trackY = y + 12;
    document.moveTo(xTrack, trackY).lineTo(xTrack + trackWidth, trackY).lineWidth(1).strokeColor(COLORS.line).stroke();
    if (before !== null && after !== null) {
      const left = xTrack + Math.min(before, after) * trackWidth;
      const right = xTrack + Math.max(before, after) * trackWidth;
      document.moveTo(left, trackY).lineTo(Math.max(left + 2, right), trackY).lineWidth(4).strokeColor(color).stroke();
    }
    if (before !== null) document.circle(xTrack + before * trackWidth, trackY, 3.5).fill(COLORS.neutral);
    if (after !== null) document.circle(xTrack + after * trackWidth, trackY, 4).fill(color);

    setFont(document, "medium");
    document.fillColor(COLORS.ink).fontSize(7).text(`${dateLabel(goal.beforeDisplayDate)} → ${dateLabel(goal.displayDate)}`, xResult, y + 1, { width: 96, align: "right", ellipsis: true });
    document.roundedRect(xResult + 4, y + 17, 92, 13, 6).fill(goal.delayMonths !== null && goal.delayMonths > 0 ? COLORS.orangeSoft : COLORS.greenSoft);
    document.fillColor(goal.delayMonths !== null && goal.delayMonths > 0 ? COLORS.orange : COLORS.green).fontSize(6.5).text(printable(goal.delayLabel), xResult + 7, y + 20, { width: 86, align: "center", ellipsis: true });
    y += 45;
  });

  const axisY = Math.min(y + 8, 726);
  document.moveTo(xTrack, axisY).lineTo(xTrack + trackWidth, axisY).lineWidth(0.8).strokeColor(COLORS.line).stroke();
  [0, 0.5, 1].forEach((ratio) => {
    const month = Math.round(start + span * ratio);
    const label = dateLabel(`${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}-01`);
    document.circle(xTrack + ratio * trackWidth, axisY, 2).fill(COLORS.neutral);
    setFont(document, "regular");
    document.fillColor(COLORS.muted).fontSize(6.5).text(label, xTrack + ratio * trackWidth - 25, axisY + 7, { width: 50, align: ratio === 0 ? "left" : ratio === 1 ? "right" : "center" });
  });
  setFont(document, "regular");
  document.fillColor(COLORS.muted).fontSize(7).text("Gray marker: current plan     Colored marker: after event     Colors distinguish goals", 38, 753, { width: 530, align: "center" });
}

function balanceChartPages(document: PDFKit.PDFDocument, analysis: LifeScenarioAnalysis, eventMonth: string, generatedAt: string) {
  const rows = analysis.goals.filter((goal) => goal.included);
  const drawHeader = (continued = false) => {
    pageHeader(document, "Goal Balance Over Time", continued ? `Continued · ${generatedAt.slice(0, 10)}` : `Generated ${generatedAt.slice(0, 10)}`);
    sectionTitle(document, "Current plan compared with this event", 38, 116);
    setFont(document, "regular");
    document.fillColor(COLORS.muted).fontSize(8).text("Each chart shows the projected saved balance for one goal. The event date is marked on the timeline.", 38, 133);
    setFont(document, "regular");
    document.fillColor(COLORS.muted).fontSize(7).text("Dashed line: current plan     Solid line: with event", 38, 149);
  };
  drawHeader();
  let y = 172;
  rows.forEach((goal, index) => {
    if (y > 690) {
      document.addPage();
      drawHeader(true);
      y = 172;
    }
    const color = COLORS.palette[index % COLORS.palette.length]!;
    const chartX = 142;
    const chartY = y + 10;
    const chartWidth = 410;
    const chartHeight = 68;
    const series = goal.series;
    const maxBalance = Math.max(goal.targetCents, ...series.map((point) => Math.max(point.beforeCents, point.afterCents)), 1);
    const pointX = (pointIndex: number) => chartX + (pointIndex / Math.max(1, series.length - 1)) * chartWidth;
    const pointY = (cents: number) => chartY + chartHeight - (Math.max(0, cents) / maxBalance) * chartHeight;
    const path = (key: "beforeCents" | "afterCents") => series.map((point, pointIndex) => [pointX(pointIndex), pointY(point[key])] as const);

    document.roundedRect(36, y, 540, 105, 7).fill(index % 2 === 0 ? "#ffffff" : "#f0f4f0");
    setFont(document, "medium");
    document.fillColor(COLORS.ink).fontSize(8).text(printable(goal.name), 46, y + 9, { width: 88, ellipsis: true });
    setFont(document, "regular");
    document.fillColor(COLORS.muted).fontSize(7).text(`${formatUsd(goal.targetCents)} target`, 46, y + 23, { width: 88 });

    document.moveTo(chartX, chartY + chartHeight).lineTo(chartX + chartWidth, chartY + chartHeight).lineWidth(0.6).strokeColor(COLORS.line).stroke();
    document.moveTo(chartX, chartY).lineTo(chartX + chartWidth, chartY).lineWidth(0.5).strokeColor(COLORS.line).stroke();
    const eventIndex = series.findIndex((point) => point.month >= eventMonth);
    if (eventIndex >= 0) {
      const x = pointX(eventIndex);
      document.moveTo(x, chartY - 2).lineTo(x, chartY + chartHeight + 2).lineWidth(0.8).dash(2, { space: 2 }).strokeColor(COLORS.orange).stroke().undash();
    }
    const before = path("beforeCents");
    const after = path("afterCents");
    if (before.length > 1) {
      document.moveTo(before[0]![0], before[0]![1]);
      before.slice(1).forEach(([x, yy]) => document.lineTo(x, yy));
      document.lineWidth(1.4).dash(3, { space: 3 }).strokeColor(COLORS.neutral).stroke().undash();
    }
    if (after.length > 1) {
      document.moveTo(after[0]![0], after[0]![1]);
      after.slice(1).forEach(([x, yy]) => document.lineTo(x, yy));
      document.lineWidth(1.8).strokeColor(color).stroke();
    }
    setFont(document, "regular");
    document.fillColor(COLORS.muted).fontSize(6.5).text(dateLabel(series[0]?.month ?? analysis.asOf), chartX, chartY + chartHeight + 5, { width: 70 });
    document.fillColor(COLORS.muted).fontSize(6.5).text(dateLabel(series.at(-1)?.month ?? analysis.asOf), chartX + chartWidth - 70, chartY + chartHeight + 5, { width: 70, align: "right" });
    y += 115;
  });
}

function allocationChartPage(document: PDFKit.PDFDocument, context: LifeSimulatorContext, analysis: LifeScenarioAnalysis, generatedAt: string) {
  const rows = analysis.goals.filter((goal) => goal.included);
  const current = rows.map((goal) => context.goals.find((item) => item.id === goal.goalId)?.monthlyContributionCents ?? 0);
  const after = rows.map((goal) => goal.postEventContributionCents);
  const totals = [current, after].map((values) => values.reduce((sum, amount) => sum + amount, 0));
  const maxTotal = Math.max(...totals, 1);
  const barX = 118;
  const barWidth = 420;
  const barHeight = 28;

  pageHeader(document, "Monthly Goal Contributions", `Generated ${generatedAt.slice(0, 10)}`);
  sectionTitle(document, "Where each month's money goes", 38, 118);
  setFont(document, "regular");
  document.fillColor(COLORS.muted).fontSize(8).text(`After event costs, ${formatUsd(analysis.analysis.freeCashAfterCents)} per month remains available. Bars show the contribution assumptions used in this comparison.`, 38, 136, { width: 530 });

  for (const [rowIndex, values] of [current, after].entries()) {
    const y = 190 + rowIndex * 82;
    setFont(document, "medium");
    document.fillColor(COLORS.ink).fontSize(8).text(rowIndex === 0 ? "Current plan" : "With event", 42, y + 3, { width: 68 });
    const total = totals[rowIndex]!;
    let offset = 0;
    values.forEach((amount, index) => {
      if (amount <= 0 || total <= 0) return;
      const width = barWidth * amount / maxTotal;
      document.rect(barX + offset, y, width, barHeight).fill(COLORS.palette[index % COLORS.palette.length]!);
      offset += width;
    });
    document.rect(barX, y, barWidth, barHeight).lineWidth(0.6).stroke(COLORS.line);
    setFont(document, "bold");
    document.fillColor(COLORS.ink).fontSize(8).text(formatUsd(total), 544, y + 8, { width: 32, align: "right" });
  }

  sectionTitle(document, "Monthly contribution by goal", 42, 370);
  rows.forEach((goal, index) => {
    const y = 396 + index * 26;
    const color = COLORS.palette[index % COLORS.palette.length]!;
    const before = current[index] ?? 0;
    const next = after[index] ?? 0;
    document.roundedRect(42, y + 2, 10, 10, 2).fill(color);
    setFont(document, "medium");
    document.fillColor(COLORS.ink).fontSize(8).text(printable(goal.name), 60, y + 1, { width: 240, ellipsis: true });
    setFont(document, "regular");
    document.fillColor(COLORS.muted).fontSize(8).text(`${formatUsd(before)}  →  ${formatUsd(next)}`, 350, y + 1, { width: 190, align: "right" });
  });
  setFont(document, "regular");
  document.fillColor(COLORS.muted).fontSize(7).text("Contributions are projections based on the goal plan and the event assumptions above.", 42, 742, { width: 528, align: "center" });
}

/** Build an on-demand export from the same server-side context and analysis as the Life Events page. */
export function createLifeScenarioPdf(
  input: LifeScenarioInput,
  context: LifeSimulatorContext,
  analysis: LifeScenarioAnalysis,
  generatedAt: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "LETTER", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    document.registerFont("Poppins", FONT_REGULAR);
    document.registerFont("Poppins-Medium", FONT_MEDIUM);
    document.registerFont("Poppins-Bold", FONT_BOLD);
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    const title = eventLabel(input);
    pageHeader(document, `${title} Comparison`, `As of ${context.asOf}`);
    const summary = analysis.analysis;
    drawSummaryTile(document, 36, "Free cash before", formatUsd(summary.freeCashBeforeCents), COLORS.neutral);
    drawSummaryTile(document, 174, "Free cash after", formatUsd(summary.freeCashAfterCents), COLORS.green);
    drawSummaryTile(document, 312, "Monthly costs", formatUsd(summary.monthlyCostsCents), COLORS.orange);
    drawSummaryTile(document, 450, "One-time costs", formatUsd(summary.oneTimeCostsCents), COLORS.palette[2]!);

    sectionTitle(document, "Event Assumptions", 38, 210);
    document.roundedRect(36, 228, 540, 108, 8).fill("#ffffff").stroke(COLORS.line);
    const assumptions: Array<[string, string]> = [
      ["Event", title],
      ["Date", dateLabel(input.startMonth)],
      ["Monthly costs", formatUsd(input.monthlyCostCents)],
      ["One-time costs", formatUsd(input.oneTimeCostCents)],
      ["One-time costs from", summary.oneTimeCostsPaidBy || "Not assigned"],
      ["Goals delayed", String(summary.goalsDelayed)],
    ];
    assumptions.forEach(([label, value], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 52 + column * 270;
      const y = 239 + row * 32;
      setFont(document, "regular");
      document.fillColor(COLORS.muted).fontSize(7).text(label, x, y);
      setFont(document, "medium");
      document.fillColor(COLORS.ink).fontSize(9).text(printable(value), x + 90, y - 1, { width: 158, ellipsis: true });
    });

    sectionTitle(document, "When Each Goal Gets Funded", 38, 352);
    setFont(document, "regular");
    document.fillColor(COLORS.muted).fontSize(7).text("Every current goal is compared using the same account and goal data as the Overview.", 38, 369);
    const headers = ["Goal", "Saved / Target", "Current plan", "With event", "Change", "Monthly after"];
    const columns = [40, 182, 285, 365, 444, 506];
    document.rect(36, 389, 540, 23).fill(COLORS.greenSoft);
    setFont(document, "medium");
    headers.forEach((header, index) => document.fillColor(COLORS.green).fontSize(6.5).text(header, columns[index]!, 397, { width: index === 0 ? 135 : 68, ellipsis: true }));

    let y = 419;
    analysis.goals.filter((goal) => goal.included).forEach((goal, index) => {
      if (y > 735) {
        document.addPage();
        pageHeader(document, `${title} Comparison`, "Goal funding dates · continued");
        y = 124;
      }
      if (index % 2 === 0) document.rect(36, y - 4, 540, 29).fill("#ffffff");
      const values = [
        goal.name,
        `${formatUsd(goal.savedCents)} / ${formatUsd(goal.targetCents)}`,
        dateLabel(goal.beforeDisplayDate),
        dateLabel(goal.displayDate),
        goal.delayLabel,
        formatUsd(goal.postEventContributionCents),
      ];
      setFont(document, "medium");
      values.forEach((value, column) => {
        const right = column > 0;
        document.fillColor(column === 4 && goal.delayMonths !== null && goal.delayMonths > 0 ? COLORS.orange : COLORS.ink)
          .fontSize(6.7)
          .text(printable(value), columns[column]!, y + 3, { width: column === 0 ? 135 : 68, align: right ? "right" : "left", ellipsis: true });
      });
      document.moveTo(36, y + 25).lineTo(576, y + 25).lineWidth(0.4).strokeColor(COLORS.line).stroke();
      y += 31;
    });

    document.addPage();
    timelinePage(document, analysis, generatedAt);
    document.addPage();
    balanceChartPages(document, analysis, input.startMonth, generatedAt);
    document.addPage();
    pageHeader(document, "Monthly Contributions", `Generated ${generatedAt.slice(0, 10)}`);
    sectionTitle(document, "How the event changes the monthly plan", 38, 118);
    setFont(document, "regular");
    document.fillColor(COLORS.muted).fontSize(8).text(`Available after monthly event costs: ${formatUsd(summary.freeCashAfterCents)}.`, 38, 136);
    const contributionHeaders = ["Goal", "Before event", "After event", "Difference"];
    const contributionX = [42, 300, 390, 490];
    document.rect(36, 163, 540, 24).fill(COLORS.greenSoft);
    setFont(document, "medium");
    contributionHeaders.forEach((value, index) => document.fillColor(COLORS.green).fontSize(7).text(value, contributionX[index]!, 171, { width: index === 0 ? 245 : 76 }));
    let contributionY = 197;
    analysis.goals.filter((goal) => goal.included).forEach((goal, index) => {
      if (contributionY > 732) {
        document.addPage();
        pageHeader(document, "Monthly Contributions", "Continued");
        contributionY = 124;
      }
      const before = context.goals.find((item) => item.id === goal.goalId)?.monthlyContributionCents ?? 0;
      const after = goal.postEventContributionCents;
      const diff = after - before;
      if (index % 2 === 0) document.rect(36, contributionY - 4, 540, 27).fill("#ffffff");
      setFont(document, "medium");
      document.fillColor(COLORS.ink).fontSize(8).text(printable(goal.name), contributionX[0]!, contributionY + 2, { width: 245, ellipsis: true });
      document.fillColor(COLORS.muted).fontSize(8).text(formatUsd(before), contributionX[1]!, contributionY + 2, { width: 76, align: "right" });
      document.fillColor(COLORS.green).fontSize(8).text(formatUsd(after), contributionX[2]!, contributionY + 2, { width: 76, align: "right" });
      document.fillColor(diff < 0 ? COLORS.orange : COLORS.ink).fontSize(8).text(`${diff > 0 ? "+" : diff < 0 ? "-" : ""}${formatUsd(Math.abs(diff))}`, contributionX[3]!, contributionY + 2, { width: 76, align: "right" });
      contributionY += 29;
    });

    document.addPage();
    allocationChartPage(document, context, analysis, generatedAt);

    document.end();
  });
}
