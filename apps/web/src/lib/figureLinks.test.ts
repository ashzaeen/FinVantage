import assert from "node:assert/strict";
import { test } from "node:test";
import { splitFigures } from "./figureLinks";

const calcs = [{ label: "Monthly need", expression: "($4,500 - $1,500) / 7", result: "$429 a month" }];

test("a figure that a calculation produced becomes tappable, and others stay plain", () => {
  const parts = splitFigures("Save $429 a month, about 12% of pay, toward $4,500.", calcs);
  assert.deepEqual(parts.map((p) => [p.text, Boolean(p.calc)]), [
    ["Save ", false],
    ["$429", true],
    [" a month, about 12% of pay, toward $4,500.", false],
  ]);
});

test("with no calculations the text is left whole", () => {
  assert.deepEqual(splitFigures("Save $429 a month.", []), [{ text: "Save $429 a month." }]);
});
