import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBackfillPlan, verifyBackfillItem, applyRelatedBlock, stripRelatedBlock, hasRelatedBlock,
} from "./seo-backfill.js";

const post = (id, title, keyword, slug, extra = {}) => ({
  id, title, keyword, slug, status: "published",
  publishedUrl: `https://atlas-money-2026.blogspot.com/2026/07/${slug}.html`,
  bloggerPostId: `${id}-post`,
  metaDescription: `Real stored description for ${title}.`,
  bodyHtml: `<h2>Intro</h2><p>Original prose for ${id} that must never be rewritten.</p>`,
  tags: [],
  ...extra,
});

const CORPUS = [
  post("art_002", "Travel Insurance for International Trips", "travel insurance comparison", "best-travel-insurance"),
  post("art_004", "What to Do If You Get Sick While Traveling Abroad", "sick while traveling", "sick-abroad"),
  post("art_009", "Cruise Travel Insurance: Medical Evacuation Coverage", "cruise medical evacuation", "cruise-travel-insurance"),
  post("art_010", "Emergency Medical Evacuation Insurance", "medical evacuation remote travel", "emergency-evacuation"),
  { id: "art_007", title: "Unpublished", slug: "draft", status: "written", publishedUrl: "", bodyHtml: "<p>x</p>", metaDescription: "d" },
];

test("the plan covers only live posts and skips unpublished drafts", () => {
  const plan = buildBackfillPlan({ articles: CORPUS });
  assert.equal(plan.total, 4);
  assert.ok(!plan.items.some((i) => i.articleId === "art_007"));
  assert.ok(!plan.skipped.some((s) => s.articleId === "art_007"));
});

test("only meta description, labels and the Related block change — prose is byte-identical", () => {
  const plan = buildBackfillPlan({ articles: CORPUS });
  for (const item of plan.items) {
    const original = CORPUS.find((a) => a.id === item.articleId);
    assert.equal(stripRelatedBlock(item.bodyHtml), stripRelatedBlock(original.bodyHtml), "existing prose untouched");
    assert.ok(item.metaDescription.length > 0);
    assert.ok(item.labels.length >= 2 && item.labels.length <= 4);
    assert.equal(item.publishedUrl, original.publishedUrl, "public URL never changes");
    assert.ok(!Object.prototype.hasOwnProperty.call(item, "title") || item.title === original.title);
  }
});

test("internal links only ever point at real published URLs", () => {
  const liveUrls = new Set(CORPUS.filter((a) => a.publishedUrl).map((a) => a.publishedUrl));
  for (const item of buildBackfillPlan({ articles: CORPUS }).items) {
    assert.ok(item.internalLinks.length >= 2);
    assert.ok(item.internalLinks.every((l) => liveUrls.has(l.url)), "no invented URL");
    assert.ok(item.internalLinks.every((l) => l.articleId !== item.articleId), "never links to itself");
  }
});

test("re-running the plan never stacks a second Related block", () => {
  const first = buildBackfillPlan({ articles: CORPUS });
  const applied = CORPUS.map((a) => {
    const item = first.items.find((i) => i.articleId === a.id);
    return item ? { ...a, bodyHtml: item.bodyHtml } : a;
  });

  const second = buildBackfillPlan({ articles: applied });
  for (const item of second.items) {
    assert.equal((item.bodyHtml.match(/atlas-related/g) || []).length, 1, "exactly one Related block");
  }
  for (const a of applied) {
    if (a.bodyHtml) assert.ok((a.bodyHtml.match(/atlas-related/g) || []).length <= 1);
  }
});

test("applyRelatedBlock replaces rather than appends, and skips an empty list", () => {
  const body = "<h2>H</h2><p>Prose.</p>";
  const once = applyRelatedBlock(body, [{ url: "https://b.com/a.html", title: "A" }]);
  assert.equal(hasRelatedBlock(once), true);

  const twice = applyRelatedBlock(once, [{ url: "https://b.com/b.html", title: "B" }]);
  assert.equal((twice.match(/atlas-related/g) || []).length, 1);
  assert.match(twice, /b\.html/);
  assert.ok(!twice.includes("a.html"));
  assert.equal(stripRelatedBlock(twice), body);

  assert.equal(applyRelatedBlock(body, []), body, "no links => body returned unchanged");
});

test("a post with no stored meta description is blocked, never auto-written", () => {
  const corpus = CORPUS.map((a) => (a.id === "art_004" ? { ...a, metaDescription: "" } : a));
  const plan = buildBackfillPlan({ articles: corpus });
  const skipped = plan.skipped.find((s) => s.articleId === "art_004");
  assert.ok(skipped, "art_004 must be skipped");
  assert.match(skipped.reason, /사람이 직접 작성/);
  assert.ok(!plan.items.some((i) => i.articleId === "art_004"));
});

test("an over-long stored description is trimmed, never a fabricated one", () => {
  const long = `${"word ".repeat(60)}tail`;
  const corpus = CORPUS.map((a) => (a.id === "art_002" ? { ...a, metaDescription: long } : a));
  const item = buildBackfillPlan({ articles: corpus }).items.find((i) => i.articleId === "art_002");
  assert.ok(item.metaDescription.length <= 160);
  assert.ok(long.startsWith(item.metaDescription.slice(0, 30)), "the trimmed text is a prefix of the original");
  assert.ok(item.changes.some((c) => /절삭/.test(c)));
});

test("a short stored description is applied as-is with a warning, not padded", () => {
  const item = buildBackfillPlan({ articles: CORPUS }).items[0];
  assert.ok(item.metaDescription.length < 150);
  assert.ok(item.warnings.some((w) => /짧습니다/.test(w)));
  assert.equal(item.ok, true, "short but real still beats none");
});

test("a blog with too few live posts blocks instead of inventing link targets", () => {
  const tiny = [CORPUS[0], CORPUS[1]];
  const plan = buildBackfillPlan({ articles: tiny });
  assert.equal(plan.updatable, 0);
  assert.equal(plan.skipped.length, 2);
  assert.ok(plan.skipped.every((s) => /연결 가능한 공개 글/.test(s.reason)));
});

test("articleIds narrows the plan to the requested posts", () => {
  const plan = buildBackfillPlan({ articles: CORPUS, articleIds: ["art_009"] });
  assert.equal(plan.total, 1);
  assert.equal(plan.items[0].articleId, "art_009");
});

test("verifyBackfillItem catches drift between planning and execution", () => {
  const item = buildBackfillPlan({ articles: CORPUS }).items.find((i) => i.articleId === "art_009");
  const article = CORPUS.find((a) => a.id === "art_009");
  assert.equal(verifyBackfillItem(item, article).ok, true);

  assert.equal(verifyBackfillItem(item, null).ok, false);
  assert.equal(verifyBackfillItem(item, { ...article, bloggerPostId: "" }).ok, false);
  assert.equal(verifyBackfillItem(item, { ...article, publishedUrl: "https://other.example/x.html" }).ok, false);
  assert.equal(verifyBackfillItem(item, { ...article, bodyHtml: "<p>rewritten in the meantime</p>" }).ok, false);
});

test("the plan states its safety guarantees for the operator", () => {
  const plan = buildBackfillPlan({ articles: CORPUS });
  assert.ok(plan.guarantees.some((g) => /재발행하거나 삭제하지 않습니다/.test(g)));
  assert.ok(plan.guarantees.some((g) => /publishedUrl만 사용/.test(g)));
});
