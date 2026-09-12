function clean(value) {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function isCoupangUrl(value) {
  try {
    const host = new URL(clean(value)).hostname.toLowerCase();
    return host === "coupang.com" || host.endsWith(".coupang.com") || host === "link.coupang.com";
  } catch {
    return false;
  }
}

export function chooseProductImages(imported = {}, { max = 2 } = {}) {
  const candidates = unique(imported.imageCandidates || imported.images || imported.draft?.images || []);
  return candidates.slice(0, Math.max(0, max));
}

export function productPhotoSlots(draft = {}, imported = {}, { max = 2 } = {}) {
  const urls = chooseProductImages(imported, { max });
  if (!urls.length) return draft.images || [];

  let cursor = 0;
  return (draft.images || []).map((img) => {
    if (img.role !== "product_photo" || clean(img.src)) return img;
    const sourceUrl = urls[cursor++];
    if (!sourceUrl) return img;
    return {
      ...img,
      src: sourceUrl,
      sourceUrl,
      sourceKind: isCoupangUrl(draft.affiliateUrl || draft.productUrl) ? "coupang_product_image" : "product_page_image",
      generatedLocally: false,
    };
  });
}

export function productFactsFromImport(imported = {}) {
  const product = imported.draft || {};
  return [
    product.vendor ? `판매처 또는 브랜드: ${product.vendor}` : "",
    product.currentPrice !== null && product.currentPrice !== undefined
      ? `확인 시점 판매가: ${product.currency || ""} ${Number(product.currentPrice).toLocaleString("ko-KR")}`.trim()
      : "",
    product.sku ? `모델 또는 상품 번호: ${product.sku}` : "",
  ].filter(Boolean);
}
