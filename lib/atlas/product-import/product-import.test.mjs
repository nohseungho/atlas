import test from "node:test";
import assert from "node:assert/strict";

import {
  assertFetchableUrl,
  canonicalizeProductUrl,
  isBlockedHost,
  isPrivateIpv4,
  vendorFromUrl,
} from "./url-guard.js";
import { extractProductDraft, findProductNode, modelKey, parseJsonLdBlocks, parseMetaTags } from "./product-extract.js";

const PRODUCT_PAGE = `<!doctype html>
<html><head>
<title>NU25 Multi-Color USB-C Lightweight Headlamp | NITECORE Store</title>
<link rel="canonical" href="https://nitecorestore.com/products/nu25-multi-color-usbc-lightweight-headlamp?utm_source=pinterest" />
<meta property="og:site_name" content="NITECORE USA Store" />
<meta property="og:title" content="NU25 Multi-Color USB-C Lightweight Headlamp" />
<meta property="og:image" content="//cdn.example.com/nu25.jpg" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product",
 "name":"NITECORE NU25 MCT UL Rechargeable Headlamp",
 "sku":"NU25-MCT-UL",
 "brand":{"@type":"Brand","name":"NITECORE"},
 "category":"Outdoor Safety",
 "image":["https://cdn.example.com/nu25-front.jpg","https://cdn.example.com/nu25-side.jpg"],
 "additionalProperty":[
   {"@type":"PropertyValue","name":"Max output","value":"400 lumens"},
   {"@type":"PropertyValue","name":"Weight","value":"45 g"},
   {"@type":"PropertyValue","name":"Charging","value":"USB-C"}],
 "offers":{"@type":"Offer","price":"36.95","priceCurrency":"USD",
   "availability":"https://schema.org/InStock",
   "seller":{"@type":"Organization","name":"NITECORE USA Store"}}}
</script>
</head><body></body></html>`;

// ── SSRF 관문 ──────────────────────────────────────────────────────────────

test("http/https 이외의 스킴과 자격정보 URL은 막힌다", () => {
  assert.equal(assertFetchableUrl("file:///etc/passwd").ok, false);
  assert.equal(assertFetchableUrl("ftp://example.com/a").ok, false);
  assert.equal(assertFetchableUrl("https://user:pw@example.com/a").ok, false);
  assert.equal(assertFetchableUrl("").ok, false);
});

test("localhost·사설 IP·내부 도메인은 막힌다", () => {
  for (const host of [
    "http://localhost/p",
    "http://127.0.0.1/p",
    "http://10.0.0.5/p",
    "http://192.168.1.10/p",
    "http://172.16.3.4/p",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/p",
    "http://shop.internal/p",
    "http://build-server/p",
  ]) {
    assert.equal(assertFetchableUrl(host).ok, false, host);
  }
  assert.equal(isPrivateIpv4("8.8.8.8"), false);
  assert.equal(isBlockedHost("nitecorestore.com"), false);
});

test("표준 웹 포트가 아니면 막고, 공개 상품 URL은 통과한다", () => {
  assert.equal(assertFetchableUrl("http://example.com:22/p").ok, false);
  const ok = assertFetchableUrl("https://nitecorestore.com/products/nu25");
  assert.equal(ok.ok, true);
  assert.equal(ok.host, "nitecorestore.com");
});

test("canonical URL은 추적 파라미터·해시·www·끝 슬래시를 지운다", () => {
  const a = canonicalizeProductUrl("https://www.NitecoreStore.com/products/nu25/?utm_source=x&gclid=y#reviews");
  const b = canonicalizeProductUrl("https://nitecorestore.com/products/nu25");
  assert.equal(a, "https://nitecorestore.com/products/nu25");
  assert.equal(a, b);
  assert.equal(canonicalizeProductUrl("http://127.0.0.1/x"), "");
});

test("판매처 자동 감지는 도메인에서만 뽑는다", () => {
  assert.equal(vendorFromUrl("https://www.nitecorestore.com/products/nu25"), "Nitecorestore");
  assert.equal(vendorFromUrl("not a url"), "");
});

// ── 추출 ───────────────────────────────────────────────────────────────────

test("JSON-LD Product/Offer가 최우선으로 쓰인다", () => {
  const { draft, source, evidence } = extractProductDraft({
    html: PRODUCT_PAGE,
    url: "https://nitecorestore.com/products/nu25-multi-color-usbc-lightweight-headlamp",
    fetchedAt: "2026-08-19T01:00:00.000Z",
  });
  assert.equal(draft.name, "NITECORE NU25 MCT UL Rechargeable Headlamp");
  assert.equal(draft.vendor, "NITECORE USA Store");
  assert.equal(draft.category, "Outdoor Safety");
  assert.equal(draft.currency, "USD");
  assert.equal(draft.currentPrice, 36.95);
  assert.equal(draft.priceCheckedAt, "2026-08-19T01:00:00.000Z");
  assert.match(draft.priceSource, /nitecorestore\.com/);
  assert.equal(draft.sku, "NU25-MCT-UL");
  assert.equal(source.usedJsonLd, true);
  assert.equal(evidence.currentPrice, "JSON-LD Offer.price");
  assert.equal(draft.features.length, 3);
  assert.equal(draft.features[0], "Max output: 400 lumens");
});

test("정상가·배송비는 근거가 없으면 추측하지 않고 REVIEW로 남는다", () => {
  const { draft, review } = extractProductDraft({ html: PRODUCT_PAGE, url: "https://nitecorestore.com/products/nu25" });
  assert.equal(draft.listPrice, null);
  assert.equal(draft.shippingFee, null);
  assert.ok(review.some((r) => r.startsWith("정상가")));
  assert.ok(review.some((r) => r.startsWith("배송비")));
});

test("정상가 표기가 실제로 있으면 그때만 채운다", () => {
  const html = `<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"@type":"Offer","price":"10","priceCurrency":"USD","priceSpecification":[{"@type":"UnitPriceSpecification","priceType":"https://schema.org/ListPrice","price":"20","priceCurrency":"USD"}]}}</script>`;
  const { draft } = extractProductDraft({ html, url: "https://shop.example.com/x" });
  assert.equal(draft.listPrice, 20);
});

test("가격이 없으면 임의 가격을 만들지 않고 현재가가 REVIEW로 간다", () => {
  const html = `<html><head><title>Some product</title>
    <meta property="og:title" content="Some product" /></head></html>`;
  const { draft, review } = extractProductDraft({ html, url: "https://shop.example.com/p/1" });
  assert.equal(draft.currentPrice, null);
  assert.equal(draft.priceSource, "");
  assert.equal(draft.priceCheckedAt, "");
  assert.ok(review.includes("현재가"));
});

test("JSON-LD가 없으면 Open Graph로만 보완한다", () => {
  const html = `<html><head>
    <meta property="og:title" content="OG only lamp" />
    <meta property="og:site_name" content="Example Shop" />
    <meta property="product:price:amount" content="19.90" />
    <meta property="product:price:currency" content="usd" />
    <meta property="og:image" content="https://cdn.example.com/a.jpg" /></head></html>`;
  const { draft, source, evidence } = extractProductDraft({ html, url: "https://shop.example.com/p/2" });
  assert.equal(source.usedJsonLd, false);
  assert.equal(draft.name, "OG only lamp");
  assert.equal(draft.vendor, "Example Shop");
  assert.equal(draft.currentPrice, 19.9);
  assert.equal(draft.currency, "USD");
  assert.equal(evidence.currentPrice, "og:price:amount");
});

test("제휴 링크는 어떤 경우에도 자동 생성되지 않는다", () => {
  const { draft, review } = extractProductDraft({ html: PRODUCT_PAGE, url: "https://nitecorestore.com/products/nu25" });
  assert.equal(draft.affiliateLink, "");
  assert.ok(review.some((r) => r.includes("제휴 링크")));
});

test("이미지 사용 확인은 절대 자동으로 체크되지 않는다", () => {
  const { draft, imageCandidates } = extractProductDraft({
    html: PRODUCT_PAGE,
    url: "https://nitecorestore.com/products/nu25",
  });
  assert.equal(draft.imageRightsConfirmed, false);
  assert.ok(imageCandidates.includes("https://cdn.example.com/nu25-front.jpg"));
  // 프로토콜 상대 경로도 절대 URL로 정규화된다.
  assert.ok(imageCandidates.includes("https://cdn.example.com/nu25.jpg"));
});

test("canonical 링크가 있으면 상품 URL이 그것으로 정규화된다", () => {
  const { draft } = extractProductDraft({
    html: PRODUCT_PAGE,
    url: "https://nitecorestore.com/products/nu25-multi-color-usbc-lightweight-headlamp?ref=ig",
  });
  assert.equal(draft.productUrl, "https://nitecorestore.com/products/nu25-multi-color-usbc-lightweight-headlamp");
});

test("깨진 JSON-LD 블록은 무시하고 나머지로 진행한다", () => {
  const html = `<script type="application/ld+json">{ not json </script>${PRODUCT_PAGE}`;
  assert.equal(parseJsonLdBlocks(html).length, 1);
  assert.ok(findProductNode(parseJsonLdBlocks(html)));
});

test("@graph 안의 Product도 찾는다", () => {
  const blocks = parseJsonLdBlocks(
    `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"Product","name":"G"}]}</script>`,
  );
  assert.equal(findProductNode(blocks).name, "G");
});

test("meta 파서는 property/name/rel을 모두 읽는다", () => {
  const meta = parseMetaTags(PRODUCT_PAGE);
  assert.equal(meta["og:site_name"], "NITECORE USA Store");
  assert.match(meta.canonical, /^https:\/\/nitecorestore\.com\//);
  assert.match(meta.__title, /^NU25 Multi-Color/);
});

test("modelKey는 판매처와 모델번호가 모두 있을 때만 생긴다", () => {
  assert.equal(modelKey({ vendor: "NITECORE USA Store", sku: "NU25-MCT-UL" }), "nitecore usa store::nu25-mct-ul");
  assert.equal(modelKey({ vendor: "NITECORE USA Store", sku: "" }), "");
});

test("ProductGroup + hasVariant 페이지에서도 가격·카테고리를 찾는다", () => {
  const html = `<script type="application/ld+json">{"@context":"http://schema.org/","@type":"ProductGroup",
    "name":"Nitecore NU25 MCT UL Headlamp","brand":{"@type":"Brand","name":"Nitecore"},"category":"Headlamps",
    "image":"https://cdn.example.com/nu25.png",
    "hasVariant":[{"@type":"Product","sku":"NU25MCTUL","offers":{"@type":"Offer","price":"36.95","priceCurrency":"USD","availability":"https://schema.org/InStock"}}]}
    </script>`;
  const { draft, source, evidence } = extractProductDraft({ html, url: "https://nitecorestore.com/products/nu25" });
  assert.equal(source.usedJsonLd, true);
  assert.equal(draft.name, "Nitecore NU25 MCT UL Headlamp");
  assert.equal(draft.category, "Headlamps");
  assert.equal(draft.currentPrice, 36.95);
  assert.equal(draft.currency, "USD");
  assert.equal(draft.availability, "InStock");
  assert.equal(evidence.currentPrice, "JSON-LD Offer.price");
});

test("같은 이미지가 http/https 두 벌로 오면 https 하나만 남는다", () => {
  const html = `<html><head>
    <meta property="og:title" content="Dup image" />
    <meta property="og:image" content="http://cdn.example.com/a.png" />
    <meta property="og:image:secure_url" content="https://cdn.example.com/a.png" /></head></html>`;
  const { imageCandidates } = extractProductDraft({ html, url: "https://shop.example.com/p" });
  assert.deepEqual(imageCandidates, ["https://cdn.example.com/a.png"]);
});
