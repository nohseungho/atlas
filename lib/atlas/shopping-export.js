// ATLAS가 선정·작성한 상품 콘텐츠를 별도 쇼핑쇼츠 시스템이 나중에 읽을 수 있도록 데이터만 내보낸다.
// 영상/음성/렌더링/업로드는 ATLAS 범위 밖이며 여기서는 어떤 미디어도 만들지 않는다.
// 출력: data/atlas/shopping-exports/{draftId}.json

export const SHOPPING_EXPORT_VERSION = "ATLAS_SHOPPING_EXPORT_V1";
export const REQUIRED_FIELDS = Object.freeze([
  "productName", "modelName", "title", "affiliateUrl", "sourceImages", "keyBenefits", "caveats",
  "shortHook", "shortSummary", "disclosure", "sourceBlog", "publishedUrl", "status",
]);

const clean = (value) => String(value || "").trim();
const list = (value) => (Array.isArray(value) ? value.map(clean).filter(Boolean) : []);

// 초안의 이미지 슬롯 중 실제 파일이 연결된 것만 내보낸다(공식 상품 이미지 + 수호 일러스트).
export function exportSourceImages(draft = {}) {
  return (draft.images || [])
    .filter((img) => clean(img.src))
    .map((img) => ({
      id: img.id || img.role || "",
      role: img.role || "",
      path: clean(img.src),
      alt: clean(img.alt),
      source: img.source || (img.role === "product_photo" ? "coupang_partners" : "atlas_character"),
      productId: img.productId || "",
      vendorItemId: img.vendorItemId || "",
      acquiredAt: img.acquiredAt || "",
    }));
}

export function shoppingExportStatus(draft = {}) {
  if (draft.state === "published" && clean(draft.publishedUrl)) return "published";
  const hasLink = Boolean(clean(draft.affiliateUrl));
  const hasProductImage = (draft.images || []).some((img) => img.role === "product_photo" && clean(img.src));
  if (hasLink && hasProductImage) return draft.state === "approved" ? "approved" : "ready_for_review";
  return "pending_assets";
}

export function buildShoppingExport(draft = {}) {
  const shopping = draft.shopping || {};
  const out = {
    exportVersion: SHOPPING_EXPORT_VERSION,
    draftId: draft.id,
    channelId: draft.channelId || "korea_naver",
    productName: clean(draft.productName),
    modelName: clean(shopping.modelName || draft.coupangProduct?.officialName),
    title: clean(draft.title),
    affiliateUrl: clean(draft.affiliateUrl),
    productUrl: clean(draft.productUrl),
    coupang: {
      productId: clean(draft.coupangProduct?.productId),
      vendorItemId: clean(draft.coupangProduct?.vendorItemId),
      price: draft.coupangProduct?.price ?? null,
      discountRate: draft.coupangProduct?.discountRate ?? null,
      priceCheckedAt: clean(draft.coupangProduct?.priceCheckedAt || draft.coupangProduct?.acquiredAt),
    },
    sourceImages: exportSourceImages(draft),
    keyBenefits: list(shopping.keyBenefits),
    caveats: list(shopping.caveats),
    shortHook: clean(shopping.shortHook),
    shortSummary: clean(shopping.shortSummary),
    disclosure: clean(draft.affiliateDisclosure),
    character: draft.character || "",
    sourceBlog: { platform: draft.platform || "naver", blogId: clean(draft.blogId), draftState: draft.state || "" },
    publishedUrl: clean(draft.publishedUrl),
    evidence: draft.evidenceSnapshot || null,
    status: shoppingExportStatus(draft),
    exportedAt: new Date().toISOString(),
    media: { videoRendered: false, ttsGenerated: false, uploaded: false, note: "ATLAS는 데이터만 제공한다. 영상 제작은 별도 시스템 담당." },
  };
  const missing = REQUIRED_FIELDS.filter((key) => out[key] === undefined);
  if (missing.length) throw new Error(`shopping export missing fields: ${missing.join(", ")}`);
  return out;
}
