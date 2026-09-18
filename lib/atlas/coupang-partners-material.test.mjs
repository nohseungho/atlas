import test from "node:test";
import assert from "node:assert/strict";
import { applyPartnersMaterial, imageExtensionFor, isPartnersLink, partnersImageUrl, pickPartnersProduct, validatePartnersMaterial } from "./coupang-partners-material.js";

const products = [
  { productId: 111, productName: "필립스 3000 시리즈 무선 전기주전자 HD9318", productUrl: "https://link.coupang.com/re/AFFSDP?lptag=A&pageKey=111", productImage: "https://static.coupangcdn.com/a.jpg" },
  { productId: 222, productName: "필립스 3000 시리즈 전기주전자 HD9350 1.7L", productUrl: "https://link.coupang.com/re/AFFSDP?lptag=A&pageKey=222", productImage: "https://static.coupangcdn.com/b.png" },
];

const draft = {
  id: "kr_philips_3000_kettle",
  productName: "필립스 3000 시리즈 무선 전기주전자",
  affiliateUrl: "",
  productUrl: "",
  bodyText: "본문 원문",
  affiliateDisclosure: "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.",
  state: "ready_for_review",
  images: [
    { id: "img_product_photo_1", role: "product_photo", src: "" },
    { id: "img_kettle_suho_usage", role: "body_usage", src: "" },
    { id: "img_product_photo_2", role: "product_photo", src: "" },
  ],
};

test("ambiguous Philips models are never auto-picked; explicit productId is required", () => {
  const ambiguous = pickPartnersProduct(products, "");
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.code, "PRODUCT_AMBIGUOUS");
  assert.equal(ambiguous.candidates.length, 2);

  const picked = pickPartnersProduct(products, "222");
  assert.equal(picked.ok, true);
  assert.equal(picked.product.productId, 222);

  const missing = pickPartnersProduct(products, "999");
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "PRODUCT_ID_NOT_IN_RESULTS");

  assert.equal(pickPartnersProduct([products[0]], "").ok, true);
  assert.equal(pickPartnersProduct([], "").code, "NO_CANDIDATES");
});

test("official partners image url and extension detection", () => {
  assert.equal(partnersImageUrl(products[1]), "https://static.coupangcdn.com/b.png");
  assert.equal(partnersImageUrl({ imageUrl: " https://x/y.webp " }), "https://x/y.webp");
  assert.equal(imageExtensionFor("https://x/y.png?type=w"), ".png");
  assert.equal(imageExtensionFor("https://x/y", "image/webp"), ".webp");
  assert.equal(imageExtensionFor("https://x/y", ""), ".jpg");
});

test("applying partners material fills only empty product_photo slots and links the partners url", () => {
  const updated = applyPartnersMaterial(draft, { product: products[1], localImagePaths: [".atlas-data/korea-assets/kr_philips_3000_kettle/coupang-partners-product-1.png"] });
  assert.equal(updated.affiliateUrl, products[1].productUrl);
  assert.equal(updated.productUrl, products[1].productUrl);
  assert.equal(updated.images[0].src, ".atlas-data/korea-assets/kr_philips_3000_kettle/coupang-partners-product-1.png");
  assert.equal(updated.images[0].sourceKind, "coupang_partners_official");
  assert.equal(updated.images[1].src, "", "Suho slot must stay empty");
  assert.equal(updated.images[1].role, "body_usage");
  assert.equal(updated.images[2].src, "", "second slot stays empty when only one image is provided");
  assert.equal(updated.bodyText, draft.bodyText);
  assert.equal(updated.affiliateDisclosure, draft.affiliateDisclosure);
  assert.equal(updated.state, "ready_for_review");
  assert.equal(updated.coupangPartnersProduct.productId, "222");
  // original untouched
  assert.equal(draft.affiliateUrl, "");
  assert.equal(draft.images[0].src, "");
});

test("applying partners material without a partners link is refused", () => {
  assert.throws(() => applyPartnersMaterial(draft, { product: { productId: 1, productName: "x" }, localImagePaths: ["a.png"] }));
});

test("manual partners material: only link.coupang.com links are accepted", () => {
  assert.equal(isPartnersLink("https://link.coupang.com/a/gXAFcqeHYa"), true);
  assert.equal(isPartnersLink("https://link.coupang.com/re/AFFSDP?lptag=A&pageKey=1"), true);
  assert.equal(isPartnersLink("https://www.coupang.com/vp/products/1"), false);
  assert.equal(isPartnersLink("http://link.coupang.com/a/x"), false);
  assert.equal(isPartnersLink(""), false);
});

test("manual partners material is refused when it is not the expected product", () => {
  const target = { coupangProduct: { productId: "9727489457", vendorItemId: "96034356973", expectedNameTokens: ["황금향", "제주", "2kg"] } };
  const good = { link: "https://link.coupang.com/a/abc123", productName: "황금향 초고당도 제주 추석명절과일세트 2kg", productId: "9727489457", vendorItemId: "96034356973", images: ["a.jpg"] };
  assert.deepEqual(validatePartnersMaterial(target, good), { ok: true, issues: [] });
  // 이름 토큰만 있어도 통과 (id 미기재 허용)
  assert.equal(validatePartnersMaterial(target, { link: good.link, productName: "제주 황금향 선물세트 2kg", images: ["a.jpg"] }).ok, true);
  // 다른 상품
  assert.equal(validatePartnersMaterial(target, { ...good, productName: "필립스 3000 시리즈 전기주전자" }).ok, false);
  assert.equal(validatePartnersMaterial(target, { ...good, productId: "1" }).ok, false);
  assert.equal(validatePartnersMaterial(target, { ...good, vendorItemId: "2" }).ok, false);
  // 링크/이미지 없음
  assert.ok(validatePartnersMaterial(target, { ...good, link: "" }).issues.some((i) => /partners link/.test(i)));
  assert.ok(validatePartnersMaterial(target, { ...good, images: [] }).issues.some((i) => /image/.test(i)));
});
