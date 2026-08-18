// ─── 상품 ↔ 블로그 연결 (Product Center → 제작 요청 파일) ──────────────────
// Product Center에 등록된 상품을 블로그 제작 요청 JSON에 실을 때 쓰는 스냅샷.
// 스냅샷은 "그때 확인된 값"의 사본이다 — 나중에 상품 가격이 바뀌어도 이미
// 내보낸 요청 파일의 근거는 그대로 남아야 하기 때문이다.
//
// 이 모듈은 PURE (IO 없음)이며 클라이언트(localStorage)와 서버 라우트가 함께 쓴다.
// 제휴 링크는 절대 만들어내지 않는다. 없으면 "대기" 상태를 그대로 표시한다.

import { linkStatus, LINK_STATUS } from "./photo-card/product-model.js";

export const AFFILIATE_STATUS = {
  READY: "AFFILIATE_READY",
  PENDING: "AFFILIATE_PENDING",
};

/** 제휴 링크 상태. 링크가 없으면 만들지 않고 "대기"로 둔다. */
export function affiliateState(product) {
  const linked = linkStatus(product) === LINK_STATUS.LINKED;
  return {
    status: linked ? AFFILIATE_STATUS.READY : AFFILIATE_STATUS.PENDING,
    label: linked ? "제휴 링크 연결됨" : "제휴 링크 대기",
    affiliateLink: linked ? String(product?.affiliateLink || "").trim() : "",
    // 링크가 없는 동안에는 구매 버튼도 만들지 않는다.
    mayRenderBuyButton: linked,
  };
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  return [];
}

/**
 * 제작 요청 파일에 실리는 상품 스냅샷 1건.
 * 확인되지 않은 값은 null/빈 값으로 남기고, 없는 근거를 채워 넣지 않는다.
 */
export function buildProductSnapshot(product = {}, { images = [] } = {}) {
  const affiliate = affiliateState(product);
  return {
    productId: String(product.id || ""),
    name: String(product.name || ""),
    category: String(product.category || ""),
    vendor: String(product.vendor || ""),
    productUrl: String(product.productUrl || ""),
    affiliateStatus: affiliate.status,
    affiliateStatusLabel: affiliate.label,
    affiliateLink: affiliate.affiliateLink,
    currency: String(product.currency || ""),
    currentPrice: product.currentPrice === undefined ? null : product.currentPrice,
    listPrice: product.listPrice === undefined ? null : product.listPrice,
    priceSource: String(product.priceSource || ""),
    priceCheckedAt: String(product.priceCheckedAt || ""),
    benefit: String(product.benefit || ""),
    features: toArray(product.features).slice(0, 5),
    audience: String(product.audience || ""),
    // 이미지 자체(base64)는 싣지 않는다. 어떤 이미지가 어디에 있는지만 가리킨다.
    imageRefs: images.map((img) => ({
      imageId: String(img.imageId || img.id || ""),
      name: String(img.name || ""),
      width: img.width ?? null,
      height: img.height ?? null,
      sourceUrl: String(img.sourceUrl || ""),
    })),
    imageSource: String(product.imageSource || ""),
    imageRightsConfirmed: Boolean(product.imageRightsConfirmed),
  };
}

// 글의 성격을 요청 파일에 못 박는다. 상품 광고문이 아니라, 독자의 질문을 먼저
// 해결한 다음 관련 제품을 자연스럽게 잇는 글이어야 한다.
export const PRODUCT_EDITORIAL_RULES = [
  "The article answers the reader's question first. Product mentions come only after the question is fully resolved.",
  "Never write a product advertisement, a sales page, or a 'best X' listicle built around the linked product.",
  "Mention a linked product only where it genuinely maps to a step or a checklist item the article already established.",
  "Use only the price, currency, and evidence in the snapshot, and state the price-checked timestamp next to any figure.",
  "If affiliateStatus is AFFILIATE_PENDING, do NOT invent an affiliate link, a buy button, or a 'shop now' CTA. Link to productUrl as a plain reference or omit the link entirely.",
  "Never invent stock status, ratings, review counts, sales rank, or a discount that the snapshot does not carry.",
];

/**
 * 요청 파일에 들어가는 linkedProducts 블록. 연결된 상품이 없으면 null을 돌려
 * 요청 파일에 빈 블록이 남지 않게 한다.
 */
export function buildLinkedProductsBlock(snapshots = []) {
  const items = (snapshots || []).filter((s) => s && s.productId && s.name);
  if (!items.length) return null;
  const pending = items.filter((s) => s.affiliateStatus === AFFILIATE_STATUS.PENDING);
  return {
    linkedProductIds: items.map((s) => s.productId),
    products: items,
    affiliatePendingIds: pending.map((s) => s.productId),
    editorialRules: PRODUCT_EDITORIAL_RULES,
    note:
      "These products are registered in ATLAS Product Center. Treat them as reference material for a reader-first guide, not as the subject of the article." +
      (pending.length
        ? ` ${pending.length} of them have no affiliate link yet — write them without any purchase CTA.`
        : ""),
  };
}

/**
 * 클라이언트가 보낸 스냅샷을 서버가 다시 정규화한다. 요청 본문을 그대로 믿고
 * 요청 파일에 싣지 않기 위한 관문이며, 여기서도 제휴 링크는 만들지 않는다.
 */
export function sanitizeSnapshots(input, { max = 5 } = {}) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((p) => p && typeof p === "object")
    .slice(0, max)
    .map((p) => buildProductSnapshot(p, { images: Array.isArray(p.imageRefs) ? p.imageRefs : [] }))
    .filter((s) => s.productId && s.name);
}
