import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVAL_TTL_MS,
  CONFIRM_PHRASE,
  buildReviewPacket,
  intentsOf,
  recentPosts,
  topicSimilarity,
  userApprovalIssues,
} from "./publish-review.js";

const RECENT = [
  { id: "a5", title: "Lost Your Passport Abroad? The Order You Do Things In", keyword: "lost passport abroad", category: "Travel Safety", publishedAt: "2026-09-23T03:00:00Z" },
  { id: "a4", title: "Credit Card Travel Insurance: Is It Enough?", keyword: "credit card travel insurance", category: "Travel Insurance", publishedAt: "2026-09-20T09:00:00Z" },
  { id: "a3", title: "eSIM vs Roaming for a Two-Week Trip", keyword: "esim vs roaming", category: "Connectivity", publishedAt: "2026-09-18T09:00:00Z" },
];
const PASS = { status: "pass", similarity: 0.7, threshold: 0.5 };

function candidate(overrides = {}) {
  return { id: "new", title: "How to Pack a Carry-On for a Week", keyword: "carry-on packing", category: "Packing", excerpt: "One bag, seven days.",
    quickAnswer: "Pack light.", bodyMarkdown: "## Plan\nCheck the bag.", faq: [{ question: "How?", answer: "Carefully." }],
    sources: [{ title: "Airline", url: "https://example.com/rules" }], comparisonCriteria: ["size"], ...overrides };
}

const COMPLETE_IMAGES = ["featured", "context", "comparison", "checklist", "closing"]
  .map((role) => ({ role, src: `https://res.cloudinary.com/x/${role}.png`, ready: true, faceMatch: PASS }));
function packet(record = candidate(), images = COMPLETE_IMAGES) {
  return buildReviewPacket({ channel: "global", record, images, recent: RECENT, faceRequired: true });
}

test("recentPosts keeps the newest five with a publish date", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, title: `t${i}`, publishedAt: `2026-09-0${i + 1}T00:00:00Z` }));
  const recent = recentPosts([...many, { id: "undated", title: "x" }]);
  assert.deepEqual(recent.map((p) => p.id), ["p7", "p6", "p5", "p4", "p3"]);
  assert.equal(recentPosts(many, { excludeId: "p7" })[0].id, "p6");
});

test("passport / insurance / travel-document intent overlapping a recent post blocks and asks for a new topic", () => {
  assert.ok(intentsOf({ title: "Passport Validity Rules" }).includes("travel_documents"));
  const passport = topicSimilarity(candidate({ title: "Passport Validity Rules Before You Book", keyword: "passport validity rules" }), RECENT);
  assert.equal(passport.blocking.length, 1);
  assert.match(passport.blocking[0], /신규 주제로 교체/);

  const insurance = topicSimilarity(candidate({ title: "How to File a Travel Insurance Claim", keyword: "travel insurance claim" }), RECENT);
  assert.ok(insurance.blocking.length >= 1);

  const packing = topicSimilarity(candidate(), RECENT);
  assert.deepEqual(packing.blocking, []);
});

test("same category as the latest post is a warning, not a block", () => {
  const r = topicSimilarity(candidate({ title: "Night Train Safety Tips", keyword: "night train safety", category: "Travel Safety" }), RECENT);
  assert.deepEqual(r.blocking, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /같은 카테고리/);
});

test("Korean intents: a humidity guide is distinct from recent Chuseok/kitchen posts", () => {
  const koreaRecent = [
    { id: "k1", title: "추석 선물 고르기, 가격대보다 먼저 정해야 하는 세 가지", keyword: "추석 선물 고르는 법", publishedAt: "2026-09-23T00:00:00Z" },
    { id: "k2", title: "필립스 3000 시리즈 전기주전자, 매일 쓰기 좋은 이유와 아쉬운 점", publishedAt: "2026-09-20T00:00:00Z" },
  ];
  assert.deepEqual(topicSimilarity({ title: "환절기 집안 습도 관리", keyword: "환절기 습도 관리" }, koreaRecent).blocking, []);
  assert.equal(topicSimilarity({ title: "추석 선물 세트 비교", keyword: "추석 선물세트" }, koreaRecent).blocking.length, 1);
});

test("character face review failure blocks the packet", () => {
  assert.deepEqual(packet().blocking, []);
  const failed = packet(candidate(), [{ role: "featured", src: "x", faceMatch: { status: "fail", reason: "differs" } }]);
  assert.ok(failed.blocking.some((issue) => /얼굴 검수/.test(issue)));
  const missing = packet(candidate(), [{ role: "featured", src: "x", faceMatch: null }]);
  assert.ok(missing.blocking.some((issue) => /얼굴 검수/.test(issue)), "해외는 얼굴 검수 기록이 없으면 막는다");
  const korea = buildReviewPacket({ channel: "korea", record: candidate(), images: ["info_why", "info_how", "info_checklist"].map((role) => ({ role, src: role, ready: true })), recent: [], faceRequired: false });
  assert.deepEqual(korea.blocking, [], "국내는 fail 기록이 있을 때만 막는다");
});

test("국내 이미지의 목표 문단이 본문에 없으면 최종 승인을 막는다", () => {
  const record = { id: "guide", title: "습도 관리", bodyText: "창가를 살펴봅니다.\n\n오늘의 체크리스트\n\n환기합니다.", images: [
    { id: "img_one", role: "one", anchorKeywords: ["오늘의 체크리스트"] },
    { id: "img_two", role: "two", anchorKeywords: ["없는 소제목"] },
  ] };
  const images = record.images.map((image) => ({ role: image.role, src: image.id, ready: true }));
  const result = buildReviewPacket({ channel: "korea", record, images, recent: [] });
  assert.ok(result.blocking.some((issue) => /two: 본문에서 이미지 삽입 문단/.test(issue)));
});

test("no publish without a fresh, unused user approval that matches exactly what the review screen showed", () => {
  const p = packet();
  const now = Date.parse("2026-09-24T10:00:00Z");
  const approved = (extra = {}) => ({ userPublishApproval: { contentHash: p.contentHash, confirm: CONFIRM_PHRASE, approvedAt: new Date(now - 60_000).toISOString(), ...extra } });

  assert.ok(userApprovalIssues({}, p, now).some((i) => /사용자 발행 승인이 없습니다/.test(i)), "승인 없음");
  assert.deepEqual(userApprovalIssues(approved(), p, now), []);
  assert.ok(userApprovalIssues(approved({ contentHash: "other" }), p, now).length, "내용이 바뀌면 다시 검수");
  assert.ok(userApprovalIssues(approved({ usedAt: new Date(now).toISOString() }), p, now).length, "1회용");
  assert.ok(userApprovalIssues(approved({ confirm: "" }), p, now).length, "확인 문구 필수");
  assert.ok(userApprovalIssues(approved({ approvedAt: new Date(now - APPROVAL_TTL_MS - 1).toISOString() }), p, now).length, "만료");

  // 승인이 있어도 차단 사유(유사 주제·얼굴 검수)가 있으면 발행하지 않는다.
  const similar = packet(candidate({ title: "Passport Renewal Before You Book", keyword: "passport renewal" }));
  assert.ok(userApprovalIssues({ userPublishApproval: { contentHash: similar.contentHash, confirm: CONFIRM_PHRASE, approvedAt: new Date(now).toISOString() } }, similar, now).length);
});

test("contentHash changes when the title, summary or any image changes", () => {
  const base = packet().contentHash;
  assert.notEqual(packet(candidate({ title: "Other" })).contentHash, base);
  assert.notEqual(packet(candidate({ excerpt: "Other summary" })).contentHash, base);
  assert.notEqual(packet(candidate(), [{ role: "featured", src: "https://res.cloudinary.com/x/other.png", faceMatch: PASS }]).contentHash, base);
  assert.notEqual(packet(candidate({ bodyMarkdown: "본문이 바뀜" })).contentHash, base);
  assert.ok(packet(candidate(), [...COMPLETE_IMAGES.slice(0, 4), { ...COMPLETE_IMAGES[4], fingerprint: "same-file", src: COMPLETE_IMAGES[0].src }]).blocking.some((i) => /반복/.test(i)));
});

test("국내 제품 글은 가격 근거와 실제 제품 사진이 있어야 승인된다", () => {
  const record = { id: "product", title: "수납 선반", contentType: "new_product_review", bodyText: "확인된 상품 정보", productInfo: {
    currentPrice: 32000, priceSource: "판매 페이지 Offer.price", features: ["인출형"],
  } };
  const scenes = ["info_why", "info_how", "info_checklist"].map((role) => ({ role, src: role, ready: true }));
  const missingPhoto = buildReviewPacket({ channel: "korea", record, images: scenes, recent: [] });
  assert.ok(missingPhoto.blocking.some((issue) => /실제 제품 사진/.test(issue)));
  const complete = buildReviewPacket({ channel: "korea", record, images: [...scenes, { role: "product_photo", src: "photo", ready: true }], recent: [] });
  assert.deepEqual(complete.blocking, []);
  assert.ok(buildReviewPacket({ channel: "korea", record: { ...record, productInfo: { currentPrice: null, features: [] } },
    images: [...scenes, { role: "product_photo", src: "photo", ready: true }], recent: [] }).blocking.some((issue) => /확인 근거/.test(issue)));
});
