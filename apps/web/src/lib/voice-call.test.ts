import assert from "node:assert/strict";
import { test } from "node:test";
import { callReducer, CALL_LIMIT_MS, CALL_WARN_MS, formatClock, GOODBYE, initialCallState, WARNING_NOTICE, type CallEvent, type CallState } from "./voice-call";

const run = (events: CallEvent[], from: CallState = initialCallState) => events.reduce(callReducer, from);

test("a normal turn: listen, hear, think, speak, listen again", () => {
  let s = run([{ type: "heard", text: "how are my budgets" }]);
  assert.equal(s.heard, "how are my budgets");
  s = run([{ type: "turnEnd" }], s);
  assert.equal(s.phase, "thinking");
  s = run([{ type: "reply", text: "They look steady." }], s);
  assert.deepEqual([s.phase, s.advisor], ["speaking", "They look steady."]);
  s = run([{ type: "spokeDone" }], s);
  assert.deepEqual([s.phase, s.heard, s.advisor], ["listening", "", "They look steady."]);
});

test("silence with nothing said does not send an empty message", () => {
  assert.equal(run([{ type: "turnEnd" }]).phase, "listening");
  assert.equal(run([{ type: "heard", text: "   " }, { type: "turnEnd" }]).phase, "listening");
});

test("the microphone is dead while the Advisor thinks or speaks, so it cannot hear itself", () => {
  const thinking = run([{ type: "heard", text: "hi" }, { type: "turnEnd" }]);
  assert.equal(run([{ type: "heard", text: "echo" }], thinking).heard, "hi");
  const speaking = run([{ type: "reply", text: "Hello." }], thinking);
  assert.equal(run([{ type: "heard", text: "echo" }], speaking).heard, "hi");
});

test("tapping to interrupt returns to listening, and a late spokeDone is ignored", () => {
  const speaking = run([{ type: "heard", text: "hi" }, { type: "turnEnd" }, { type: "reply", text: "Hello." }]);
  const interrupted = run([{ type: "interrupt" }], speaking);
  assert.equal(interrupted.phase, "listening");
  assert.equal(run([{ type: "heard", text: "wait" }, { type: "spokeDone" }], interrupted).heard, "wait");
});

test("a failed reply returns to listening with a notice", () => {
  const s = run([{ type: "heard", text: "hi" }, { type: "turnEnd" }, { type: "replyFailed", message: "Try again." }]);
  assert.deepEqual([s.phase, s.notice, s.heard], ["listening", "Try again.", ""]);
});

test("muting only works while listening and clears what was heard", () => {
  const muted = run([{ type: "heard", text: "hi" }, { type: "toggleMute" }]);
  assert.deepEqual([muted.muted, muted.heard], [true, ""]);
  assert.equal(run([{ type: "heard", text: "ignored" }], muted).heard, "");
  assert.equal(run([{ type: "toggleMute" }], muted).muted, false);
  const speaking = run([{ type: "heard", text: "hi" }, { type: "turnEnd" }, { type: "reply", text: "Hello." }]);
  assert.equal(run([{ type: "toggleMute" }], speaking).muted, false);
});

test("the 30 second warning shows once", () => {
  const warned = run([{ type: "warn" }]);
  assert.equal(warned.notice, WARNING_NOTICE);
  assert.equal(run([{ type: "warn" }], { ...warned, notice: "" }).notice, "");
});

test("time up while listening says goodbye at once", () => {
  const s = run([{ type: "capReached" }]);
  assert.deepEqual([s.phase, s.advisor], ["ending", GOODBYE]);
});

test("time up mid-turn lets the Advisor finish, then says goodbye", () => {
  let s = run([{ type: "heard", text: "hi" }, { type: "turnEnd" }, { type: "capReached" }]);
  assert.equal(s.phase, "thinking");
  s = run([{ type: "reply", text: "Hello." }], s);
  assert.equal(s.phase, "speaking");
  s = run([{ type: "spokeDone" }], s);
  assert.deepEqual([s.phase, s.advisor], ["ending", GOODBYE]);
});

test("time up while a reply fails still ends the call", () => {
  const s = run([{ type: "heard", text: "hi" }, { type: "turnEnd" }, { type: "capReached" }, { type: "replyFailed", message: "x" }]);
  assert.equal(s.phase, "ending");
});

test("the clock rounds up and the limits are five minutes and a 30 second warning", () => {
  assert.equal(CALL_LIMIT_MS, 300_000);
  assert.equal(CALL_WARN_MS, 30_000);
  assert.equal(formatClock(CALL_LIMIT_MS), "5:00");
  assert.equal(formatClock(272_100), "4:33");
  assert.equal(formatClock(500), "0:01");
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(-5), "0:00");
});
