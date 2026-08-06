import test from "node:test";
import assert from "node:assert/strict";
import {
  pickDailyKeyword, buildContentBrief, buildPromptText, prepareDailyBrief,
  ARTICLE_SECTIONS, BRIEF_SCHEMA,
} from "./daily-brief.js";

const ARTICLES = [
  {
    id: "art_010", title: "Emergency Medical Evacuation Insurance for Remote Travel", slug: "emergency-evacuation",
    keyword: "medical evacuation remote travel", status: "published",
    publishedUrl: "https://atlas-money-2026.blogspot.com/2026/08/emergency-medical-evacuation-insurance.html",
    searchIntentKey: "evacuation-policy-selection", topicEntities: ["medical evacuation"], coreQuestion: "What does evacuation cover?",
  },
  {
    id: "art_009", title: "Cruise Travel Insurance: How to Compare Medical Evacuation Coverage", slug: "cruise-travel-insurance",
    keyword: "cruise medical evacuation", status: "published",
    publishedUrl: "https://atlas-money-2026.blogspot.com/2026/07/cruise-travel-insurance-how-to-compare.html",
    searchIntentKey: "cruise-coverage-comparison", topicEntities: ["cruise"], coreQuestion: "How do cruise policies differ?",
  },
  {
    id: "art_004", title: "What to Do If You Get Sick While Traveling Abroad", slug: "sick-abroad",
    keyword: "sick while traveling abroad", status: "published",
    publishedUrl: "https://atlas-money-2026.blogspot.com/2026/07/what-to-do-if-you-get-sick-while-traveling-abroad.html",
    searchIntentKey: "care-access-abroad", topicEntities: ["clinic"], coreQuestion: "Where do I get care?",
  },
];

const KEYWORDS = [
  { id: "kw_020", keyword: "flight delay compensation for us travelers", category: "travel", intent: "informational", moneyScore: 55, status: "idea" },
  { id: "kw_021", keyword: "delayed baggage claim rules", category: "travel", intent: "informational", moneyScore: 71, status: "idea" },
  { id: "kw_022", keyword: "korean skincare routine", category: "K-Beauty", intent: "commercial", moneyScore: 99, status: "idea" },
  { id: "kw_023", keyword: "cruise medical evacuation", category: "travel insurance", intent: "informational", moneyScore: 88, status: "idea" },
  { id: "kw_024", keyword: "travel safety tips", category: "travel", intent: "informational", moneyScore: 40, status: "written" },
];

test("pickDailyKeyword returns the highest-scoring eligible keyword", () => {
  const r = pickDailyKeyword({ keywords: KEYWORDS, articles: ARTICLES, usedKeywordIds: [] });
  assert.equal(r.ok, true);
  assert.equal(r.keyword.id, "kw_021", "kw_023 outscores it but duplicates art_009");
});

test("pickDailyKeyword rejects off-niche, used, already-written and duplicate keywords", () => {
  const r = pickDailyKeyword({ keywords: KEYWORDS, articles: ARTICLES, usedKeywordIds: ["kw_021"] });
  assert.equal(r.keyword.id, "kw_020");

  const reasons = Object.fromEntries(r.skipped.map((s) => [s.id, s.reason]));
  assert.match(reasons.kw_022, /niche/, "K-Beauty is out of Blog 01 niche");
  assert.match(reasons.kw_024, /상태 written/);
  assert.match(reasons.kw_021, /이미 사용된/);
  assert.ok(reasons.kw_023, "the cruise evacuation duplicate is skipped with a reason");
});

test("pickDailyKeyword fails honestly when nothing is available", () => {
  const r = pickDailyKeyword({ keywords: [], articles: ARTICLES });
  assert.equal(r.ok, false);
  assert.match(r.reason, /사용 가능한 미사용 키워드가 없습니다/);
  assert.equal(r.keyword, undefined, "never invents a topic");
});

test("buildContentBrief carries the cluster, the sections and only real link targets", () => {
  const brief = buildContentBrief({ keyword: KEYWORDS[1], articles: ARTICLES });
  assert.equal(brief.schemaVersion, BRIEF_SCHEMA);
  assert.equal(brief.cluster, "baggage");
  assert.deepEqual(brief.sections.map((s) => s.id), ARTICLE_SECTIONS.map((s) => s.id));
  assert.ok(brief.internalLinkTargets.length >= 2);
  const liveUrls = new Set(ARTICLES.map((a) => a.publishedUrl));
  assert.ok(brief.internalLinkTargets.every((l) => liveUrls.has(l.url)), "every target is a real live URL");
});

test("buildContentBrief offers no link targets when nothing is published yet", () => {
  const brief = buildContentBrief({ keyword: KEYWORDS[0], articles: [] });
  assert.deepEqual(brief.internalLinkTargets, [], "an empty blog produces zero links, not invented ones");
});

test("the prompt embeds every enforced rule and only real URLs", () => {
  const brief = buildContentBrief({ keyword: KEYWORDS[1], articles: ARTICLES });
  const prompt = buildPromptText({ brief, jobId: "pjob_005", existingTitles: ARTICLES.map((a) => a.title) });

  for (const heading of ["Quick Answer", "The Money at Risk", "What to Do Before You Travel", "Common Mistakes", "FAQ", "Sources & References", "Related ATLAS Guides"]) {
    assert.ok(prompt.includes(heading), `prompt must require the ${heading} section`);
  }
  assert.match(prompt, /1,700-2,100 words/);
  assert.match(prompt, /150-160 characters/);
  assert.match(prompt, /No affiliate links/);
  assert.match(prompt, /Invent NOTHING/);
  assert.match(prompt, /never a guarantee/);
  assert.match(prompt, /atlas-package\/1/);
  assert.match(prompt, /pjob_005/);

  const urls = prompt.match(/https:\/\/atlas-money-2026\.blogspot\.com\/\S+/g) || [];
  const live = new Set(ARTICLES.map((a) => a.publishedUrl));
  assert.ok(urls.length > 0);
  assert.ok(urls.every((u) => live.has(u)), "the prompt never shows a URL that is not live");
});

test("prepareDailyBrief returns keyword + brief + one copy-pasteable prompt", () => {
  const r = prepareDailyBrief({ keywords: KEYWORDS, articles: ARTICLES, jobId: "pjob_007" });
  assert.equal(r.ok, true);
  assert.equal(r.keyword.id, "kw_021");
  assert.equal(r.brief.keywordId, "kw_021");
  assert.ok(r.promptText.length > 1000);
  assert.equal(r.internalLinkCount, r.brief.internalLinkTargets.length);
});

test("prepareDailyBrief reports the blocker instead of producing a brief", () => {
  const r = prepareDailyBrief({ keywords: [KEYWORDS[2]], articles: ARTICLES });
  assert.equal(r.ok, false);
  assert.ok(r.reason);
  assert.equal(r.promptText, undefined);
});
