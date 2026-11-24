import assert from "node:assert/strict";
import { test } from "node:test";
import { speakable, speechChunks, spokenText } from "./speech";

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

test("amounts, percentages and dates are rewritten for the voice only", () => {
  assert.equal(speakable("You have $1,240.50 left."), "You have 1,240 dollars and 50 cents left.");
  assert.equal(speakable("Rent is $1,500."), "Rent is 1,500 dollars.");
  assert.equal(speakable("It cost $0.99 and then $1."), "It cost 99 cents and then 1 dollar.");
  assert.equal(speakable("That is -$12.00 net."), "That is minus 12 dollars net.");
  assert.equal(speakable("About 7.49% APR, 60-85% likely."), "About 7.49 percent APR, 60 to 85 percent likely.");
  assert.equal(speakable("Due by 2028-03-01."), "Due by March 1, 2028.");
});

test("speakable leaves wording, other numbers and impossible dates alone", () => {
  assert.equal(speakable("Your 401(k) is up 12 points."), "Your 401(k) is up 12 points.");
  assert.equal(speakable("Order 2026-13-45 shipped."), "Order 2026-13-45 shipped.");
  assert.equal(speakable("$731.97 in total, $4,200 cushion"), "731 dollars and 97 cents in total, 4,200 dollars cushion");
});
