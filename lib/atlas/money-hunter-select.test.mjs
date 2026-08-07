import test from "node:test";
import assert from "node:assert/strict";
import { nicheMatches, isSemanticDuplicate, selectCandidate } from "./money-hunter-select.js";

test("nicheMatches: travel candidate matches blog_001, not K-Beauty", () => {
  assert.equal(nicheMatches("blog_001", { category: "Travel Health", keyword: "travel first aid abroad" }), true);
  assert.equal(nicheMatches("blog_001", { category: "K-Beauty", keyword: "korean skincare routine" }), false);
  assert.equal(nicheMatches("blog_002", { category: "K-Beauty", keyword: "korean skincare routine" }), true);
});

test("isSemanticDuplicate: 'travel insurance comparison' vs 'medical vs travel insurance' => duplicate", () => {
  const existing = [{
    id: "art_002", keyword: "travel insurance comparison criteria", searchIntent: "informational",
    entities: ["travel insurance"], readerAction: "compare", answerScope: "how to compare travel insurance before a trip",
  }];
  const candidate = {
    keyword: "medical insurance vs travel insurance", searchIntent: "informational",
    entities: ["travel insurance", "medical insurance"], readerAction: "compare", answerScope: "difference between travel and medical insurance",
  };
  assert.equal(isSemanticDuplicate(candidate, existing).duplicate, true);
});

test("isSemanticDuplicate: genuinely different topic => not duplicate", () => {
  const existing = [{ id: "art_002", keyword: "travel insurance comparison", searchIntent: "informational", entities: ["travel insurance"], readerAction: "compare", answerScope: "compare travel insurance" }];
  const candidate = { keyword: "how to file a travel insurance claim after a medical emergency", searchIntent: "informational", entities: ["insurance claim", "medical emergency"], readerAction: "file a claim", answerScope: "steps to file a claim abroad" };
  assert.equal(isSemanticDuplicate(candidate, existing).duplicate, false);
});

test("selectCandidate: picks highest-score eligible, skips used/dup/wrong-niche/no-trend", () => {
  const existing = [{ id: "art_002", keyword: "travel insurance comparison", searchIntent: "informational", entities: ["travel insurance"], readerAction: "compare", answerScope: "compare travel insurance" }];
  const candidates = [
    { id: "mh_used", keyword: "trip cancellation insurance", category: "Travel", trendEvidence: true, moneyScore: 90 },
    { id: "mh_kbeauty", keyword: "korean sunscreen review", category: "K-Beauty", trendEvidence: true, moneyScore: 95 },
    { id: "mh_dup", keyword: "compare travel insurance plans", category: "Travel", searchIntent: "informational", entities: ["travel insurance"], readerAction: "compare", answerScope: "compare travel insurance", trendEvidence: true, moneyScore: 88 },
    { id: "mh_notrend", keyword: "travel vaccination checklist", category: "Travel Health", trendEvidence: false, moneyScore: 99 },
    { id: "mh_good", keyword: "travel insurance claim after medical emergency abroad", category: "Travel", searchIntent: "informational", entities: ["insurance claim"], readerAction: "file a claim", answerScope: "file a claim abroad", trendEvidence: true, moneyScore: 80 },
  ];
  const r = selectCandidate({ blogId: "blog_001", candidates, existing, usedMoneyHunterIds: ["mh_used"] });
  assert.equal(r.chosen.id, "mh_good");
  assert.equal(r.eligibleCount, 1);
  assert.ok(r.needsResearch.some((x) => x.id === "mh_notrend"));
  assert.ok(r.rejected.some((x) => x.id === "mh_kbeauty"));
  assert.ok(r.rejected.some((x) => x.id === "mh_dup"));
});

test("selectCandidate: K-Beauty candidate is never chosen for blog_001", () => {
  const candidates = [{ id: "mh_kb", keyword: "best korean essence", category: "K-Beauty", trendEvidence: true, moneyScore: 100 }];
  const r = selectCandidate({ blogId: "blog_001", candidates, existing: [], usedMoneyHunterIds: [] });
  assert.equal(r.chosen, null);
});
