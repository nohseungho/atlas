import test from "node:test";
import assert from "node:assert/strict";
import { buildShoppingExport, REQUIRED_FIELDS, shoppingExportStatus } from "./shopping-export.js";

const draft = {
  id: "kr_test", platform: "naver", blogId: "who-ami", channelId: "korea_naver", state: "ready_for_review",
  title: "테스트 제목", productName: "테스트 과일 세트 2kg", productUrl: "https://www.coupang.com/vp/products/1?vendorItemId=2",
  affiliateUrl: "", publishedUrl: "", character: "suho",
  affiliateDisclosure: "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.",
  coupangProduct: { productId: "1", vendorItemId: "2", officialName: "공식 상품명" },
  images: [
    { id: "img_product_photo_1", role: "product_photo", src: "" },
    { id: "img_suho", role: "body_usage", src: "" },
  ],
  shopping: { keyBenefits: ["장점1", "장점2"], caveats: ["주의1"], shortHook: "훅", shortSummary: "요약" },
};

test("export carries every required field and no media is produced", () => {
  const out = buildShoppingExport(draft);
  for (const key of REQUIRED_FIELDS) assert.ok(key in out, `missing ${key}`);
  assert.equal(out.status, "pending_assets");
  assert.equal(out.modelName, "공식 상품명");
  assert.deepEqual(out.sourceImages, []);
  assert.equal(out.media.videoRendered, false);
  assert.equal(out.media.uploaded, false);
});

test("status follows affiliate link + official image + draft state", () => {
  const linked = structuredClone(draft);
  linked.affiliateUrl = "https://link.coupang.com/a/x";
  linked.images[0].src = ".atlas-data/korea-assets/kr_test/product_1.jpg";
  linked.images[0].source = "coupang_partners";
  assert.equal(shoppingExportStatus(linked), "ready_for_review");
  const out = buildShoppingExport(linked);
  assert.equal(out.sourceImages.length, 1);
  assert.equal(out.sourceImages[0].source, "coupang_partners");
  assert.equal(out.affiliateUrl, "https://link.coupang.com/a/x");
  linked.state = "approved";
  assert.equal(shoppingExportStatus(linked), "approved");
  linked.state = "published"; linked.publishedUrl = "https://blog.naver.com/who-ami/1";
  assert.equal(shoppingExportStatus(linked), "published");
  assert.equal(buildShoppingExport(linked).publishedUrl, "https://blog.naver.com/who-ami/1");
});
