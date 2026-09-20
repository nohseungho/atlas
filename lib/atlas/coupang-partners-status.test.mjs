// 쿠팡 파트너스 승인 상태와 국내 콘텐츠 제작 분리 — 승인 전에는 제휴 링크 없이 발행, 승인 후 신규 글부터 제휴 링크 필수.
import test from "node:test";
import assert from "node:assert/strict";
import { coupangPartnersStatus, koreaLinkPlan, monetizationRecord, isPartnersLink, KOREA_LINK_MODE } from "./coupang-partners-status.js";
import { publishBlockers } from "./korea-product-pipeline.js";
import { bodyHtmlFromDraft, bodyPlainTextFromDraft } from "./naver-image-placement.js";
import { evaluateKoreaDraft } from "./policy-validator.js";

const PENDING = coupangPartnersStatus({});
const APPROVED_API = coupangPartnersStatus({ COUPANG_PARTNERS_ACCESS_KEY: "k", COUPANG_PARTNERS_SECRET_KEY: "s" });
const APPROVED_MANUAL = coupangPartnersStatus({ COUPANG_PARTNERS_STATUS: "approved" });

const base = {
  id: "kr_test", platform: "naver", contentType: "new_product_review", blogId: "who-ami", logNo: "",
  channelId: "korea_naver", assetScope: "korea", assetNamespace: ".atlas-data/korea-assets", character: "suho",
  masterAssetPath: "public/atlas/characters/ATLAS-SUO-MASTER.png",
  title: "테스트 제품", productName: "테스트 주전자",
  affiliateDisclosure: "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.",
  bodyText: "첫 문단입니다.\n\n제품 정보는 아래에서 확인할 수 있습니다.\n\n마무리입니다.",
  images: [{ id: "i1", role: "body_usage", src: "C:/x/i1.png", alt: "카드" }],
  state: "approved",
};

test("status: no keys and no declaration means pending; keys mean approved with Open API auto link", () => {
  assert.equal(PENDING.stage, "pending");
  assert.equal(PENDING.affiliateRequired, false);
  assert.equal(PENDING.linkSource, "none");
  assert.equal(APPROVED_API.stage, "approved");
  assert.equal(APPROVED_API.autoLink, true);
  assert.equal(APPROVED_API.linkSource, "open_api");
  assert.equal(APPROVED_MANUAL.stage, "approved");
  assert.equal(APPROVED_MANUAL.autoLink, false);
  assert.equal(APPROVED_MANUAL.linkSource, "manual_inbox");
});

test("isPartnersLink accepts only link.coupang.com short/AFFSDP links", () => {
  assert.ok(isPartnersLink("https://link.coupang.com/a/g9e7Kq1YNU"));
  assert.ok(isPartnersLink("https://link.coupang.com/re/AFFSDP?lptag=AF1&pageKey=1"));
  assert.equal(isPartnersLink("https://www.coupang.com/vp/products/1"), false);
  assert.equal(isPartnersLink("https://www.philips.co.kr/c-p/HD9318_20/x"), false);
});

test("link plan: affiliate wins, otherwise a non-partners product page link without disclosure, otherwise none", () => {
  const affiliate = koreaLinkPlan({ ...base, affiliateUrl: "https://link.coupang.com/a/abc", productUrl: "https://www.philips.co.kr/p" }, PENDING);
  assert.equal(affiliate.linkMode, KOREA_LINK_MODE.AFFILIATE);
  assert.equal(affiliate.disclosure, base.affiliateDisclosure);
  assert.equal(affiliate.partnersLinkPending, false);

  const page = koreaLinkPlan({ ...base, affiliateUrl: "", productUrl: "https://www.philips.co.kr/p" }, PENDING);
  assert.equal(page.linkMode, KOREA_LINK_MODE.PRODUCT_PAGE);
  assert.equal(page.disclosure, "");
  assert.equal(page.partnersLinkPending, true);
  assert.match(page.label, /테스트 주전자/);

  const none = koreaLinkPlan({ ...base, affiliateUrl: "", productUrl: "" }, PENDING);
  assert.equal(none.linkMode, KOREA_LINK_MODE.NONE);
  assert.equal(none.partnersLinkPending, true);

  // 승인 후 제휴 링크가 있으면 pending 표시가 남지 않는다
  assert.equal(koreaLinkPlan({ ...base, affiliateUrl: "https://link.coupang.com/a/abc" }, APPROVED_API).partnersLinkPending, false);
});

test("publish gate: pending allows publishing without affiliate link; approved requires it; images always required", () => {
  assert.deepEqual(publishBlockers({ ...base, affiliateUrl: "" }, PENDING), []);
  assert.deepEqual(publishBlockers({ ...base, affiliateUrl: "" }, APPROVED_API), ["affiliate link missing"]);
  assert.deepEqual(publishBlockers({ ...base, affiliateUrl: "https://link.coupang.com/a/abc" }, APPROVED_API), []);
  assert.deepEqual(publishBlockers({ ...base, affiliateUrl: "", images: [{ id: "i1", role: "body_usage", src: "" }] }, PENDING), ["no image linked (src empty)"]);
});

test("body html: product page link renders once without any affiliate disclosure; affiliate link renders with one disclosure", () => {
  const pending = bodyHtmlFromDraft({ ...base, affiliateUrl: "", productUrl: "https://www.philips.co.kr/p" });
  assert.equal((pending.match(/<a /g) || []).length, 1);
  assert.match(pending, /philips\.co\.kr\/p/);
  assert.equal(pending.includes("쿠팡 파트너스"), false);
  // 링크는 "아래에서 확인" 문단 바로 뒤에 놓인다
  assert.ok(pending.indexOf("아래에서 확인") < pending.indexOf("<a "));

  const none = bodyHtmlFromDraft({ ...base, affiliateUrl: "", productUrl: "" });
  assert.equal((none.match(/<a /g) || []).length, 0);
  assert.equal(none.includes("쿠팡 파트너스"), false);

  const affiliate = bodyHtmlFromDraft({ ...base, affiliateUrl: "https://link.coupang.com/a/abc", productUrl: "https://www.philips.co.kr/p" });
  assert.equal((affiliate.match(/<a /g) || []).length, 1);
  assert.match(affiliate, /link\.coupang\.com\/a\/abc/);
  assert.equal((affiliate.match(/쿠팡 파트너스/g) || []).length, 1);

  const plain = bodyPlainTextFromDraft({ ...base, affiliateUrl: "", productUrl: "https://www.philips.co.kr/p" });
  assert.match(plain, /제품 확인하기: https:\/\/www\.philips\.co\.kr\/p/);
  assert.equal(plain.includes("쿠팡 파트너스"), false);
});

test("policy panel: monetization rule passes while pending, warns after approval without a link", () => {
  const pending = evaluateKoreaDraft({ ...base, state: "ready_for_review", affiliateUrl: "" }, { partners: PENDING });
  const rule = pending.results.find((r) => r.id === "naver_monetized_candidate_only");
  assert.equal(rule.status, "pass");
  assert.match(rule.detail, /pending/);

  const approved = evaluateKoreaDraft({ ...base, state: "ready_for_review", affiliateUrl: "" }, { partners: APPROVED_API });
  assert.equal(approved.results.find((r) => r.id === "naver_monetized_candidate_only").status, "warn");
});

test("monetization record marks pending publications for later, without touching the draft link fields", () => {
  const record = monetizationRecord({ ...base, affiliateUrl: "", productUrl: "https://www.philips.co.kr/p" }, PENDING);
  assert.equal(record.partnersStage, "pending");
  assert.equal(record.linkMode, "product_page");
  assert.equal(record.partnersLinkPending, true);
  assert.ok(record.decidedAt);
});
