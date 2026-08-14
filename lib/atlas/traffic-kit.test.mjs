// 6단계 트래픽 배포 — the promotion material must be built from the article's own
// text, must differ per variant, and must never turn "미입력" into 0. Runs
// against the REAL data/atlas fixtures (read-only) plus synthetic cases.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildTrafficKit,
  buildVariants,
  buildInternalLinkCandidates,
  sectionItems,
  leadClause,
  addDays,
  normalizeMetrics,
  normalizeSearchCheck,
  normalizePostState,
  isValidPinUrl,
  nextUnposted,
  withPostingDefaults,
  upsertRecord,
  emptyRecord,
  VARIANT_OFFSET_DAYS,
} from "./traffic-kit.js";

const DATA = path.join(process.cwd(), "data", "atlas");
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf-8"));
const articles = read("articles.json").articles || [];
const article = articles.find((a) => a.id === "art_014");
const storedKit = (read("pinterest-kits.json").kits || []).find((k) => k.articleId === "art_014") || null;

const NOW = new Date("2026-08-15T00:00:00.000Z");
const kitOf = () => buildTrafficKit({ article, articles, storedKit, now: NOW }).kit;

test("art_014 is a published article with a live URL", () => {
  assert.equal(article.publishState, "published");
  assert.match(article.publishedUrl, /^https:\/\//);
});

test("an unpublished article gets no promotion material", () => {
  const draft = { id: "art_x", title: "Draft", status: "written", publishState: "written", publishedUrl: "" };
  const res = buildTrafficKit({ article: draft, articles, now: NOW });
  assert.equal(res.ok, false);
  assert.match(res.reason, /발행/);
  assert.equal(res.kit, null);
});

test("three Pinterest variants are produced with the required fields", () => {
  const kit = kitOf();
  assert.equal(kit.variants.length, 3);
  assert.deepEqual(kit.variants.map((v) => v.id), ["question", "mistake", "checklist"]);
  for (const v of kit.variants) {
    assert.ok(v.title && v.title.length <= 100, `title: ${v.title}`);
    assert.ok(v.overlay, "overlay");
    assert.ok(v.description.length >= 100, `description too short: ${v.description.length}`);
    assert.ok(v.description.length <= 500, `description too long: ${v.description.length}`);
    assert.ok(v.hashtags.length > 0);
    assert.equal(v.link, article.publishedUrl);
    assert.ok(v.image?.url, "pin image");
    assert.ok(v.suggestedDate);
  }
});

test("the three variants are genuinely different, not the same copy repeated", () => {
  const kit = kitOf();
  for (const field of ["title", "overlay", "description"]) {
    const values = kit.variants.map((v) => v[field].toLowerCase().trim());
    assert.equal(new Set(values).size, 3, `${field} repeats: ${JSON.stringify(values)}`);
  }
  // Different source images too, when the article has five of them.
  const images = kit.variants.map((v) => v.image.url);
  assert.equal(new Set(images).size, 3);
});

test("variant copy comes from the article's own text — no invented claims", () => {
  const kit = kitOf();
  const body = String(article.bodyHtml || article.bodyMarkdown || "").toLowerCase();
  const haystack = `${body} ${article.title} ${article.metaDescription} ${article.coreQuestion} ${article.desiredReaderAction}`.toLowerCase();
  for (const v of kit.variants) {
    const probe = leadClause(v.overlay).toLowerCase().split(" ").slice(0, 4).join(" ");
    assert.ok(haystack.includes(probe), `overlay not traceable to the article: ${v.overlay}`);
  }
  // No price, guarantee or testimonial language may be introduced.
  for (const v of kit.variants) {
    const text = `${v.title} ${v.overlay} ${v.description}`;
    assert.doesNotMatch(text, /\$\d|guaranteed|100%|cheapest|best price|5 stars|reviewers say/i);
  }
});

test("the existing Pinterest kit is reused as variant 1 (backward compatible)", () => {
  const kit = kitOf();
  const first = kit.variants[0];
  assert.equal(first.reusedStoredKit, true);
  assert.equal(first.title, storedKit.title);
  assert.equal(first.overlay, storedKit.hook);
  assert.equal(first.description, storedKit.description);
  assert.equal(first.image.url, storedKit.image.url);
});

test("without a stored kit the first variant is built from the article itself", () => {
  const { variants } = buildVariants({ article, storedKit: null, now: NOW });
  assert.equal(variants[0].reusedStoredKit, false);
  assert.ok(variants[0].image.url.includes("res.cloudinary.com"));
});

test("suggested dates are today / +4 days / +9 days", () => {
  const kit = kitOf();
  assert.deepEqual(VARIANT_OFFSET_DAYS, [0, 4, 9]);
  assert.deepEqual(
    kit.variants.map((v) => v.suggestedDate),
    ["2026-08-15", "2026-08-19", "2026-08-24"],
  );
});

test("7일 · 30일 check dates are anchored to the publish date", () => {
  const kit = kitOf();
  assert.equal(kit.checkDates.published, article.publishedAt.slice(0, 10));
  assert.equal(kit.checkDates.day7, addDays(article.publishedAt, 7));
  assert.equal(kit.checkDates.day30, addDays(article.publishedAt, 30));
});

test("internal link candidates are real published guides, capped at 3, never self", () => {
  const kit = kitOf();
  assert.ok(kit.internalLinks.length > 0 && kit.internalLinks.length <= 3);
  for (const c of kit.internalLinks) {
    assert.notEqual(c.articleId, "art_014");
    const target = articles.find((a) => a.id === c.articleId);
    assert.equal(c.url, target.publishedUrl);
    assert.equal(target.publishState, "published");
    assert.ok(c.anchor && c.sentence);
    assert.ok(c.html.includes(`href="${article.publishedUrl}"`), "snippet must point at the new article");
  }
});

test("an unrelated corpus yields no forced link suggestions", () => {
  const unrelated = [
    { id: "art_zz", title: "Korean Skincare Routine for Winter", keyword: "korean skincare", status: "published", publishState: "published", publishedUrl: "https://example.org/skincare" },
  ];
  const links = buildInternalLinkCandidates({ article, articles: unrelated });
  assert.equal(links.length, 0);
});

test("sectionItems reads a MASTER section, and leadClause cuts at the first clause", () => {
  const html = "<h2>Common Mistakes</h2><ul><li>Waiting until a storm is named to buy coverage — claims are then denied.</li></ul><h2>FAQ</h2><ul><li>ignored</li></ul>";
  const items = sectionItems(html, /common mistakes/i);
  assert.equal(items.length, 1);
  assert.match(items[0], /^Waiting until a storm is named/);
  assert.equal(leadClause(items[0]), "Waiting until a storm is named to buy coverage");
  assert.deepEqual(sectionItems(html, /nonexistent/i), []);
});

test("metrics: blank fields stay 미입력(null) and are never recorded as 0", () => {
  const { ok, metrics } = normalizeMetrics({ pins: { question: { impressions: "120", saves: "", pinClicks: null, outboundClicks: 4 } } });
  assert.equal(ok, true);
  assert.equal(metrics.pins.question.impressions, 120);
  assert.equal(metrics.pins.question.saves, null);
  assert.equal(metrics.pins.question.pinClicks, null);
  assert.equal(metrics.pins.question.outboundClicks, 4);
  // A variant with nothing typed stays entirely 미입력.
  assert.equal(metrics.pins.mistake, null);
  assert.equal(metrics.google, null);
});

test("metrics reject negative or non-numeric input instead of storing junk", () => {
  const bad = normalizeMetrics({ pins: { question: { impressions: "-5" } } });
  assert.equal(bad.ok, false);
  const worse = normalizeMetrics({ google: { clicks: "many" } });
  assert.equal(worse.ok, false);
});

test("having a stored Pinterest kit never counts as having posted it", () => {
  const kit = kitOf();
  for (const v of kit.variants) assert.equal(v.posting, null, `${v.id} must start 등록 전`);
  assert.equal(kit.variants[0].reusedStoredKit, true, "kit is reused…");
  assert.equal(kit.variants[0].posting, null, "…but that is not a posting claim");
  assert.equal(emptyRecord("art_014").posted.question, null);
});

test("a posted variant is carried onto the card and drops out of the next-up hint", () => {
  const record = {
    ...emptyRecord("art_014"),
    posted: { question: { posted: true, postedAt: "2026-08-14", pinUrl: "https://www.pinterest.com/pin/123/" }, mistake: null, checklist: null },
  };
  const { kit } = buildTrafficKit({ article, articles, storedKit, record, now: NOW });
  assert.equal(kit.variants[0].posting.posted, true);
  assert.equal(kit.variants[0].posting.pinUrl, "https://www.pinterest.com/pin/123/");
  assert.equal(kit.variants[1].posting, null);
  assert.deepEqual(kit.nextUnposted, { id: "mistake", order: 2, label: "실수·경고형", suggestedDate: "2026-08-19" });
});

test("nextUnposted is null only once all three are marked", () => {
  const { kit } = buildTrafficKit({ article, articles, storedKit, now: NOW });
  assert.equal(kit.nextUnposted.id, "question", "nothing posted yet → the first pin is next");
  const all = { question: { posted: true }, mistake: { posted: true }, checklist: { posted: true } };
  assert.equal(nextUnposted(kit.variants, all), null);
});

// The save bug: withPostingDefaults() returns a COPY, so mutating it and only
// pushing "when the record does not exist yet" wrote nothing for an article that
// already had a record — the API answered ok while traffic.json kept the old
// value, and the card fell back to 등록 전 on reload.
test("saving an existing record replaces it instead of silently dropping the change", () => {
  const stored = [{ ...emptyRecord("art_014"), search: { status: "indexed", checkedAt: "2026-08-15", note: "" } }];
  const edited = withPostingDefaults(stored[0]);
  edited.posted.question = { posted: true, postedAt: "2026-08-15", pinUrl: "https://kr.pinterest.com/pin/1/" };

  const next = upsertRecord(stored, edited);
  assert.equal(next.length, 1, "no duplicate record for the same article");
  assert.equal(next[0].posted.question.posted, true, "the edit must survive the write");
  assert.equal(next[0].search.status, "indexed", "unrelated fields are kept");
  // 새 글이면 추가된다.
  const added = upsertRecord(next, emptyRecord("art_013"));
  assert.equal(added.length, 2);
  assert.deepEqual(added.map((r) => r.articleId), ["art_014", "art_013"]);
});

test("a saved posting survives a reload of the stored record", () => {
  const record = withPostingDefaults(emptyRecord("art_014"));
  record.posted.question = normalizePostState(
    { posted: true, postedAt: "2026-08-15", pinUrl: "https://kr.pinterest.com/pin/1087830485023271689/" },
    { now: NOW },
  ).state;
  const stored = upsertRecord([], record);
  // GET이 하는 일과 같은 경로: 저장된 기록으로 자료를 다시 만든다.
  const { kit } = buildTrafficKit({ article, articles, storedKit, record: stored[0], now: NOW });
  assert.equal(kit.variants[0].posting.posted, true);
  assert.equal(kit.variants[0].posting.postedAt, "2026-08-15");
  assert.equal(kit.variants[0].posting.pinUrl, "https://kr.pinterest.com/pin/1087830485023271689/");
  assert.equal(kit.variants[1].posting, null);
  assert.equal(kit.variants[2].posting, null);
  assert.equal(kit.nextUnposted.id, "mistake");
  assert.equal(kit.nextUnposted.suggestedDate, "2026-08-19");
});

test("pin URL is optional but validated when given", () => {
  assert.equal(isValidPinUrl(""), true);
  assert.equal(isValidPinUrl("https://www.pinterest.com/pin/123/"), true);
  assert.equal(isValidPinUrl("pinterest.com/pin/123"), false);
  assert.equal(normalizePostState({ posted: true, pinUrl: "not a url" }).ok, false);
  const empty = normalizePostState({ posted: true, pinUrl: "" }, { now: NOW });
  assert.equal(empty.ok, true);
  assert.equal(empty.state.pinUrl, "");
  assert.equal(empty.state.postedAt, "2026-08-15", "defaults to today when no date is typed");
  assert.equal(normalizePostState({ posted: true, postedAt: "2026-08-10" }).state.postedAt, "2026-08-10");
});

test("cancelling a completion clears the flag, not the article or the record", () => {
  const cancelled = normalizePostState({ posted: false });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.state, null);
  // 예전 형식(게시 상태 필드가 없던 기록)도 그대로 읽힌다.
  const legacy = withPostingDefaults({ articleId: "art_014", search: { status: "indexed" }, metrics: {} });
  assert.deepEqual(legacy.posted, { question: null, mistake: null, checklist: null });
  assert.deepEqual(legacy.postLog, []);
  assert.equal(legacy.search.status, "indexed", "existing 색인 기록은 보존된다");
});

test("search check never auto-claims indexing", () => {
  const fresh = emptyRecord("art_014");
  assert.equal(fresh.search.status, "unchecked");
  assert.equal(normalizeSearchCheck({ status: "definitely-indexed" }).status, "unchecked");
  assert.equal(normalizeSearchCheck({ status: "unchecked", checkedAt: "2026-08-15" }).checkedAt, "");
  const done = normalizeSearchCheck({ status: "indexed", note: "URL 검사 완료" }, { now: NOW });
  assert.equal(done.status, "indexed");
  assert.equal(done.checkedAt, "2026-08-15");
  assert.equal(done.note, "URL 검사 완료");
});
