import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEbayCondition, normalizeManualCondition } from "./conditions.js";
import { computeTotals, parseMoney } from "./pricing.js";
import {
  applyDealPatch,
  buildApiDeal,
  buildManualDeal,
  findDuplicate,
  isSafeHttpUrl,
  shortsCandidateEligibility,
} from "./deal-model.js";
import { ebayProviderReadiness, normalizeEbayItem, searchEbayDeals } from "./providers/ebay-provider.js";
import { searchByProvider } from "./providers/provider-registry.js";

const NOW = "2026-07-29T00:00:00.000Z";

// ─── 1. 상태 표준화 ─────────────────────────────────────────────────────────

test("eBay Open Box(1500) → OPEN_BOX_EXCELLENT", () => {
  const r = normalizeEbayCondition({ conditionId: 1500, condition: "Open box" });
  assert.equal(r.conditionNormalized, "OPEN_BOX_EXCELLENT");
  assert.match(r.conditionEvidence, /conditionId=1500/);
});

test("eBay Certified Refurbished(2000) → REFURB_CERTIFIED", () => {
  assert.equal(normalizeEbayCondition({ conditionId: 2000, condition: "Certified - Refurbished" }).conditionNormalized, "REFURB_CERTIFIED");
});

test("eBay Seller Refurbished(2500) → REFURB_SELLER", () => {
  assert.equal(normalizeEbayCondition({ conditionId: 2500, condition: "Seller refurbished" }).conditionNormalized, "REFURB_SELLER");
});

test("eBay 일반 Used(3000) → USED", () => {
  assert.equal(normalizeEbayCondition({ conditionId: 3000, condition: "Used" }).conditionNormalized, "USED");
});

test("근거 부족 → UNKNOWN (할인 문구만으로 반품상품 판정 금지)", () => {
  assert.equal(normalizeEbayCondition({ title: "Sony WH-1000XM5 Big Sale 50% off" }).conditionNormalized, "UNKNOWN");
  assert.equal(normalizeEbayCondition({}).conditionNormalized, "UNKNOWN");
  assert.equal(normalizeManualCondition({ conditionOriginal: "특가 할인" }).conditionNormalized, "UNKNOWN");
});

test("eBay 새상품(1000)은 반품상품으로 승격하지 않는다", () => {
  const r = normalizeEbayCondition({ conditionId: 1000, condition: "New" });
  assert.equal(r.conditionNormalized, "UNKNOWN");
});

test("쿠팡 미개봉 → SEALED_RETURN, 최상 → OPEN_BOX_EXCELLENT, 상 → OPEN_BOX_GOOD", () => {
  assert.equal(normalizeManualCondition({ conditionOriginal: "미개봉" }).conditionNormalized, "SEALED_RETURN");
  assert.equal(normalizeManualCondition({ conditionOriginal: "최상" }).conditionNormalized, "OPEN_BOX_EXCELLENT");
  assert.equal(normalizeManualCondition({ conditionOriginal: "상" }).conditionNormalized, "OPEN_BOX_GOOD");
});

test("쿠팡 '중' 등급은 근거가 있어야만 USED, 없으면 UNKNOWN", () => {
  assert.equal(normalizeManualCondition({ conditionOriginal: "중" }).conditionNormalized, "UNKNOWN");
  assert.equal(
    normalizeManualCondition({ conditionOriginal: "중", conditionEvidence: "실사용 중고 제품, 사용 흔적 있음" }).conditionNormalized,
    "USED",
  );
});

test("원본 상태 문자열은 항상 근거에 보존된다", () => {
  const r = normalizeManualCondition({ conditionOriginal: "전시상품" });
  assert.equal(r.conditionNormalized, "DISPLAY_ITEM");
  assert.match(r.conditionEvidence, /전시상품/);
});

// ─── 2. 가격 계산 ───────────────────────────────────────────────────────────

test("총비용 = 가격 + 배송비 + 수입비용", () => {
  const t = computeTotals({ price: 100, currency: "USD", shippingCost: 20, importCost: 30 });
  assert.equal(t.totalCost, 150);
  assert.equal(t.totalCostConfirmed, true);
});

test("배송비 미확인이면 무료배송으로 단정하지 않는다", () => {
  const t = computeTotals({ price: 100, currency: "USD", shippingCost: null, importCost: null });
  assert.equal(t.totalCost, 100);
  assert.equal(t.totalCostConfirmed, false);
});

test("동일 통화 할인율 계산", () => {
  const t = computeTotals({ price: 80, currency: "USD", referenceNewPrice: 100, referenceCurrency: "USD" });
  assert.equal(t.discountAmount, 20);
  assert.equal(t.discountPercent, 20);
});

test("비교가보다 비싸면 음수 할인율을 그대로 표시", () => {
  const t = computeTotals({ price: 120, currency: "USD", referenceNewPrice: 100, referenceCurrency: "USD" });
  assert.equal(t.discountAmount, -20);
  assert.equal(t.discountPercent, -20);
});

test("통화가 다르면 임의 환산하지 않고 할인 계산을 포기", () => {
  const t = computeTotals({ price: 100000, currency: "KRW", referenceNewPrice: 100, referenceCurrency: "USD" });
  assert.equal(t.discountAmount, null);
  assert.equal(t.discountPercent, null);
  assert.match(t.discountBasis, /통화 불일치/);
});

test("숫자가 아닌 가격과 음수 비용은 거부", () => {
  assert.equal(parseMoney("무료", { field: "판매 가격" }).ok, false);
  assert.equal(parseMoney(-1, { field: "배송비" }).ok, false);
  assert.equal(parseMoney("", { field: "판매 가격", required: true }).ok, false);
  assert.deepEqual(parseMoney("1,500", { field: "판매 가격" }), { ok: true, value: 1500 });
});

// ─── 3. URL / 검증 / 중복 ───────────────────────────────────────────────────

test("http/https URL만 허용", () => {
  assert.equal(isSafeHttpUrl("https://www.coupang.com/vp/products/1"), true);
  assert.equal(isSafeHttpUrl("http://example.com"), true);
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html,<h1>x</h1>"), false);
  assert.equal(isSafeHttpUrl("file:///c:/x"), false);
  assert.equal(isSafeHttpUrl(""), false);
});

const MANUAL_INPUT = {
  source: "coupang",
  sourceUrl: "https://www.coupang.com/vp/products/12345",
  title: "다이슨 V15 무선청소기",
  conditionOriginal: "미개봉",
  price: "700000",
  currency: "KRW",
  checkedAt: NOW,
  referenceNewPrice: "1000000",
  shippingCost: "0",
  importCost: "0",
};

test("수동 등록: 필수값 검증", () => {
  const bad = buildManualDeal({ ...MANUAL_INPUT, title: "", price: "" });
  assert.equal(bad.ok, false);
  assert.equal(bad.errorCode, "VALIDATION_FAILED");
  assert.ok(bad.errors.some((e) => e.includes("상품명")));
  assert.ok(bad.errors.some((e) => e.includes("판매 가격")));
});

test("수동 등록: 잘못된 URL 거부", () => {
  const bad = buildManualDeal({ ...MANUAL_INPUT, sourceUrl: "javascript:alert(1)" });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes("http/https")));
});

test("수동 등록: 서버가 총비용·할인율을 직접 계산하고 제휴 상태를 정한다", () => {
  const r = buildManualDeal({ ...MANUAL_INPUT, totalCost: 1, discountPercent: 99 }, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.deal.totalCost, 700000);
  assert.equal(r.deal.discountAmount, 300000);
  assert.equal(r.deal.discountPercent, 30);
  assert.equal(r.deal.conditionNormalized, "SEALED_RETURN");
  assert.equal(r.deal.sourceMode, "MANUAL_VERIFIED");
  assert.equal(r.deal.verificationStatus, "PENDING");
  assert.equal(r.deal.monetizationStatus, "UNCONNECTED");
  assert.equal(r.deal.shortsCandidate, false);
});

test("수동 등록: 제휴 URL이 있으면 CONNECTED", () => {
  const r = buildManualDeal({ ...MANUAL_INPUT, affiliateUrl: "https://link.coupang.com/a/abc" }, { now: NOW });
  assert.equal(r.deal.monetizationStatus, "CONNECTED");
  assert.notEqual(r.deal.affiliateUrl, r.deal.sourceUrl);
});

test("중복 sourceUrl / sourceItemId 저장 차단", () => {
  const existing = [
    { id: "deal_001", source: "coupang", sourceUrl: "https://www.coupang.com/vp/products/12345", sourceItemId: "12345" },
  ];
  assert.equal(findDuplicate(existing, { sourceUrl: "https://www.coupang.com/vp/products/12345/" })?.id, "deal_001");
  assert.equal(findDuplicate(existing, { source: "coupang", sourceItemId: "12345", sourceUrl: "https://other.example/x" })?.id, "deal_001");
  assert.equal(findDuplicate(existing, { source: "coupang", sourceUrl: "https://www.coupang.com/vp/products/99999" }), null);
});

// ─── 4. PATCH ───────────────────────────────────────────────────────────────

function savedDeal() {
  return buildManualDeal(MANUAL_INPUT, { now: NOW }).deal;
}

test("PATCH: 허용되지 않은 필드는 거부", () => {
  const r = applyDealPatch(savedDeal(), { title: "다른 이름" });
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, "FIELD_NOT_PATCHABLE");
});

test("PATCH: 허용값이 아닌 상태는 거부", () => {
  assert.equal(applyDealPatch(savedDeal(), { verificationStatus: "DELETED" }).ok, false);
  assert.equal(applyDealPatch(savedDeal(), { monetizationStatus: "MAYBE" }).ok, false);
  assert.equal(applyDealPatch(savedDeal(), { conditionNormalized: "SUPER_NEW" }).ok, false);
});

test("PATCH: 클라이언트 계산값을 신뢰하지 않고 서버에서 재계산", () => {
  const r = applyDealPatch(savedDeal(), { price: 500000, shippingCost: 3000 }, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.deal.totalCost, 503000);
  assert.equal(r.deal.discountPercent, 50);
});

test("PATCH: 제휴 URL을 비우면 자동으로 UNCONNECTED", () => {
  const connected = applyDealPatch(savedDeal(), { affiliateUrl: "https://link.coupang.com/a/abc", monetizationStatus: "CONNECTED" }).deal;
  assert.equal(connected.monetizationStatus, "CONNECTED");
  const cleared = applyDealPatch(connected, { affiliateUrl: "", monetizationStatus: "CONNECTED" }).deal;
  assert.equal(cleared.monetizationStatus, "UNCONNECTED");
});

test("PATCH: 상품 제외는 EXCLUDED로만 처리", () => {
  const r = applyDealPatch(savedDeal(), { verificationStatus: "EXCLUDED" });
  assert.equal(r.ok, true);
  assert.equal(r.deal.verificationStatus, "EXCLUDED");
});

// ─── 5. 쇼핑쇼츠 후보 ───────────────────────────────────────────────────────

test("쇼츠 후보: 검수 미완료 / UNKNOWN 상태면 전환 불가", () => {
  const pending = savedDeal();
  assert.equal(shortsCandidateEligibility(pending).eligible, false);
  assert.equal(applyDealPatch(pending, { shortsCandidate: true }).errorCode, "SHORTS_NOT_ELIGIBLE");

  const unknown = { ...pending, verificationStatus: "VERIFIED", conditionNormalized: "UNKNOWN" };
  assert.equal(shortsCandidateEligibility(unknown).eligible, false);
});

test("쇼츠 후보: 품절이면 전환 불가", () => {
  const soldOut = { ...savedDeal(), verificationStatus: "VERIFIED", availability: "품절" };
  assert.equal(shortsCandidateEligibility(soldOut).eligible, false);
});

test("쇼츠 후보: 검수 완료 + 표준 상태 확인 시 제휴 미연결이어도 전환 가능", () => {
  const verified = applyDealPatch(savedDeal(), { verificationStatus: "VERIFIED" }).deal;
  assert.equal(verified.monetizationStatus, "UNCONNECTED");
  const r = applyDealPatch(verified, { shortsCandidate: true });
  assert.equal(r.ok, true);
  assert.equal(r.deal.shortsCandidate, true);
});

test("쇼츠 후보인 상품도 EXCLUDED 처리가 막히지 않고, 후보 자격만 자동 해제된다", () => {
  const candidate = applyDealPatch(
    applyDealPatch(savedDeal(), { verificationStatus: "VERIFIED" }).deal,
    { shortsCandidate: true },
  ).deal;
  assert.equal(candidate.shortsCandidate, true);

  const excluded = applyDealPatch(candidate, { verificationStatus: "EXCLUDED" });
  assert.equal(excluded.ok, true);
  assert.equal(excluded.deal.verificationStatus, "EXCLUDED");
  assert.equal(excluded.deal.shortsCandidate, false);
  assert.match(excluded.deal.shortsCandidateNote, /자동 해제/);

  const soldOut = applyDealPatch(candidate, { availability: "품절" });
  assert.equal(soldOut.ok, true);
  assert.equal(soldOut.deal.shortsCandidate, false);
});

// ─── 6. eBay Provider ───────────────────────────────────────────────────────

test("eBay: 환경변수 없으면 provider_not_configured (mock 결과 0건)", async () => {
  const saved = { id: process.env.EBAY_CLIENT_ID, secret: process.env.EBAY_CLIENT_SECRET };
  delete process.env.EBAY_CLIENT_ID;
  delete process.env.EBAY_CLIENT_SECRET;
  try {
    assert.equal(ebayProviderReadiness().ready, false);
    const r = await searchEbayDeals("sony wh-1000xm5");
    assert.equal(r.status, "provider_not_configured");
    assert.deepEqual(r.items, []);
    assert.ok(r.envNeeded.includes("EBAY_CLIENT_ID"));
  } finally {
    if (saved.id) process.env.EBAY_CLIENT_ID = saved.id;
    if (saved.secret) process.env.EBAY_CLIENT_SECRET = saved.secret;
  }
});

test("eBay: 빈 검색어 거부", async () => {
  const r = await searchEbayDeals("   ");
  assert.equal(r.status, "error");
  assert.equal(r.errorCode, "QUERY_REQUIRED");
});

test("Provider registry: 미지원 provider 거부, 쿠팡은 수동 등록 안내", async () => {
  const bad = await searchByProvider("naver", "청소기");
  assert.equal(bad.errorCode, "UNSUPPORTED_PROVIDER");
  const coupang = await searchByProvider("coupang", "청소기");
  assert.equal(coupang.status, "manual_only");
  assert.deepEqual(coupang.items, []);
});

test("eBay 정규화: 배송 정보가 없으면 배송비/한국배송을 추측하지 않는다", () => {
  const item = normalizeEbayItem(
    {
      itemId: "v1|123|0",
      title: "Sony WH-1000XM5 Open Box",
      condition: "Open box",
      conditionId: "1500",
      price: { value: "248.00", currency: "USD" },
      itemWebUrl: "https://www.ebay.com/itm/123",
      seller: { username: "topseller" },
    },
    { query: "sony", marketplaceId: "EBAY_US" },
  );
  assert.equal(item.shippingCost, null);
  assert.equal(item.shipToKorea, "UNKNOWN");
  assert.equal(item.conditionNormalized, "OPEN_BOX_EXCELLENT");
  assert.equal(item.conditionOriginal, "Open box");
  assert.equal(item.conditionOriginalId, "1500");
});

test("eBay 정규화: itemAffiliateWebUrl이 없으면 일반 URL을 제휴 URL로 쓰지 않는다", () => {
  const item = normalizeEbayItem({
    itemId: "v1|123|0",
    title: "Open Box Item",
    conditionId: "1500",
    price: { value: "10.00", currency: "USD" },
    itemWebUrl: "https://www.ebay.com/itm/123",
  });
  assert.equal(item.affiliateUrl, "");
  assert.equal(item.monetizationStatus, "UNCONNECTED");
  assert.equal(item.sourceUrl, "https://www.ebay.com/itm/123");

  const affiliate = normalizeEbayItem({
    itemId: "v1|124|0",
    title: "Open Box Item",
    conditionId: "1500",
    price: { value: "10.00", currency: "USD" },
    itemWebUrl: "https://www.ebay.com/itm/124",
    itemAffiliateWebUrl: "https://ebay.us/aff124",
  });
  assert.equal(affiliate.monetizationStatus, "CONNECTED");
});

test("eBay 저장: 통화가 다른 marketingPrice는 비교가로 쓰지 않는다", () => {
  const item = normalizeEbayItem({
    itemId: "v1|125|0",
    title: "Open Box Item",
    conditionId: "1500",
    price: { value: "100.00", currency: "USD" },
    marketingPrice: { originalPrice: { value: "150000", currency: "KRW" } },
    itemWebUrl: "https://www.ebay.com/itm/125",
  });
  assert.equal(item.referenceNewPrice, null);
  const built = buildApiDeal(item, { now: NOW, query: "x" });
  assert.equal(built.ok, true);
  assert.equal(built.deal.discountPercent, null);
  assert.equal(built.deal.sourceMode, "API");
});
