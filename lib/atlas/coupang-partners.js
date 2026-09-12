import crypto from "node:crypto";

const API_HOST = "https://api-gateway.coupang.com";
const SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search";

function clean(value) {
  return String(value || "").trim();
}

function compact(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");
}

function signedDate(now = new Date()) {
  const iso = now.toISOString();
  return `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

function authHeader({ method, path, query, accessKey, secretKey }) {
  const date = signedDate();
  const message = `${date}${method}${path}${query}`;
  const signature = crypto.createHmac("sha256", secretKey).update(message).digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${date}, signature=${signature}`;
}

export function coupangPartnersConfigured() {
  return Boolean(clean(process.env.COUPANG_PARTNERS_ACCESS_KEY) && clean(process.env.COUPANG_PARTNERS_SECRET_KEY));
}

function scoreProduct(product, targetName) {
  const target = compact(targetName);
  const name = compact(product?.productName);
  if (!target || !name) return 0;
  if (name === target) return 1000;
  if (name.includes(target) || target.includes(name)) return 800;

  const modelTokens = clean(targetName).match(/[A-Za-z]{1,8}[-_ ]?\d{3,}[A-Za-z0-9-]*/g) || [];
  let score = 0;
  for (const token of modelTokens) {
    if (name.includes(compact(token))) score += 250;
  }

  const words = clean(targetName)
    .split(/\s+/)
    .map(compact)
    .filter((word) => word.length >= 2);
  for (const word of words) {
    if (name.includes(word)) score += 12;
  }
  return score;
}

export async function findCoupangPartnersProduct({ productName, limit = 10 } = {}) {
  const accessKey = clean(process.env.COUPANG_PARTNERS_ACCESS_KEY);
  const secretKey = clean(process.env.COUPANG_PARTNERS_SECRET_KEY);
  const keyword = clean(productName);

  if (!keyword) return { ok: false, code: "PRODUCT_NAME_REQUIRED", error: "상품명이 없습니다." };
  if (!accessKey || !secretKey) {
    return {
      ok: false,
      code: "COUPANG_PARTNERS_NOT_CONFIGURED",
      error: "쿠팡 파트너스 Open API 키가 설정되지 않았습니다.",
    };
  }

  const query = `keyword=${encodeURIComponent(keyword)}&limit=${Math.max(1, Math.min(10, Number(limit) || 10))}`;
  const method = "GET";
  const url = `${API_HOST}${SEARCH_PATH}?${query}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: authHeader({ method, path: SEARCH_PATH, query, accessKey, secretKey }),
        Accept: "application/json",
      },
    });
  } catch (err) {
    return { ok: false, code: "COUPANG_PARTNERS_NETWORK_ERROR", error: String(err?.message || err) };
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      code: "COUPANG_PARTNERS_API_ERROR",
      status: res.status,
      error: clean(payload?.message || payload?.error || `HTTP ${res.status}`),
    };
  }

  const products = Array.isArray(payload?.data?.productData)
    ? payload.data.productData
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  const ranked = products
    .map((product) => ({ product, score: scoreProduct(product, keyword) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]?.product;

  if (!best) {
    return { ok: false, code: "COUPANG_PARTNERS_NO_MATCH", error: "쿠팡 파트너스 검색 결과가 없습니다." };
  }

  const imageCandidates = [best.productImage, best.imageUrl, best.productImageUrl].map(clean).filter(Boolean);
  return {
    ok: true,
    source: {
      kind: "coupang_partners_open_api",
      productId: best.productId || null,
      productName: best.productName || keyword,
      productUrl: best.productUrl || null,
    },
    draft: {
      name: best.productName || keyword,
      currentPrice: best.productPrice ?? null,
      currency: "KRW",
      vendor: "Coupang",
      sku: best.productId ? String(best.productId) : "",
    },
    imageCandidates,
    rawProduct: best,
  };
}
