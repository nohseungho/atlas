// 쿠팡 파트너스 "공식" 상품소재(Open API productImage + 파트너스 추적 링크)를 국내 초안에 연결하는 순수 로직.
// 일반 상품 페이지 이미지를 긁어 오는 경로는 여기서 다루지 않는다.

function clean(value) {
  return String(value || "").trim();
}

// productId를 명시적으로 지정했을 때만 고른다. 후보가 여럿인데 지정이 없으면 고르지 않고 후보만 돌려준다.
export function pickPartnersProduct(products = [], productId = "") {
  const list = (Array.isArray(products) ? products : []).filter((p) => p && clean(p.productId));
  const wanted = clean(productId);
  if (wanted) {
    const hit = list.find((p) => String(p.productId) === wanted);
    return hit ? { ok: true, product: hit } : { ok: false, code: "PRODUCT_ID_NOT_IN_RESULTS", candidates: list };
  }
  if (list.length === 1) return { ok: true, product: list[0] };
  return { ok: false, code: list.length ? "PRODUCT_AMBIGUOUS" : "NO_CANDIDATES", candidates: list };
}

export function partnersImageUrl(product = {}) {
  return [product.productImage, product.imageUrl, product.productImageUrl].map(clean).find(Boolean) || "";
}

export function imageExtensionFor(url = "", contentType = "") {
  const type = clean(contentType).toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  const match = clean(url).match(/\.(png|webp|jpe?g)(?:[?#]|$)/i);
  return match ? `.${match[1].toLowerCase().replace("jpeg", "jpg")}` : ".jpg";
}

// 초안에 파트너스 링크와 로컬 저장된 공식 이미지 경로를 연결한다. 본문/고지/상태는 건드리지 않는다.
export function applyPartnersMaterial(draft = {}, { product = {}, localImagePaths = [] } = {}) {
  const affiliateUrl = clean(product.productUrl);
  if (!affiliateUrl) throw new Error("파트너스 상품 링크(productUrl)가 없습니다.");
  const paths = (Array.isArray(localImagePaths) ? localImagePaths : []).map(clean).filter(Boolean);
  let cursor = 0;
  const images = (draft.images || []).map((img) => {
    if (img.role !== "product_photo" || clean(img.src)) return img;
    const src = paths[cursor++];
    if (!src) return img;
    return {
      ...img,
      src,
      sourceUrl: partnersImageUrl(product),
      sourceKind: "coupang_partners_official",
      generatedLocally: false,
    };
  });
  return {
    ...draft,
    affiliateUrl,
    productUrl: clean(draft.productUrl) || affiliateUrl,
    coupangPartnersProduct: {
      productId: product.productId ? String(product.productId) : "",
      productName: clean(product.productName),
      linkedAt: new Date().toISOString(),
    },
    images,
    updatedAt: new Date().toISOString(),
  };
}
