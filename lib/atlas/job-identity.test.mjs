import test from "node:test";
import assert from "node:assert/strict";
import { maxJobNumber, nextJobId, handoffRequestKey } from "./job-identity.js";

// The two stores that share the pjob_ namespace, as they stood when a new
// request was minted with an id another job already owned.
const PRODUCTION_JOBS = ["pjob_001", "pjob_002", "pjob_003", "pjob_004", "pjob_005", "pjob_006", "pjob_007"].map((id) => ({ id }));
const PIPELINE_JOBS = ["pjob_001", "pjob_002", "pjob_003", "pjob_004", "pjob_005", "pjob_006", "pjob_007"].map((id) => ({ id }));

test("nextJobId takes the max across every store sharing the namespace", () => {
  assert.equal(nextJobId(PRODUCTION_JOBS, PIPELINE_JOBS), "pjob_008");
  // A store numbering from its own file alone is exactly the bug: both would
  // hand out pjob_008 next, and before that both handed out pjob_001.
  assert.equal(nextJobId([{ id: "pjob_003" }], [{ id: "pjob_011" }]), "pjob_012");
  assert.equal(nextJobId([], []), "pjob_001");
});

test("maxJobNumber accepts ids or job objects and ignores anything else", () => {
  assert.equal(maxJobNumber(["pjob_004", { id: "pjob_009" }]), 9);
  assert.equal(maxJobNumber([{ id: "batch_099" }, { id: "" }, null, undefined, { id: "pjob_x" }]), 0);
  assert.equal(maxJobNumber(null, undefined, [{ id: "pjob_012" }]), 12);
  assert.equal(maxJobNumber([{ id: "pjob_010" }, { id: "pjob_002" }]), 10); // numeric, not lexical
});

test("handoffRequestKey: same card same key, different candidate different key", () => {
  const trip = handoffRequestKey({ blogId: "blog_001", candidateId: "rec_what-trip-cancellation-insurance-actually-covers-and-what-it-doesnt" });
  assert.equal(trip, "handoff:blog_001:rec_what-trip-cancellation-insurance-actually-covers-and-what-it-doesnt");
  assert.equal(handoffRequestKey({ blogId: "blog_001", candidateId: "rec_what-trip-cancellation-insurance-actually-covers-and-what-it-doesnt" }), trip);
  assert.notEqual(handoffRequestKey({ blogId: "blog_001", candidateId: "kw_016" }), trip);
  assert.notEqual(handoffRequestKey({ blogId: "blog_002", candidateId: "kw_016" }), handoffRequestKey({ blogId: "blog_001", candidateId: "kw_016" }));
  // Never collides with the topic-slug key the automatic pipeline dedupes on,
  // so a request cannot adopt an automation job that shares the title.
  assert.ok(trip.startsWith("handoff:"));
});

test("handoffRequestKey: an incomplete request has no key", () => {
  assert.equal(handoffRequestKey({ blogId: "blog_001", candidateId: "" }), "");
  assert.equal(handoffRequestKey({ blogId: "", candidateId: "kw_016" }), "");
  assert.equal(handoffRequestKey(), "");
});
