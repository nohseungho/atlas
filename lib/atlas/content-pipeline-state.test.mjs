import test from "node:test";
import assert from "node:assert/strict";
import {
  STATE, MAIN_SEQUENCE, canTransition, createEntry, transition,
  resumeStateOf, progressOf, isLive, isTerminal, allowedNext,
} from "./content-pipeline-state.js";

const NOW = "2026-08-06T00:00:00.000Z";

function entryAt(state) {
  let e = createEntry({ id: "cp_001", keywordId: "kw_020", keyword: "flight delay compensation", now: NOW });
  const path = MAIN_SEQUENCE.slice(1, MAIN_SEQUENCE.indexOf(state) + 1);
  for (const next of path) {
    const r = transition(e, next, { now: NOW });
    assert.equal(r.ok, true, `setup transition failed at ${next}: ${r.reason}`);
    e = r.entry;
  }
  return e;
}

test("the full happy path IDEA → PUBLISHED is walkable", () => {
  const e = entryAt(STATE.PUBLISHED);
  assert.equal(e.state, STATE.PUBLISHED);
  assert.deepEqual(e.history.map((h) => h.state), MAIN_SEQUENCE);
});

test("PUBLISHED is terminal — no transition can republish it", () => {
  const published = entryAt(STATE.PUBLISHED);
  assert.equal(isTerminal(STATE.PUBLISHED), true);
  assert.deepEqual(allowedNext(STATE.PUBLISHED), []);
  for (const to of Object.values(STATE)) {
    const r = transition(published, to, { reason: "x", now: NOW });
    assert.equal(r.ok, false, `${to} must be refused from PUBLISHED`);
  }
});

test("stage skipping is refused", () => {
  const selected = entryAt(STATE.SELECTED);
  const r = transition(selected, STATE.PUBLISHED, { now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.reason, /허용되지 않/);
  assert.equal(canTransition(STATE.IDEA, STATE.QA_PASSED).ok, false);
  assert.equal(canTransition(STATE.BRIEF_READY, STATE.APPROVED).ok, false);
});

test("transition never mutates the input entry", () => {
  const before = entryAt(STATE.SELECTED);
  const snapshot = JSON.stringify(before);
  const r = transition(before, STATE.BRIEF_READY, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(before), snapshot);
  assert.notEqual(r.entry.state, before.state);
});

test("FAILED requires a reason and records the stage it failed at", () => {
  const draft = entryAt(STATE.DRAFT_READY);
  assert.equal(transition(draft, STATE.FAILED, { now: NOW }).ok, false, "no reason => refused");

  const r = transition(draft, STATE.FAILED, { reason: "Cloudinary 업로드 실패", now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.entry.failedFrom, STATE.DRAFT_READY);
  assert.equal(r.entry.failure.reason, "Cloudinary 업로드 실패");
  assert.equal(resumeStateOf(r.entry), STATE.DRAFT_READY, "retry resumes where it broke, not at IDEA");
});

test("recovering from FAILED clears the failure record", () => {
  const failed = transition(entryAt(STATE.DRAFT_READY), STATE.FAILED, { reason: "이미지 없음", now: NOW }).entry;
  const back = transition(failed, STATE.DRAFT_READY, { now: NOW });
  assert.equal(back.ok, true);
  assert.equal(back.entry.failure, null);
  assert.equal(back.entry.failedFrom, "");
});

test("AWAITING_IMAGE parks beside DRAFT_READY and can resume forward", () => {
  const draft = entryAt(STATE.DRAFT_READY);
  const waiting = transition(draft, STATE.AWAITING_IMAGE, { note: "이미지 5장 미도착", now: NOW });
  assert.equal(waiting.ok, true);
  assert.equal(progressOf(waiting.entry).percent, progressOf(draft).percent);
  assert.equal(transition(waiting.entry, STATE.QA_PASSED, { now: NOW }).ok, true);
});

test("state and history survive a JSON round trip (refresh / restart safety)", () => {
  const e = entryAt(STATE.SCHEDULED);
  const revived = JSON.parse(JSON.stringify(e));
  assert.equal(revived.state, STATE.SCHEDULED);
  assert.equal(revived.history.length, e.history.length);
  assert.equal(transition(revived, STATE.PUBLISHED, { now: NOW }).ok, true);
});

test("progress advances monotonically along the main path", () => {
  let last = -1;
  for (const s of MAIN_SEQUENCE) {
    const p = progressOf(entryAt(s)).percent;
    assert.ok(p > last, `${s} progress ${p} must exceed ${last}`);
    last = p;
  }
  assert.equal(last, 100);
});

test("isLive treats a stored publishedUrl as already public", () => {
  assert.equal(isLive({ state: STATE.APPROVED, publishedUrl: "https://b.com/a.html" }), true);
  assert.equal(isLive({ state: STATE.APPROVED, publishedUrl: "" }), false);
});
