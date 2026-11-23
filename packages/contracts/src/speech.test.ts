import assert from "node:assert/strict";
import { test } from "node:test";
import { speechChunks, spokenText } from "./speech";

test("markdown, bullets and headings are removed from speech", () => {
  assert.equal(spokenText("## Plan\n\n**Save** more.\n- Cut dining\n- Pause the gym"), "Plan Save more. Cut dining Pause the gym");
});

test("the first chunk is one sentence, so audio can start quickly", () => {
  const chunks = speechChunks("You can afford it. Your cushion stays at $4,200. The goal odds drop a little.");
  assert.equal(chunks[0], "You can afford it.");
  assert.equal(chunks[1], "Your cushion stays at $4,200. The goal odds drop a little.");
});

test("a decimal point inside an amount does not end a sentence", () => {
  assert.deepEqual(speechChunks("You have $1,240.50 left. Good."), ["You have $1,240.50 left.", "Good."]);
});

test("later sentences are grouped up to the size limit", () => {
  const sentence = "This is a sentence of moderate length.";
  const chunks = speechChunks(Array(10).fill(sentence).join(" "), 100);
  assert.equal(chunks[0], sentence);
  assert.ok(chunks.slice(1).every((c) => c.length <= 100));
  assert.equal(chunks.join(" "), Array(10).fill(sentence).join(" "));
});

test("empty text has nothing to speak", () => {
  assert.deepEqual(speechChunks("  \n "), []);
});
