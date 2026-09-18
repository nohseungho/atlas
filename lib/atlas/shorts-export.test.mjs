import test from "node:test";
import assert from "node:assert/strict";
import { buildStoryShortsExport, shortsBlockers, EXPORT_VERSION } from "./shorts-export.js";

const base = {
  id: "kr_test",
  productName: "테스트 과일 세트 2kg",
  productUrl: "https://www.coupang.com/vp/products/1?vendorItemId=2",
  affiliateUrl: "",
  affiliateDisclosure: "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.",
  character: "suho",
  masterAssetPath: "public/atlas/characters/ATLAS-SUO-MASTER.png",
  evidenceSnapshot: { source: "뽐뿌 할인정보", priceText: "23,900원", popularity: "뽐뿌 핫/인기 목록에 포함" },
  shorts: {
    hook: "훅",
    durationSeconds: 38,
    cta: "설명란 링크 확인",
    sourceImages: [
      { id: "product_1", role: "product", path: "", source: "coupang_partners_official", status: "pending" },
      { id: "suho_master", role: "presenter", path: "public/atlas/characters/ATLAS-SUO-MASTER.png", source: "atlas_character", status: "ready" },
    ],
    scenes: [
      { beat: "hook", start: 0, end: 3, vo: "훅", caption: "훅", imageId: "suho_master" },
      { beat: "cta", start: 33, end: 38, vo: "링크 확인", caption: "링크", imageId: "product_1" },
    ],
  },
};

test("export blocks until affiliate link and official product image exist", () => {
  const blockers = shortsBlockers(base);
  assert.ok(blockers.includes("affiliate link missing"));
  assert.ok(blockers.includes("official product image missing"));
  const out = buildStoryShortsExport(base);
  assert.equal(out.status, "materials_ready_pending_assets");
  assert.equal(out.renderedVideo, false);
  assert.equal(out.uploaded, false);
});

test("export becomes reviewable once link and image are linked, and never claims verified prices", () => {
  const ready = structuredClone(base);
  ready.affiliateUrl = "https://link.coupang.com/a/TEST";
  ready.shorts.sourceImages[0].path = ".atlas-data/korea-assets/kr_test/coupang-partners-product-1.jpg";
  const out = buildStoryShortsExport(ready);
  assert.deepEqual(out.blockers, []);
  assert.equal(out.status, "ready_for_review");
  assert.equal(out.exportVersion, EXPORT_VERSION);
  assert.equal(out.product.commerceMode, "MARKET_AFFILIATE");
  assert.equal(out.product.salePrice.verified, false);
  assert.equal(out.product.salePrice.value, null);
  assert.equal(out.product.priceSource, "UNVERIFIED");
  assert.equal(out.product.affiliateUrl, "https://link.coupang.com/a/TEST");
  assert.deepEqual(out.product.photos, [".atlas-data/korea-assets/kr_test/coupang-partners-product-1.jpg", "public/atlas/characters/ATLAS-SUO-MASTER.png"]);
  assert.equal(out.shorts.subtitles.length, 2);
  assert.equal(out.shorts.subtitles[1].text, "링크");
  assert.equal(out.shorts.disclosure, base.affiliateDisclosure);
});

test("duration outside 30-45s is a blocker", () => {
  const short = structuredClone(base);
  short.shorts.durationSeconds = 20;
  assert.ok(shortsBlockers(short).some((b) => b.startsWith("duration")));
});
