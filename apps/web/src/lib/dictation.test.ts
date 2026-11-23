import assert from "node:assert/strict";
import { test } from "node:test";
import { appendDictation, cleanTranscript } from "./dictation";

test("retirement accounts and acronyms", () => {
  assert.equal(cleanTranscript("should I max my four oh one k"), "should I max my 401(k)");
  assert.equal(cleanTranscript("my 401k match"), "my 401(k) match");
  assert.equal(cleanTranscript("put it in my roth ira"), "put it in my Roth IRA");
  assert.equal(cleanTranscript("what is the apr on this card"), "what is the APR on this card");
});

test("percent and dollar words become symbols", () => {
  assert.equal(cleanTranscript("at 7.49 percent"), "at 7.49%");
  assert.equal(cleanTranscript("a 28,000 dollars car"), "a $28,000 car");
  assert.equal(cleanTranscript("I have 3000 dollars down"), "I have $3,000 down");
  assert.equal(cleanTranscript("it cost 12.50 dollars"), "it cost $12.50");
});

test("grand and k amounts", () => {
  assert.equal(cleanTranscript("a 28 grand car"), "a $28,000 car");
  assert.equal(cleanTranscript("save 1.5 grand"), "save $1,500");
  assert.equal(cleanTranscript("a 28k car"), "a $28,000 car");
});

test("the k in 401(k) is not read as thousands", () => {
  assert.equal(cleanTranscript("my 401(k) balance"), "my 401(k) balance");
});

test("already formatted amounts and plain text pass through", () => {
  assert.equal(cleanTranscript("I want $1,500 saved by March"), "I want $1,500 saved by March");
  assert.equal(cleanTranscript("  how   am I doing  "), "how am I doing");
  assert.equal(cleanTranscript(""), "");
});

test("appendDictation joins with one space and ignores empty speech", () => {
  assert.equal(appendDictation("", "hello"), "hello");
  assert.equal(appendDictation("Can I afford", " a car"), "Can I afford a car");
  assert.equal(appendDictation("typed text  ", "more"), "typed text more");
  assert.equal(appendDictation("typed", "   "), "typed");
});
