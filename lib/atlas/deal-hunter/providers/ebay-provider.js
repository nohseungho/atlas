// ─── Deal Hunter · eBay Browse API Provider (server-only) ───────────────────
// 공식 Browse API만 사용한다. 크롤링하지 않고, 결과가 없을 때 가짜 상품을
// 만들지 않는다. 자격정보는 서버에서만 읽고 응답에 절대 싣지 않는다.
//
// 필요 환경변수:
//   EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_MARKETPLACE_ID
//   EBAY_AFFILIATE_CAMPAIGN_ID / EBAY_AFFILIATE_REFERENCE_ID (제휴 링크용, 선택)

import { EBAY_SEARCH_CONDITION_IDS, normalizeEbayCondition } from "../conditions.js";

const OAUTH_URL = "https://api.ebay.com/identity/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const SCOPE = "https://api.ebay.com/oauth/api_scope";
const REQUEST_TIMEOUT_MS = 20000;
const TOKEN_SAFETY_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 30;

function env(name) {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

/**
 * 환경변수만으로 준비 상태를 판단한다. 비밀값은 반환하지 않는다.
 */
export function ebayProviderReadiness() {
  const clientId = env("EBAY_CLIENT_ID");
  const clientSecret = env("EBAY_CLIENT_SECRET");
  const missing = [];
  if (!clientId) missing.push("EBAY_CLIENT_ID");
  if (!clientSecret) missing.push("EBAY_CLIENT_SECRET");
  const ready = missing.length === 0;
  const affiliateReady = Boolean(env("EBAY_AFFILIATE_CAMPAIGN_ID"));
  return {
    ready,
    status: ready ? "READY" : "NEEDS_CONFIGURATION",
    marketplaceId: env("EBAY_MARKETPLACE_ID") || "EBAY_US",
    affiliateReady,
    envNeeded: ready ? (affiliateReady ? [] : ["EBAY_AFFILIATE_CAMPAIGN_ID"]) : missing,
    message: ready
      ? affiliateReady
        ? "eBay Browse API 연결됨 (제휴 추적 파라미터 포함)"
        : "eBay Browse API 연결됨 · 제휴 캠페인 ID가 없어 제휴 링크는 생성되지 않습니다."
      : "eBay API 연결 필요",
  };
}

// Application token 캐시. 만료 시각 기준으로만 재발급한다.
let tokenCache = { token: null, expiresAt: 0, key: "" };

function credentialKey(clientId, clientSecret) {
  return `${clientId}:${String(clientSecret).length}`;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getApplicationToken() {
  const clientId = env("EBAY_CLIENT_ID");
  const clientSecret = env("EBAY_CLIENT_SECRET");
  const key = credentialKey(clientId, clientSecret);
  if (tokenCache.token && tokenCache.key === key && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetchWithTimeout(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }).toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`eBay 토큰 발급 실패 (HTTP ${res.status}) ${detail.slice(0, 200)}`);
  }
  const json = await res.json();
  const token = json?.access_token;
  if (!token) throw new Error("eBay 토큰 응답에 access_token이 없습니다.");
  const ttlMs = (Number(json.expires_in) || 7200) * 1000;
  tokenCache = { token, key, expiresAt: Date.now() + Math.max(ttlMs - TOKEN_SAFETY_WINDOW_MS, 0) };
  return token;
}

// 테스트/재설정용. 자격정보가 바뀌면 캐시를 버린다.
export function resetEbayTokenCache() {
  tokenCache = { token: null, expiresAt: 0, key: "" };
}

function money(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Browse API item_summary 1건 → ATLAS 정규화 결과.
 * API가 주지 않은 값은 채우지 않는다(배송비 미제공 = 무료배송 아님).
 */
export function normalizeEbayItem(item = {}, { query = "", marketplaceId = "" } = {}) {
  const condition = normalizeEbayCondition({
    conditionId: item.conditionId,
    condition: item.condition,
    title: item.title,
  });

  const shippingOption = Array.isArray(item.shippingOptions) ? item.shippingOptions[0] : null;
  const shippingCost = shippingOption ? money(shippingOption?.shippingCost?.value) : null;

  // 제휴 URL은 API가 실제로 itemAffiliateWebUrl을 내려준 경우에만 인정한다.
  const affiliateUrl = typeof item.itemAffiliateWebUrl === "string" ? item.itemAffiliateWebUrl.trim() : "";
  const sourceUrl = typeof item.itemWebUrl === "string" ? item.itemWebUrl.trim() : "";

  const currency = item?.price?.currency || "";
  const originalPrice = item?.marketingPrice?.originalPrice;
  const referenceNewPrice =
    originalPrice && originalPrice.currency === currency ? money(originalPrice.value) : null;

  const images = [item?.image?.imageUrl, ...(item?.thumbnailImages || []).map((t) => t?.imageUrl)]
    .filter((u) => typeof u === "string" && u.trim())
    .map((u) => u.trim());

  return {
    query,
    source: "ebay",
    sourceMode: "API",
    sourceItemId: String(item.itemId || ""),
    sourceUrl,
    affiliateUrl,
    monetizationStatus: affiliateUrl ? "CONNECTED" : "UNCONNECTED",
    title: String(item.title || ""),
    manufacturer: String(item.brand || ""),
    modelNumber: String(item.mpn || ""),
    imageUrls: Array.from(new Set(images)),
    conditionOriginal: String(item.condition || ""),
    conditionOriginalId: String(item.conditionId || ""),
    conditionNormalized: condition.conditionNormalized,
    conditionEvidence: condition.conditionEvidence,
    price: money(item?.price?.value),
    currency,
    shippingCost,
    referenceNewPrice,
    referenceCurrency: currency,
    seller: String(item?.seller?.username || ""),
    packageContents: "",
    warranty: "",
    returnPolicy: "",
    availability: item?.availabilityStatus ? String(item.availabilityStatus) : "UNKNOWN",
    // Browse API 검색 요약은 한국 배송 가능 여부를 보장하지 않는다. 추측하지 않는다.
    shipToKorea: "UNKNOWN",
    marketplaceId,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * eBay 반품·개봉·리퍼 상품 검색.
 * @returns {{status:"ok", items:object[], ...} | {status:"provider_not_configured"|"error", ...}}
 */
export async function searchEbayDeals(query, { limit = DEFAULT_LIMIT } = {}) {
  const q = String(query || "").trim();
  if (!q) return { status: "error", errorCode: "QUERY_REQUIRED", message: "검색어가 필요합니다.", items: [] };

  const readiness = ebayProviderReadiness();
  if (!readiness.ready) {
    return {
      status: "provider_not_configured",
      message: "eBay API 연결 필요",
      envNeeded: readiness.envNeeded,
      items: [],
    };
  }

  const marketplaceId = readiness.marketplaceId;
  const params = new URLSearchParams({
    q,
    limit: String(Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), 200)),
    // 새상품과 일반 중고(3000 계열)를 제외하고 반품·개봉·리퍼 계열만 조회한다.
    filter: `conditionIds:{${EBAY_SEARCH_CONDITION_IDS.join("|")}}`,
  });

  const headers = {
    Authorization: "",
    "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
    "Content-Type": "application/json",
  };

  const campaignId = env("EBAY_AFFILIATE_CAMPAIGN_ID");
  const referenceId = env("EBAY_AFFILIATE_REFERENCE_ID");
  if (campaignId) {
    const ctx = [`affiliateCampaignId=${campaignId}`];
    if (referenceId) ctx.push(`affiliateReferenceId=${referenceId}`);
    headers["X-EBAY-C-ENDUSERCTX"] = ctx.join(",");
  }

  try {
    headers.Authorization = `Bearer ${await getApplicationToken()}`;
    const res = await fetchWithTimeout(`${SEARCH_URL}?${params.toString()}`, { method: "GET", headers });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        status: "error",
        errorCode: "EBAY_API_ERROR",
        message: `eBay 검색 실패 (HTTP ${res.status})`,
        detail: detail.slice(0, 300),
        items: [],
      };
    }
    const json = await res.json();
    const summaries = Array.isArray(json?.itemSummaries) ? json.itemSummaries : [];
    const items = summaries.map((item) => normalizeEbayItem(item, { query: q, marketplaceId }));
    return {
      status: "ok",
      marketplaceId,
      affiliateReady: readiness.affiliateReady,
      total: Number(json?.total) || items.length,
      items,
    };
  } catch (err) {
    return {
      status: "error",
      errorCode: "EBAY_REQUEST_FAILED",
      message: err?.message || "eBay 요청에 실패했습니다.",
      items: [],
    };
  }
}
