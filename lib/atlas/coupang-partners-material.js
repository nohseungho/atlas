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

// ── 수동 확보 소재 검증 (쿠팡 로그인 자동화 금지 → 사용자가 파트너스 화면에서 만든 링크/이미지를 받아 연결) ──

export function isPartnersLink(url = "") {
  try {
    const parsed = new URL(clean(url));
    return parsed.protocol === "https:" && parsed.hostname === "link.coupang.com" && /^\/(a\/[A-Za-z0-9]+|re\/AFFSDP)/.test(parsed.pathname);
  } catch { return false; }
}

// 초안이 요구하는 상품(productId/vendorItemId/이름 토큰)과 확보된 소재가 같은 상품인지 확인한다.
// 하나라도 어긋나면 자동 적용하지 않는다.
export function validatePartnersMaterial(draft = {}, material = {}) {
  const issues = [];
  const wanted = draft.coupangProduct || {};
  if (!isPartnersLink(material.link)) issues.push("partners link missing or not a link.coupang.com URL");
  if (clean(material.productId) && clean(wanted.productId) && clean(material.productId) !== clean(wanted.productId)) issues.push(`productId mismatch: ${material.productId} != ${wanted.productId}`);
  if (clean(material.vendorItemId) && clean(wanted.vendorItemId) && clean(material.vendorItemId) !== clean(wanted.vendorItemId)) issues.push(`vendorItemId mismatch: ${material.vendorItemId} != ${wanted.vendorItemId}`);
  const tokens = Array.isArray(wanted.expectedNameTokens) ? wanted.expectedNameTokens.map(clean).filter(Boolean) : [];
  const name = clean(material.productName);
  if (name && tokens.length) {
    const missing = tokens.filter((token) => !name.toLowerCase().replace(/\s+/g, "").includes(token.toLowerCase().replace(/\s+/g, "")));
    if (missing.length) issues.push(`product name does not look like the expected product (missing: ${missing.join(", ")})`);
  }
  const images = Array.isArray(material.images) ? material.images.map(clean).filter(Boolean) : [];
  // 링크만 먼저 들어오는 경우를 허용한다(이미지는 뒤에 인박스로 추가). 둘 다 없으면 거부.
  if (!images.length && !isPartnersLink(material.link)) issues.push("no official image file");
  return { ok: issues.length === 0, issues };
}
