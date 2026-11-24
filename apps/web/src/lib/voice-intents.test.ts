import assert from "node:assert/strict";
import { test } from "node:test";
import { draftsOf, spokenIntent } from "./voice-intents";

test("a short yes, no or undo is understood, whatever the punctuation or case", () => {
  for (const said of ["yes", "Yes.", "yeah", "Yes, please", "go ahead", "Save it!", "that's right", "confirm", "okay"]) assert.equal(spokenIntent(said), "yes", said);
  for (const said of ["no", "No!", "nope", "cancel", "never mind", "don't", "Don't save it."]) assert.equal(spokenIntent(said), "no", said);
  for (const said of ["undo", "Undo that.", "take that back", "revert it"]) assert.equal(spokenIntent(said), "undo", said);
});

test("anything longer or different goes to the Advisor, so a yes that adds a change is not a yes", () => {
  for (const said of ["yes but make it fifty", "yes and add another", "what is my budget", "no wait it was forty two", "", "   ", "yes yes yes please save everything"]) {
    assert.equal(spokenIntent(said), null, JSON.stringify(said));
  }
});

test("drafts on a message get stable ids, and a goal draft counts as creating that goal", () => {
  const goal = { name: "Trip", targetCents: 150_000, currentCents: 0, targetDate: "2027-03-01", priorityRank: 2, flexibility: "flexible" as const, linkedAccountId: null };
  const drafts = draftsOf({
    id: "m1",
    attachments: [
      { kind: "calculation", label: "x", expression: "y", result: "z" },
      { kind: "change_draft", title: "Set Budget", lines: [], readBack: "Set it.", destructive: false, undoable: true, request: { action: "remove_budget", previous: { category: "dining", monthlyLimitCents: 40_000 } } },
      { kind: "goal_draft", goal, probabilityLow: null, probabilityHigh: null, goalChanges: [] },
    ],
  });
  assert.deepEqual(drafts.map((d) => [d.id, d.title, d.request.action, d.destructive]), [
    ["m1:1", "Set Budget", "remove_budget", false],
    ["m1:2", "New Goal", "create_goal", false],
  ]);
});
