// ─── Deal Hunter · Provider Registry ────────────────────────────────────────
// 자동 검색이 가능한 Provider와 수동 등록만 가능한 판매처를 분명히 구분한다.
// 쿠팡 판매자 Open API는 반품마켓 검색용이 아니므로 자동검색으로 표시하지 않는다.

import { ebayProviderReadiness, searchEbayDeals } from "./ebay-provider.js";

export const PROVIDERS = [
  {
    id: "ebay",
    label: "eBay 자동검색",
    mode: "API",
    searchable: true,
    note: "공식 Browse API · Open Box/Refurbished condition 필터",
  },
  {
    id: "coupang",
    label: "쿠팡 수동 등록",
    mode: "MANUAL_VERIFIED",
    searchable: false,
    note: "공식 반품마켓 검색 API가 확인되지 않아 상품 URL 수동 등록만 지원합니다.",
  },
  {
    id: "other",
    label: "기타 쇼핑몰 수동 등록",
    mode: "MANUAL_VERIFIED",
    searchable: false,
    note: "판매처를 직접 기록하고 상품 URL을 수동 등록합니다.",
  },
];

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === String(id || "").trim()) || null;
}

export function providerCatalog() {
  return PROVIDERS.map((p) => ({
    ...p,
    readiness: p.id === "ebay" ? ebayProviderReadiness() : { ready: true, status: "MANUAL_ONLY" },
  }));
}

/**
 * Provider 검색 진입점. 자동검색을 지원하지 않는 판매처는 수동 등록으로 안내한다.
 */
export async function searchByProvider(providerId, query, options = {}) {
  const provider = getProvider(providerId);
  if (!provider) {
    return { status: "error", errorCode: "UNSUPPORTED_PROVIDER", message: `지원하지 않는 provider: ${providerId}`, items: [] };
  }
  if (!provider.searchable) {
    return {
      status: "manual_only",
      provider: provider.id,
      message: `${provider.label}는 자동 검색을 지원하지 않습니다. 상품 URL 수동 등록을 사용하세요.`,
      note: provider.note,
      items: [],
    };
  }
  const result = await searchEbayDeals(query, options);
  return { ...result, provider: provider.id };
}
