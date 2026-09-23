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
  return { id: "new", title: "How to Pack a Carry-On for a Week", keyword: "carry-on packing", category: "Packing", excerpt: "One bag, seven days.", ...overrides };
}

function packet(record = candidate(), images = [{ role: "featured", src: "https://res.cloudinary.com/x/f.png", faceMatch: PASS }]) {
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
  assert.equal(failed.blocking.length, 1);
  const missing = packet(candidate(), [{ role: "featured", src: "x", faceMatch: null }]);
  assert.equal(missing.blocking.length, 1, "해외는 얼굴 검수 기록이 없으면 막는다");
  const korea = buildReviewPacket({ channel: "korea", record: candidate(), images: [{ role: "info_why", src: "x", faceMatch: null }], recent: [], faceRequired: false });
  assert.deepEqual(korea.blocking, [], "국내는 fail 기록이 있을 때만 막는다");
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
});
