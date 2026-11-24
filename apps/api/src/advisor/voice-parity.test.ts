import assert from "node:assert/strict";
import { test } from "node:test";
import { routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import type { AdvisorReadApi } from "./read-api";
import { advisorTools } from "./tools";

/**
 * "Anything you can do by hand, you can do by voice" stays true because this test fails when a
 * route that changes something has no answer. Every non-GET route must be in exactly one place:
 * COVERED (an Advisor tool proposes it, and the user confirms), PLANNED (decided, not built yet),
 * or EXCLUDED, with the reason. Adding a route means deciding which, here.
 */

/** route -> the Advisor tool that proposes it, or that its card's confirm button calls. */
const COVERED: Record<string, string> = {
  addTransaction: "propose_add_transaction",
  updateTransaction: "propose_edit_transaction",
  recategorizeTransaction: "propose_edit_transaction",
  removeTransaction: "propose_remove_transaction",
  restoreTransaction: "propose_remove_transaction",
  setBudget: "propose_set_budget",
  deleteBudget: "propose_remove_budget",
  createGoal: "draft_goal",
  updateGoal: "propose_update_goal",
  deleteGoal: "propose_remove_goal",
  updateSubscription: "propose_subscription_status",
  createLifeEvent: "draft_life_event",
  updateAccount: "propose_update_account_terms",
  createCategoryRule: "propose_category_rule",
  bulkRecategorizeTransactions: "propose_bulk_recategorize",
  splitTransaction: "propose_split_transaction",
  emailReport: "propose_email_report",
  deleteAdvisorConversation: "propose_delete_conversation",
  clearCopilotEvents: "propose_clear_copilot_history",
  deleteLifeEvent: "propose_delete_life_event",
};

/** Decided and not built yet, with the slice that builds it. */
const PLANNED: Record<string, string> = {
};

const EXCLUDED: Record<string, string> = {
  // Signing in and out of the app.
  signUp: "an account is made on a screen",
  logIn: "signing in happens before the Advisor",
  startGuestSession: "signing in happens before the Advisor",
  loadDemoProfile: "replaces all of a user's data with the demo",
  // Bank links.
  createBankLinkToken: "linking a bank needs the bank's own screen",
  exchangeBankToken: "linking a bank needs the bank's own screen",
  linkSandboxBank: "linking a bank needs a screen",
  syncBankItem: "not chosen: refreshing the bank is offered on the Accounts page",
  removeBankItem: "unlinking a bank is too consequential to do by voice",
  // Things the Advisor already is, or that only compute.
  getAdvice: "the Advisor itself",
  advisorChat: "the Advisor itself",
  speakAdvisorReply: "the Advisor itself",
  renderAdvisorVisual: "the Advisor itself",
  createAdvisorConversation: "the Advisor itself",
  sendAdvisorMessage: "the Advisor itself",
  parseLifeEvent: "reads text and saves nothing",
  previewLifeEvent: "computes and saves nothing",
  analyzeLifeScenario: "computes and saves nothing",
  exportLifeScenarioPdf: "makes a file and saves nothing",
  runSimulation: "computes and saves nothing (simulate_scenario does this for the Advisor)",
  evaluateCopilot: "computes and saves nothing the user chose",
  stressTest: "computes and saves nothing",
  projectRetirement: "computes and saves nothing (mocked)",
  creditWhatIf: "computes and saves nothing (a read-only briefing is planned)",
  summarizeTransactions: "a read that is a POST only because the id list is long",
  draftSubscriptionMessage: "drafts text to copy and saves nothing",
  // Not chosen for voice.
  createAccount: "not chosen: an account has many fields and is added on the Accounts page",
  updateExtensionSettings: "not chosen: a browser extension setting",
  recordCopilotAction: "records a click made in the extension",
  deleteCopilotEvent: "not chosen: one saved check; clearing them all is planned",
  createLifeScenario: "not chosen: the scenario editor needs a screen",
  updateLifeScenario: "not chosen: the scenario editor needs a screen",
  deleteLifeScenario: "not chosen: the scenario editor needs a screen",
  applyLifeScenario: "not chosen: the scenario editor needs a screen",
  confirmLifeScenario: "not chosen: the scenario editor needs a screen",
  undoLifeScenario: "not chosen: the scenario editor needs a screen",
  generateReport: "not chosen: reports build themselves on first visit",
  updateEmailSchedule: "not chosen: set on the Reports page",
  triggerScheduledEmail: "a scheduled job, not a user action",
  setTargetAllocation: "not chosen: mocked data and a fiddly spoken format",
  createSpendingCategory: "not chosen: custom categories are managed on the Spending page",
  updateSpendingCategory: "not chosen: custom categories are managed on the Spending page",
  deleteSpendingCategory: "not chosen: custom categories are managed on the Spending page",
  updateSpendingSplit: "not chosen: the needs, wants and savings split is set on the Spending page",
  deleteCategoryRule: "not chosen: rules are managed on the Spending page",
};

const writeRoutes = Object.entries(routes).filter(([, route]) => route.method !== "GET").map(([name]) => name);

test("every route that changes something is covered by an Advisor tool, planned, or excluded with a reason", () => {
  const undecided = writeRoutes.filter((name) => !(name in COVERED) && !(name in PLANNED) && !(name in EXCLUDED));
  assert.deepEqual(undecided, [], `Decide how voice handles these routes, in voice-parity.test.ts: ${undecided.join(", ")}`);
});

test("no route is listed twice, and no list names a route that is gone", () => {
  const all = [...Object.keys(COVERED), ...Object.keys(PLANNED), ...Object.keys(EXCLUDED)];
  assert.deepEqual(all.filter((name, i) => all.indexOf(name) !== i), [], "listed in more than one place");
  assert.deepEqual(all.filter((name) => !writeRoutes.includes(name)), [], "not a write route in the contract (removed, renamed or a GET)");
  assert.ok(Object.values({ ...PLANNED, ...EXCLUDED }).every((reason) => reason.length > 8), "every entry says why");
});

test("every covered route names an Advisor tool that exists", () => {
  // Building the tools only declares them; nothing is read until one runs.
  const tools = advisorTools({
    api: {} as AdvisorReadApi,
    deps: {} as AppDeps,
    userId: "parity",
    brief: { brief: {}, lines: [], categoryLabels: new Map() } as never,
    userTexts: [],
    privateNames: [],
  });
  const names = new Set(tools.map((t) => t.name));
  const missing = Object.entries(COVERED).filter(([, tool]) => !names.has(tool));
  assert.deepEqual(missing, [], "a covered route points at a tool that does not exist");
});
