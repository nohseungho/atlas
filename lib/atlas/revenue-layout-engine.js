// Revenue Layout Engine — category-based Hero policy, language detection,
// provider-independent affiliate resolution, and real (never placeholder)
// URL validation shared by Hero/CTA/Product/Sources/Related.
//
// Hard rules from the ATLAS Revenue Design System:
// - No fake images, no fake links, no external image-generation API.
// - If no real image/link data exists, omit the element entirely — never
//   render a broken <img>, a gray placeholder box, or an href="#".

const HANGUL_PATTERN = /[가-힣]/;

// article.language is authoritative when present. Hangul detection is only
// a fallback for legacy articles that predate the language field.
export function detectArticleLanguage(article) {
  if (article.language === "ko" || article.language === "en") return article.language;
  const sample = `${article.title || ""} ${article.bodyMarkdown || ""}`;
  return HANGUL_PATTERN.test(sample) ? "ko" : "en";
}

const CHROME = {
  ko: {
    toc: "목차",
    keyTakeaways: "핵심 포인트",
    comparisonCriteriaHeading: "핵심 비교 기준",
    faqHeading: "자주 묻는 질문 (FAQ)",
    ctaHeading: "지금 바로 확인하세요",
    ctaBody: "최신 가격·혜택 정보는 공식 페이지에서 직접 확인하세요.",
    ctaButton: "자세히 보기 →",
    bestForLabel: "추천 대상",
    disclosureLabel: "안내 사항",
    disclosureDefault:
      "이 글은 일반적인 정보 제공을 목적으로 하며, 개인 상황에 따라 실제 조건이 다를 수 있습니다. 가입·구매 전 반드시 공식 안내를 다시 확인하세요.",
    affiliateDisclosureLabel: "제휴 안내",
    updatedLabel: "마지막 업데이트",
    reviewedLabel: "마지막 검토",
    authorLabel: "이 글은 ATLAS 편집팀이 작성했습니다",
    trustIndependenceNote:
      "이 검토는 아래 출처를 근거로 작성되었으며, 제휴 관계는 편집 판단에 영향을 주지 않습니다. 구매 전 반드시 공식 약관을 확인하세요.",
    relatedHeading: "관련 글",
    sourcesHeading: "출처",
    comparisonHeaders: ["항목", "옵션 A", "옵션 B"],
    imageAltFallback: "관련 이미지",
  },
  en: {
    toc: "Table of Contents",
    keyTakeaways: "Key Takeaways",
    comparisonCriteriaHeading: "Key Comparison Criteria",
    faqHeading: "Frequently Asked Questions",
    ctaHeading: "Check the Latest Details",
    ctaBody: "Prices and terms can change — confirm the latest details on the official page.",
    ctaButton: "See Details →",
    bestForLabel: "Best for",
    disclosureLabel: "Disclosure",
    disclosureDefault:
      "This article is for general informational purposes only and isn't personalized advice. Terms vary by provider — confirm the latest details directly before purchasing or applying.",
    affiliateDisclosureLabel: "Affiliate Disclosure",
    updatedLabel: "Last updated",
    reviewedLabel: "Last reviewed",
    authorLabel: "Written by the ATLAS editorial team",
    trustIndependenceNote:
      "This review relies on the sources listed below. Any affiliate relationship does not influence this editorial analysis — confirm the official policy wording before purchasing.",
    relatedHeading: "Related Articles",
    sourcesHeading: "Sources",
    comparisonHeaders: ["Item", "Option A", "Option B"],
    imageAltFallback: "Article image",
  },
};

export function getChrome(article) {
  return CHROME[detectArticleLanguage(article)];
}

// ─── Category → Hero policy bucket ────────────────────────────────────────────
// hero-first   : Travel / Outdoor / Home / Food / Pet
// product-hero : Product Review / Affiliate Product
// info-first   : Insurance / Finance / Tax / Legal (default — safest fallback)
// safety       : Safety / Health

const CATEGORY_RULES = [
  {
    pattern: /product review|affiliate product|제품\s*리뷰|상품\s*비교|가전\s*추천/i,
    bucket: "product-hero",
  },
  {
    pattern: /insurance|finance|tax|legal|보험|금융|세금|법률|대출|투자/i,
    bucket: "info-first",
  },
  {
    pattern: /safety|health|안전|건강|응급|질환|사고\s*예방/i,
    bucket: "safety",
  },
  {
    pattern: /travel|outdoor|home|food|pet|여행|아웃도어|캠핑|인테리어|음식|반려동물/i,
    bucket: "hero-first",
  },
];

export function classifyHeroPolicy(article) {
  const text = [article.category || "", article.title || "", ...(article.tags || [])].join(" ");
  for (const { pattern, bucket } of CATEGORY_RULES) {
    if (pattern.test(text)) return bucket;
  }
  return "info-first"; // 안전한 기본값 — 근거 없이 Hero를 강제하지 않는다
}

// ─── Shared URL validation ────────────────────────────────────────────────────
// Used by Hero, CTA, Product Card, Sources, and Related Articles so all five
// surfaces reject the same dead/placeholder/unsafe values.
const BLOCKED_EXACT_URLS = new Set(["", "#", "[Affiliate Link Placeholder]"]);
const BLOCKED_URL_SUBSTRINGS = ["placeholder", "example.com"];
const BLOCKED_PROTOCOLS = ["javascript:", "data:"];

export function isValidUrl(value, { requireHttps = false } = {}) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || BLOCKED_EXACT_URLS.has(trimmed)) return false;

  const lower = trimmed.toLowerCase();
  if (BLOCKED_PROTOCOLS.some((p) => lower.startsWith(p))) return false;
  if (BLOCKED_URL_SUBSTRINGS.some((s) => lower.includes(s))) return false;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (requireHttps) return parsed.protocol === "https:";
  return parsed.protocol === "https:" || parsed.protocol === "http:";
}

// ─── Hero image resolution (real data only, priority order) ─────────────────
// 1. article.heroImage
// 2. article에 연결된 Product Center 대표 이미지 — 현재 미연결 (아래 참고)
// 3. Media Library 이미지 — 현재 미연결
// 4. Image Prompt 결과의 실제 URL — 현재 미연결
// 5. 없으면 Hero 미출력
//
// NOTE: Product Center(app/atlas/product-center)와 blog draft의 imagePrompts는
// 브라우저 localStorage 기반의 별도 시스템(app/atlas/lib/storage.js)이며,
// 이 파일은 서버(API route)와 클라이언트(Publisher 미리보기) 양쪽에서 공용으로
// 호출되므로 localStorage에 안전하게 접근할 수 없다. 이번 Sprint는 article
// 스키마에 직접 실린 heroImage만 실제로 연결한다. 2~4번 데이터 소스를 연결하려면
// 별도의 서버 접근 가능한 브릿지가 필요하며, 이는 "대규모 구조 변경"에 해당해
// 이번 Sprint 범위 밖이다.
//
// Hero requires an https URL specifically (stricter than the general CTA/
// Sources/Related validator, which also allows http).
export function resolveHeroImage(article) {
  const hero = article.heroImage;
  if (hero && isValidUrl(hero.url, { requireHttps: true })) {
    return {
      url: hero.url.trim(),
      alt: (hero.alt && hero.alt.trim()) || article.title || "",
      caption: hero.caption || "",
      source: hero.source || "",
      aspectRatio: hero.aspectRatio || "16:9",
    };
  }
  return null;
}

// ─── Provider-independent affiliate resolution ───────────────────────────────
// affiliatePlan is intentionally provider-agnostic: providerId/providerName/
// network are display/identification data only. Nothing here is hardcoded to
// any single provider (VisitorsCoverage, Amazon, Booking, Viator, CJ, Impact,
// Awin, ShareASale, ...). Adding or swapping a provider is a data change.
//
// Gate: the whole affiliate surface (top CTA, decision CTA, Product Card,
// Affiliate Disclosure) stays hidden unless status === "active" AND a real
// URL resolves. No disabled buttons, no "Coming soon" copy for pending plans.
export function isAffiliateActive(plan) {
  return Boolean(plan) && plan.status === "active";
}

export function resolveAffiliateUrl(plan) {
  if (!isAffiliateActive(plan)) return null;
  return isValidUrl(plan.url) ? plan.url.trim() : null;
}

// A product slot uses its own URL when valid, otherwise inherits the plan's
// URL. Returns null when neither resolves, so the caller can drop the slot.
export function resolveProductSlotUrl(slot, plan) {
  if (!isAffiliateActive(plan)) return null;
  if (isValidUrl(slot?.url)) return slot.url.trim();
  return resolveAffiliateUrl(plan);
}

// ─── Visual asset resolution (local preview vs Blogger publish) ─────────────
// article.visualAssets is the one shared source of image data for both
// render modes. Local preview may use localSrc (a /public path served by
// this dev/app server) purely for on-device viewing. The Blogger publish
// path must never see that path — Blogger serves posts from its own public
// domain with no access to this machine's filesystem or localhost — so
// publish mode only ever accepts a real https publicUrl, and rejects
// localhost/private-IP/file: values even if someone pastes one in by hand.
const PRIVATE_HOST_PATTERN = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|\[?::1\]?)/i;

export function isPublicImageUrl(value) {
  if (!isValidUrl(value, { requireHttps: true })) return false;
  try {
    return !PRIVATE_HOST_PATTERN.test(new URL(value.trim()).hostname);
  } catch {
    return false;
  }
}

// Resolves one visualAssets entry for the given render mode. Returns null
// (never a stub) when the entry has no usable src for that mode, so callers
// can silently omit the image instead of rendering a broken <img>.
export function resolveVisualAsset(asset, mode) {
  if (!asset || !asset.key) return null;
  const src = mode === "local" ? asset.localSrc : asset.publicUrl;
  if (mode === "local" ? !src : !isPublicImageUrl(src)) return null;
  return {
    key: asset.key,
    src,
    alt: (asset.alt || "").trim(),
    width: Number(asset.width) || 1600,
    height: Number(asset.height) || 900,
    fit: asset.fit === "contain" ? "contain" : "cover",
    placement: asset.placement || "",
  };
}

// Indexes article.visualAssets by placement key for the given mode, so box
// builders can look up "is there an image for this slot" without caring
// about array order or missing entries.
export function resolveVisualAssetsByPlacement(article, mode) {
  const assets = Array.isArray(article.visualAssets) ? article.visualAssets : [];
  const map = {};
  for (const asset of assets) {
    const resolved = resolveVisualAsset(asset, mode);
    if (resolved) map[resolved.placement] = resolved;
  }
  return map;
}
