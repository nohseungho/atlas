// ─── Product Import · 공개 상품 페이지에서 확인 가능한 값만 뽑아낸다 ────────
// 우선순위: JSON-LD Product/Offer → 부족한 필드만 Open Graph/meta로 보완.
// 규칙: 확인할 수 없는 값은 추측하지 않고 비운 뒤 review 목록에 넣는다.
// 정상가·배송비는 명시적 근거가 있을 때만 채운다. 제휴 링크는 절대 만들지 않는다.
//
// 이 모듈은 PURE (fetch 없음)라 서버 라우트와 단위 테스트가 같은 규칙을 쓴다.

import { canonicalizeProductUrl, vendorFromUrl } from "./url-guard.js";

// 정상가로 인정하는 근거. 취소선 가격/권장소비자가처럼 페이지가 스스로
// "이것이 정상가"라고 표기한 경우만 받는다. highPrice(가격 범위 상단)는 아니다.
const LIST_PRICE_TYPES = /(list\s*price|strikethrough|msrp|regular\s*price|suggested\s*retail)/i;

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text) {
  return String(text || "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, entity) => {
      if (entity[0] === "#") {
        const hex = entity[1] === "x" || entity[1] === "X";
        const code = hex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function first(...values) {
  for (const v of values) {
    if (v === 0) return 0;
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return "";
}

/** script[type="application/ld+json"] 블록을 전부 파싱한다. 깨진 블록은 건너뛴다. */
export function parseJsonLdBlocks(html) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html || ""))) !== null) {
    const raw = m[1].replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // 깨진 JSON-LD는 무시한다 — 추측해서 고치지 않는다.
    }
  }
  return out;
}

// @graph 말고도 ProductGroup의 변형 목록(hasVariant)까지 펼친다. Shopify류
// 페이지는 상품 자체를 ProductGroup으로 쓰고 가격은 변형 Product의 Offer에만
// 두기 때문에, 여기를 안 보면 확인 가능한 가격을 놓친다.
function flattenNodes(value, acc = []) {
  if (!value) return acc;
  if (Array.isArray(value)) {
    value.forEach((v) => flattenNodes(v, acc));
    return acc;
  }
  if (typeof value !== "object") return acc;
  acc.push(value);
  for (const key of ["@graph", "hasVariant", "mainEntity"]) {
    if (value[key]) flattenNodes(value[key], acc);
  }
  return acc;
}

function typesOf(node) {
  const t = node?.["@type"];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).map((v) => String(v).toLowerCase());
}

function isProductish(node) {
  return typesOf(node).some((t) => t === "product" || t === "productgroup" || t.endsWith("product"));
}

/** JSON-LD 전체에서 Product/ProductGroup 노드를 문서 순서대로 고른다. */
export function findProductNodes(blocks) {
  return flattenNodes(blocks).filter(isProductish);
}

/** 대표 노드 1개. 없으면 null. */
export function findProductNode(blocks) {
  return findProductNodes(blocks)[0] || null;
}

function collectOffers(node, flat) {
  const offers = node?.offers;
  if (!offers) return;
  for (const o of Array.isArray(offers) ? offers : [offers]) {
    if (!o || typeof o !== "object") continue;
    flat.push(o);
    if (o.offers) flat.push(...(Array.isArray(o.offers) ? o.offers : [o.offers]).filter(Boolean));
  }
}

/** 대표 노드와 그 변형들의 Offer를 모두 모은다(문서 순서 유지). */
function offerNodes(product, siblings = []) {
  const flat = [];
  collectOffers(product, flat);
  for (const node of siblings) {
    if (node !== product) collectOffers(node, flat);
  }
  return flat;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/[,\s]/g, "").replace(/^[^\d.-]+/, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/** meta/link 태그를 name·property·itemprop·rel 기준으로 읽는다. */
export function parseMetaTags(html) {
  const meta = {};
  const text = String(html || "");
  const tagRe = /<(meta|link)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(text)) !== null) {
    const attrs = {};
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let a;
    while ((a = attrRe.exec(m[2])) !== null) {
      attrs[a[1].toLowerCase()] = decodeEntities(a[3] ?? a[4] ?? a[5] ?? "");
    }
    const key = (attrs.property || attrs.name || attrs.itemprop || attrs.rel || "").toLowerCase();
    const value = attrs.content ?? attrs.href ?? "";
    if (key && value && meta[key] === undefined) meta[key] = value;
  }
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(text);
  if (title) meta.__title = decodeEntities(title[1]);
  return meta;
}

function absolute(value, baseUrl) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
}

function imageUrlsFrom(value) {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(imageUrlsFrom);
  if (typeof value === "object") return imageUrlsFrom(value.url || value.contentUrl || value["@id"]);
  return [];
}

function brandName(product) {
  const brand = product?.brand;
  if (!brand) return "";
  if (typeof brand === "string") return brand;
  if (Array.isArray(brand)) return brandName({ brand: brand[0] });
  return String(brand.name || "").trim();
}

function sellerName(offers) {
  for (const o of offers) {
    const seller = o.seller;
    if (typeof seller === "string" && seller.trim()) return seller.trim();
    if (seller && typeof seller === "object" && seller.name) return String(seller.name).trim();
  }
  return "";
}

/** 정상가는 "이것이 정상가"라는 표기가 있을 때만. 그 외에는 null. */
function listPriceFrom(product, offers) {
  for (const o of offers) {
    const specs = [].concat(o.priceSpecification || [], o.priceSpecifications || []).filter(Boolean);
    for (const spec of specs) {
      const typeText = Array.isArray(spec["@type"]) ? spec["@type"].join(" ") : spec["@type"] || "";
      const label = `${spec.priceType || ""} ${spec.name || ""} ${typeText}`;
      if (LIST_PRICE_TYPES.test(label)) {
        const value = numberOrNull(spec.price ?? spec.value ?? spec.maxPrice);
        if (value !== null) return value;
      }
    }
  }
  return numberOrNull(product?.listPrice ?? product?.regularPrice);
}

/** 배송비도 명시적 shippingRate가 있을 때만. "무료배송" 문구는 근거로 보지 않는다. */
function shippingFeeFrom(offers) {
  for (const o of offers) {
    const details = [].concat(o.shippingDetails || []).filter(Boolean);
    for (const d of details) {
      const rate = d?.shippingRate;
      if (!rate) continue;
      const value = numberOrNull(rate.value ?? rate.price ?? rate.minValue);
      if (value !== null) return value;
    }
  }
  return null;
}

/** additionalProperty(사양표)만 특징으로 받는다. 설명문을 잘라 만들어내지 않는다. */
function featuresFrom(product) {
  const props = [].concat(product?.additionalProperty || []).filter(Boolean);
  const out = [];
  for (const p of props) {
    const name = String(p?.name || "").trim();
    const value = String(p?.value ?? "").trim();
    if (!name && !value) continue;
    out.push(name && value ? `${name}: ${value}` : name || value);
    if (out.length >= 5) break;
  }
  return out;
}

function hashtagsFrom({ name, brand, category }) {
  const words = `${brand} ${category} ${name}`
    .replace(/[^0-9A-Za-z가-힣\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && w.length <= 20);
  const seen = new Set();
  const tags = [];
  for (const w of words) {
    const tag = `#${w.replace(/-/g, "")}`;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 6) break;
  }
  return tags;
}

/** 확인된 사실만으로 만드는 영문 게시 문구. 없는 값은 문장에서 그냥 빠진다. */
function captionFrom({ name, brand, price, currency, productUrl }) {
  const lines = [brand ? `${name} — ${brand}` : name];
  if (price !== null && price !== undefined && price !== "") {
    lines.push(`Listed at ${[currency, price].filter((v) => v !== "").join(" ")} at the time of checking.`);
  }
  lines.push("Price and availability change on the seller page — check before you buy.");
  if (productUrl) lines.push(productUrl);
  return lines.filter(Boolean).join("\n");
}

/**
 * 페이지 HTML → 상품 초안.
 * @returns {{draft:object, review:string[], evidence:object, imageCandidates:string[], source:object}}
 */
export function extractProductDraft({ html, url, fetchedAt = new Date().toISOString() }) {
  const blocks = parseJsonLdBlocks(html);
  const productNodes = findProductNodes(blocks);
  const productNode = productNodes[0] || null;
  const product = productNode || {};
  const offers = offerNodes(product, productNodes);
  const meta = parseMetaTags(html);

  const canonicalFromPage = absolute(first(meta.canonical, meta["og:url"]), url);
  const productUrl = canonicalizeProductUrl(canonicalFromPage) || canonicalizeProductUrl(url);
  const baseUrl = productUrl || url;

  const evidence = {};
  const mark = (field, source) => {
    if (source) evidence[field] = source;
  };

  const name = decodeEntities(
    String(first(product.name, meta["og:title"], meta["twitter:title"], meta.__title) || ""),
  );
  mark("name", product.name ? "JSON-LD Product.name" : meta["og:title"] ? "og:title" : meta.__title ? "<title>" : "");

  const brand = brandName(product);
  const seller = sellerName(offers);
  const vendor = String(first(seller, brand, meta["og:site_name"], vendorFromUrl(baseUrl)) || "").trim();
  mark(
    "vendor",
    seller ? "JSON-LD Offer.seller" : brand ? "JSON-LD Product.brand" : meta["og:site_name"] ? "og:site_name" : "도메인 자동 감지",
  );

  // 카테고리 후보 — 페이지가 스스로 말한 것만. 없으면 REVIEW로 남긴다.
  const category = String(
    first(
      typeof product.category === "string" ? product.category : product.category?.name,
      meta["product:category"],
      meta["article:section"],
    ) || "",
  ).trim();
  mark("category", category ? "JSON-LD/meta category" : "");

  const currency = String(
    first(
      offers.map((o) => o.priceCurrency).find(Boolean),
      offers.map((o) => o.priceSpecification?.priceCurrency).find(Boolean),
      meta["product:price:currency"],
      meta["og:price:currency"],
    ) || "",
  )
    .trim()
    .toUpperCase();

  const priceCandidate = first(
    offers.map((o) => numberOrNull(o.price)).find((v) => v !== null),
    offers.map((o) => numberOrNull(o.lowPrice)).find((v) => v !== null),
    offers.map((o) => numberOrNull(o.priceSpecification?.price)).find((v) => v !== null),
    numberOrNull(meta["product:price:amount"]),
    numberOrNull(meta["og:price:amount"]),
  );
  const currentPrice = priceCandidate === "" ? null : priceCandidate;
  const priceFromJsonLd = offers.some((o) => numberOrNull(o.price) !== null || numberOrNull(o.lowPrice) !== null);
  if (currentPrice !== null) {
    mark("currentPrice", priceFromJsonLd ? "JSON-LD Offer.price" : "og:price:amount");
    mark("currency", currency ? (priceFromJsonLd ? "JSON-LD Offer.priceCurrency" : "og:price:currency") : "");
  }

  const listPrice = listPriceFrom(product, offers);
  mark("listPrice", listPrice !== null ? "JSON-LD 정상가 표기" : "");
  const shippingFee = shippingFeeFrom(offers);
  mark("shippingFee", shippingFee !== null ? "JSON-LD shippingRate" : "");

  const availability = String(offers.map((o) => o.availability).find(Boolean) || "").replace(
    /^https?:\/\/schema\.org\//i,
    "",
  );

  const features = featuresFrom(product);
  mark("features", features.length ? "JSON-LD additionalProperty" : "");

  // 같은 파일이 http/https 두 벌로 들어오는 일이 흔하므로 스킴을 뺀 키로 묶고
  // https 쪽을 남긴다.
  const imageCandidates = [];
  const seenImages = new Map();
  for (const raw of [
    ...imageUrlsFrom(product.image),
    ...productNodes.flatMap((n) => (n === product ? [] : imageUrlsFrom(n.image))),
    meta["og:image"],
    meta["og:image:secure_url"],
    meta["twitter:image"],
  ]) {
    const absoluteUrl = absolute(raw, baseUrl);
    if (!absoluteUrl) continue;
    const key = absoluteUrl.replace(/^https?:/i, "");
    const kept = seenImages.get(key);
    if (kept === undefined) {
      seenImages.set(key, imageCandidates.length);
      imageCandidates.push(absoluteUrl);
    } else if (absoluteUrl.startsWith("https:") && !imageCandidates[kept].startsWith("https:")) {
      imageCandidates[kept] = absoluteUrl;
    }
  }

  let host = "";
  try {
    host = new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }

  const draft = {
    name,
    category,
    vendor,
    currency,
    currentPrice,
    listPrice,
    shippingFee,
    shippingNote: "",
    productUrl,
    // 제휴 링크는 자동 생성하지 않는다. 언제나 빈 값으로 내려간다.
    affiliateLink: "",
    tagNote: "",
    benefit: "",
    features,
    audience: "",
    priceSource: currentPrice !== null ? `${host} 상품 페이지 (${evidence.currentPrice})` : "",
    priceCheckedAt: currentPrice !== null ? fetchedAt : "",
    caption: name ? captionFrom({ name, brand, price: currentPrice, currency, productUrl }) : "",
    hashtags: name ? hashtagsFrom({ name, brand, category }) : [],
    imageSource: imageCandidates.length ? `${host} 상품 페이지 이미지` : "",
    // 사용자가 직접 확인하기 전에는 절대 true가 되지 않는다.
    imageRightsConfirmed: false,
    imageNote: "",
    note: "",
    availability,
    sku: String(first(product.sku, product.mpn, product.gtin13, product.productID) || "").trim(),
    sourceUrl: url,
    fetchedAt,
  };

  // 확인 못 한 값은 만들어내지 않고 REVIEW 목록으로 넘긴다.
  const review = [];
  if (!draft.name) review.push("상품명");
  if (draft.currentPrice === null) review.push("현재가");
  if (!draft.currency) review.push("통화");
  if (draft.listPrice === null) review.push("정상가(근거 없음 · 비워 둠)");
  if (draft.shippingFee === null) review.push("배송비(근거 없음 · 비워 둠)");
  if (!draft.category) review.push("카테고리");
  if (!draft.features.length) review.push("주요 특징");
  review.push("추천 대상", "핵심 효용");
  if (!imageCandidates.length) review.push("대표 이미지");
  review.push("제휴 링크(자동 생성하지 않음)");

  return {
    draft,
    review,
    evidence,
    imageCandidates: imageCandidates.slice(0, 8),
    source: {
      requestedUrl: url,
      canonicalUrl: productUrl,
      host,
      fetchedAt,
      usedJsonLd: Boolean(productNode),
      availability,
    },
  };
}

/** 같은 판매처 + 같은 모델번호면 같은 상품으로 본다. 둘 중 하나라도 없으면 빈 키. */
export function modelKey({ vendor, sku }) {
  const v = String(vendor || "").trim().toLowerCase();
  const s = String(sku || "").trim().toLowerCase();
  return v && s ? `${v}::${s}` : "";
}
