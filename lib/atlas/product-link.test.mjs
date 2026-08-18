import test from "node:test";
import assert from "node:assert/strict";

import {
  AFFILIATE_STATUS,
  affiliateState,
  buildLinkedProductsBlock,
  buildProductSnapshot,
  sanitizeSnapshots,
} from "./product-link.js";

const PRODUCT = {
  id: "product_1565379b-3375-4772-a180-2496c1251ec9",
  name: "NITECORE NU25 MCT UL Rechargeable Headlamp",
  category: "Outdoor Safety",
  vendor: "NITECORE USA Store",
  currency: "USD",
  currentPrice: 36.95,
  listPrice: null,
  productUrl: "https://nitecorestore.com/products/nu25-multi-color-usbc-lightweight-headlamp",
  affiliateLink: "",
  priceSource: "nitecorestore.com 상품 페이지",
  priceCheckedAt: "2026-08-19T01:00:00.000Z",
  benefit: "야간 하산 구간에서 두 손을 쓰게 해 준다",
  features: ["Max output: 400 lumens", "Weight: 45 g", "Charging: USB-C"],
  audience: "야간 산행을 하는 초보 등산객",
  imageRightsConfirmed: true,
  imageSource: "판매처 제공 이미지",
};

test("제휴 링크가 없으면 대기 상태가 되고 구매 버튼도 허용되지 않는다", () => {
  const state = affiliateState(PRODUCT);
  assert.equal(state.status, AFFILIATE_STATUS.PENDING);
  assert.equal(state.label, "제휴 링크 대기");
  assert.equal(state.affiliateLink, "");
  assert.equal(state.mayRenderBuyButton, false);
});

test("실제 제휴 링크가 있을 때만 연결됨으로 바뀐다", () => {
  const state = affiliateState({ ...PRODUCT, affiliateLink: "https://example.com/aff/nu25" });
  assert.equal(state.status, AFFILIATE_STATUS.READY);
  assert.equal(state.mayRenderBuyButton, true);
  // placeholder 문자열은 링크로 치지 않는다.
  assert.equal(affiliateState({ ...PRODUCT, affiliateLink: "https://placeholder.example" }).status, AFFILIATE_STATUS.PENDING);
});

test("스냅샷에는 가격 근거와 확인 시각이 그대로 실린다", () => {
  const snap = buildProductSnapshot(PRODUCT, {
    images: [{ imageId: "img_1", name: "nu25.jpg", width: 1200, height: 1200, sourceUrl: "https://cdn.example.com/nu25.jpg" }],
  });
  assert.equal(snap.productId, PRODUCT.id);
  assert.equal(snap.currentPrice, 36.95);
  assert.equal(snap.currency, "USD");
  assert.equal(snap.priceSource, PRODUCT.priceSource);
  assert.equal(snap.priceCheckedAt, PRODUCT.priceCheckedAt);
  assert.equal(snap.affiliateStatus, AFFILIATE_STATUS.PENDING);
  assert.equal(snap.features.length, 3);
  assert.equal(snap.imageRefs[0].imageId, "img_1");
  // 이미지 본체(base64)는 요청 파일에 실리지 않는다.
  assert.equal("dataUrl" in snap.imageRefs[0], false);
});

test("linkedProducts 블록에는 id 목록과 편집 규칙이 함께 들어간다", () => {
  const block = buildLinkedProductsBlock([buildProductSnapshot(PRODUCT)]);
  assert.deepEqual(block.linkedProductIds, [PRODUCT.id]);
  assert.deepEqual(block.affiliatePendingIds, [PRODUCT.id]);
  assert.ok(block.editorialRules.some((r) => /answers the reader/i.test(r)));
  assert.ok(block.editorialRules.some((r) => /AFFILIATE_PENDING/.test(r)));
  assert.match(block.note, /no affiliate link yet/);
});

test("연결된 상품이 없으면 블록 자체가 생기지 않는다", () => {
  assert.equal(buildLinkedProductsBlock([]), null);
  assert.equal(buildLinkedProductsBlock(null), null);
});

test("서버는 클라이언트가 보낸 값을 다시 정규화하고 이름 없는 항목은 버린다", () => {
  const out = sanitizeSnapshots([PRODUCT, { id: "x" }, "junk", null]);
  assert.equal(out.length, 1);
  assert.equal(out[0].productId, PRODUCT.id);
  assert.equal(out[0].affiliateStatus, AFFILIATE_STATUS.PENDING);
});

test("클라이언트가 제휴 링크를 위조해도 http(s)가 아니면 대기로 남는다", () => {
  const out = sanitizeSnapshots([{ ...PRODUCT, affiliateLink: "javascript:alert(1)" }]);
  assert.equal(out[0].affiliateStatus, AFFILIATE_STATUS.PENDING);
  assert.equal(out[0].affiliateLink, "");
});
