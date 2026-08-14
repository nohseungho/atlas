// R2 duplicate hotfix — guards the defect where "이번 주 자동추천" re-offered
// topics ATLAS had already published. The three confirmed cases:
//   • Choosing Travel Medical Insurance for Senior Travelers      ↔ art_011
//   • Student Travel Insurance for Studying Abroad ...            ↔ art_012
//   • How to Use Travel Insurance Comparison Sites Effectively    ↔ art_002 /
//     duplicateForbidden ("How to choose / compare overseas travel insurance")
// Runs against the REAL data/atlas fixtures (read-only) plus synthetic cases.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildRecommendations,
  buildDuplicateIndex,
  findSemanticDuplicate,
  topicSignature,
  signatureCollision,
  assertProductionEligible,
  DUPLICATE_FORBIDDEN_TOPICS,
} from "./recommendation-engine.js";
import { buildRecommendationCandidate, buildHandoffRequest } from "./chatgpt-handoff.js";

const DATA = path.join(process.cwd(), "data", "atlas");
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf-8"));

const articles = read("articles.json").articles || [];
const keywords = read("keywords.json").keywords || [];
const categories = read("categories.json").items || [];
const jobs = read("production-jobs.json").jobs || [];

const DUPLICATES = [
  "Choosing Travel Medical Insurance for Senior Travelers",
  "Student Travel Insurance for Studying Abroad: A Practical Guide",
  "How to Use Travel Insurance Comparison Sites Effectively",
];

function build(jobList = jobs, keywordList = keywords) {
  return buildRecommendations({ keywords: keywordList, articles, categories, jobs: jobList, liveData: false });
}

// The state the screen was in before kw_023 was taken by a production job and
// published: no job holds it and its own status is still an unused idea. Once a
// candidate is spent it must NOT be offered again, which is asserted separately.
const jobsWithoutKw023 = jobs.filter((j) => j.moneyHunterId !== "kw_023");
const keywordsWithKw023Unused = keywords.map((k) => (k.id === "kw_023" ? { ...k, status: "idea" } : k));
const unusedState = () => build(jobsWithoutKw023, keywordsWithKw023Unused);

test("signature: same audience + same insurance type is one topic", () => {
  const cand = topicSignature(
    "Choosing Travel Medical Insurance for Senior Travelers",
    "Find age-appropriate travel medical coverage and pre-existing condition rules",
  );
  const art011 = topicSignature(
    "Travel Medical Insurance for Seniors Over 65: A Pre-Trip Checklist",
    "travel-medical-insurance-seniors-over-65",
    "senior-international-travel-medical-insurance-checklist",
  );
  assert.ok(signatureCollision(cand, art011), "senior travel-medical must collide with art_011");
});

test("signature: hyphenated slugs / intent keys are matched like prose", () => {
  const student = topicSignature("Student Travel Insurance for Studying Abroad: A Practical Guide", "Compare student travel medical plans for a semester or year abroad");
  const art012 = topicSignature("student-travel-medical-insurance-studying-abroad", "compare-student-travel-medical-plans-semester-year-abroad");
  assert.ok(signatureCollision(student, art012));
});

test("signature: generic comparison topic collides with the forbidden list", () => {
  const cand = topicSignature("How to Use Travel Insurance Comparison Sites Effectively", "Compare multiple travel insurance quotes without overpaying or under-covering");
  const forbidden = topicSignature(DUPLICATE_FORBIDDEN_TOPICS[1]);
  assert.ok(signatureCollision(cand, forbidden));
});

test("signature: distinct topics in the same cluster are NOT duplicates", () => {
  const pairs = [
    // domestic health insurance abroad vs. the travel-medical comparison post
    ["Does Your Health Insurance Cover You Abroad? What to Know", "Verify whether domestic health insurance applies overseas and fill the gaps",
     "Travel Medical Insurance vs. Trip Insurance: Which Coverage Fits an International Trip?", "travel-medical-insurance-vs-trip-insurance"],
    // general evacuation guide vs. the cruise-specific one
    ["How Medical Evacuation Coverage Works on an International Trip", "Learn when medical evacuation is needed and how benefit limits apply abroad",
     "Cruise Travel Insurance: How to Compare Medical Evacuation Coverage", "compare-cruise-medical-evacuation-coverage"],
    // hurricane-timing vs. the generic comparison post
    ["when to buy travel insurance for hurricane season", "hurricane-season-travel-insurance-purchase-timing",
     "Travel Insurance for International Trips: What to Compare First", "best-travel-insurance-for-international-trips"],
  ];
  for (const [t1, i1, t2, i2] of pairs) {
    assert.equal(signatureCollision(topicSignature(t1, i1), topicSignature(t2, i2)), null, `${t1} vs ${t2}`);
  }
});

test("duplicate index covers articles, existing jobs and duplicateForbidden", () => {
  const index = buildDuplicateIndex({ articles, jobs });
  assert.ok(index.some((e) => e.source === "article" && e.id === "art_011"));
  assert.ok(index.some((e) => e.source === "job"));
  assert.ok(index.some((e) => e.source === "duplicateForbidden"));
  for (const title of DUPLICATES) {
    assert.ok(findSemanticDuplicate({ title }, index), `${title} must be caught by the index`);
  }
});

test("recommendations: the three confirmed duplicates never reach the screen", () => {
  const titles = build().candidates.map((c) => c.title);
  for (const dup of DUPLICATES) assert.ok(!titles.includes(dup), `${dup} is still recommended`);
});

test("recommendations: emptied slots are refilled from unused candidates", () => {
  const rec = build();
  const filled = rec.candidates.filter((c) => c.origin === "money-hunter-unused");
  assert.ok(filled.length > 0, "the duplicate gate must be refilled from keywords.json");
  for (const c of filled) {
    assert.match(c.moneyHunterId, /^kw_/);
    assert.ok(c.keyword, "the keyword is carried verbatim");
    assert.equal(c.eligibility.canGenerate, true);
  }
  // The refill puts the batch back toward the display limit; it can never exceed it.
  assert.ok(rec.candidates.length <= 10, `n=${rec.candidates.length}`);
  assert.ok(rec.candidates.every((c, i) => c.priority === i + 1));
});

// The original defect case, frozen as a fixture: kw_023 has since been written
// and published as art_014, so live data can no longer reproduce it — and the
// engine must now reject it for exactly that reason (asserted below).
test("kw_023 was refilled into the batch before it became an article", () => {
  const before = buildRecommendations({
    keywords: keywordsWithKw023Unused,
    articles: articles.filter((a) => a.id !== "art_014"),
    categories,
    jobs: jobsWithoutKw023,
    liveData: false,
  });
  const kw023 = before.candidates.find((c) => c.moneyHunterId === "kw_023");
  assert.ok(kw023, "kw_023 must be recommended while unused");
  assert.equal(kw023.keyword, "when to buy travel insurance for hurricane season");
  assert.equal(kw023.origin, "money-hunter-unused");
  assert.equal(kw023.eligibility.canGenerate, true);
  assert.equal(before.candidates.length, 10);
});

test("once published as art_014, the same topic is never recommended again", () => {
  const rec = unusedState();
  assert.ok(!rec.candidates.some((c) => c.moneyHunterId === "kw_023"), "published topic must stay off the screen");
  assert.equal(assertProductionEligible({ title: "When to Buy Travel Insurance for Hurricane Season", contentAxis: { id: "international-travel-insurance" } }, articles).ok, false);
});

test("recommendations: a used Money Hunter candidate is never refilled", () => {
  const used = new Set(jobs.map((j) => j.moneyHunterId).filter(Boolean));
  const offered = build().candidates.map((c) => c.moneyHunterId).filter(Boolean);
  assert.ok(offered.length > 0, "refill must still produce cards");
  for (const id of offered) assert.ok(!used.has(id), `${id} is already used by a job`);
  // kw_023 was taken by a production job, so the next batch offers the next
  // unused candidate instead of repeating it.
  if (used.has("kw_023")) assert.ok(!offered.includes("kw_023"));
});

test("recommendations: no two cards in one batch are the same topic", () => {
  const cards = build().candidates;
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = topicSignature(cards[i].title, cards[i].searchIntent);
      const b = topicSignature(cards[j].title, cards[j].searchIntent);
      assert.equal(signatureCollision(a, b), null, `${cards[i].title} vs ${cards[j].title}`);
    }
  }
});

test("server gate blocks a duplicate payload even if the UI is bypassed", () => {
  const senior = {
    title: "Choosing Travel Medical Insurance for Senior Travelers",
    searchIntent: "Find age-appropriate travel medical coverage and pre-existing condition rules",
    contentAxis: { id: "traveler-segment-coverage" },
  };
  const gate = assertProductionEligible(senior, articles);
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /핵심 주제 중복/);
});

test("server gate still allows every card the engine produced", () => {
  for (const c of build().candidates) {
    assert.equal(assertProductionEligible(c, articles).ok, true, c.title);
  }
});

test("handoff request for a refilled card selects that Money Hunter candidate", () => {
  const card = buildRecommendations({
    keywords: keywordsWithKw023Unused,
    articles: articles.filter((a) => a.id !== "art_014"),
    categories,
    jobs: jobsWithoutKw023,
    liveData: false,
  }).candidates.find((c) => c.moneyHunterId === "kw_023");
  const candidate = buildRecommendationCandidate(card);
  assert.equal(candidate.id, "kw_023");
  const req = buildHandoffRequest({
    jobId: "pjob_test",
    blog: { id: "blog_001", name: "ATLAS Money Blog 01" },
    candidate,
    existingArticles: articles,
    unusedCandidates: [],
  });
  assert.equal(req.selectedCandidate.moneyHunterId, "kw_023");
  assert.equal(req.selectedCandidate.keyword, "when to buy travel insurance for hurricane season");
  // No invented number: Money Hunter recorded no score for this candidate.
  assert.equal(req.selectedCandidate.moneyScore, null);
});

test("an editorial card without a Money Hunter id keeps its topic-derived id", () => {
  const candidate = buildRecommendationCandidate({ title: "A Pre-Trip Safety Checklist for International Travelers" });
  assert.equal(candidate.id, "rec_a-pre-trip-safety-checklist-for-international-travelers");
});
