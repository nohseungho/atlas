// ─── Weekly Recommendation Engine (ATLAS R2) ─────────────────────────────────
// Produces "이번 주 자동추천" candidates from data the app ACTUALLY has:
// local keyword ideas, the category seed list, and the existing article corpus.
//
// Honesty contract (this is a PASS/FAIL requirement of the sprint):
//   • We have no live trends/SERP/marketplace API wired. So 7-day / 30-day
//     trend and live competition are reported as UNKNOWN with an explicit
//     NEEDS_CONFIGURATION reason — never a fabricated number.
//   • Seasonality and a manual competition estimate exist in keywords.json;
//     they are surfaced but LABELLED as local manual estimates, not live data.
//   • The composite score is a transparent local heuristic with a breakdown,
//     not a "trend score".
//   • Official source URLs are not invented — they stay NEEDS_CONFIGURATION
//     until a human/research step supplies a real, read URL.
//   • With zero active affiliate products, product-type candidates carry
//     productStatus = "제휴 승인 대기" and never emit a sales CTA.

const STOPWORDS = new Set([
  "the", "a", "an", "to", "for", "of", "and", "or", "in", "on", "your", "you",
  "how", "what", "best", "vs", "with", "is", "are", "2025", "2026",
]);

function words(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

function jaccard(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let inter = 0;
  for (const w of aSet) if (bSet.has(w)) inter += 1;
  return inter / (aSet.size + bSet.size - inter);
}

// ─── Type classification ─────────────────────────────────────────────────────
// tip = 실용정보/팁, product = 제품형, comparison = 비교형, info = 정보형
export function classifyTopicType(topic, intent) {
  const t = String(topic || "").toLowerCase();
  if (/\bvs\b|compare|comparison|difference between/.test(t)) return "comparison";
  if (/\bbest\b|top \d|review|cheapest|which .* to buy/.test(t)) return "product";
  if (/how to|tips|guide|checklist|what to do|ways to|avoid/.test(t)) return "tip";
  if (intent === "commercial" || intent === "transactional") return "product";
  return "info";
}

// The three sprint buckets: 40% practical(팁/정보), 40% 제품/비교, 20% 계절성/장기.
const BUCKET_BY_TYPE = { tip: "practical", info: "practical", product: "commercial", comparison: "commercial" };
const BUCKET_TARGET = { practical: 4, commercial: 4, seasonal: 2 };

function bucketOf(type, seasonalityLevel) {
  // A high manual seasonality signal (4-5) routes an item into the seasonal bucket,
  // regardless of type, so the 20% long-tail/seasonal slice is filled from real data.
  if (typeof seasonalityLevel === "number" && seasonalityLevel >= 4) return "seasonal";
  return BUCKET_BY_TYPE[type] || "practical";
}

// ─── Duplication vs the existing corpus ──────────────────────────────────────
export function duplicationAgainstCorpus(topic, keyword, articles) {
  const cand = new Set(words(`${topic} ${keyword || ""}`));
  let max = 0;
  let matchedId = "";
  for (const a of articles || []) {
    if (!["written", "published", "draft"].includes(a?.status)) continue;
    const corpus = new Set(words(`${a.title} ${a.keyword} ${(a.tags || []).join(" ")}`));
    const score = jaccard(cand, corpus);
    if (score > max) {
      max = score;
      matchedId = a.id;
    }
  }
  let level = "none";
  if (max >= 0.5) level = "high";
  else if (max >= 0.3) level = "medium";
  else if (max >= 0.15) level = "low";
  return { level, overlap: Math.round(max * 100), matchedArticleId: matchedId };
}

// ─── Candidate pool ──────────────────────────────────────────────────────────
// Two real local sources only:
//   1. keywords.json ideas the corpus has not claimed yet.
//   2. categories.json exampleKeywords (explicit editorial seed list).
function poolFromKeywords(keywords, articles) {
  const claimed = new Set();
  for (const a of articles || []) {
    if (["written", "published", "draft"].includes(a?.status)) {
      if (a.keyword) claimed.add(String(a.keyword).toLowerCase());
      if (a.keywordId) claimed.add(String(a.keywordId));
    }
  }
  return (keywords || [])
    .filter((k) => k?.status !== "published" && !claimed.has(String(k.keyword).toLowerCase()) && !claimed.has(k.id))
    .map((k) => ({
      topic: k.keyword,
      intent: k.intent,
      origin: "keyword-idea",
      moneyScore: typeof k.moneyScore === "number" ? k.moneyScore : null,
      seasonalityLevel: k.seasonality ?? null,
      competitionLocalEstimate: k.competitionLevel ?? null,
      commercialLevel: k.commercialLevel ?? null,
      category: k.category || "",
    }));
}

function poolFromCategories(categories) {
  const out = [];
  for (const c of categories || []) {
    for (const seed of c.exampleKeywords || []) {
      out.push({
        topic: seed,
        intent: null,
        origin: `category-seed:${c.slug}`,
        moneyScore: null,
        seasonalityLevel: null,
        competitionLocalEstimate: null,
        commercialLevel: null,
        category: c.label || c.slug,
      });
    }
  }
  return out;
}

// ─── Scoring (transparent, local-only) ───────────────────────────────────────
function scoreCandidate(item, dup) {
  // Base: money score when we have a real local metric, else a neutral 50.
  const base = typeof item.moneyScore === "number" ? item.moneyScore : 50;
  const dupPenalty = { none: 0, low: 8, medium: 20, high: 45 }[dup.level] || 0;
  const gapBonus = dup.level === "none" ? 10 : 0;
  const composite = Math.max(0, Math.min(100, Math.round(base + gapBonus - dupPenalty)));
  return {
    composite,
    breakdown: {
      base: { value: base, source: item.moneyScore == null ? "default(50): 로컬 지표 없음" : "keywords.json moneyScore" },
      gapBonus,
      dupPenalty,
    },
  };
}

function monetization(type, item, affiliateActiveCount) {
  const productType = type === "product" || type === "comparison";
  if (!productType) {
    return { level: "정보형(직접 판매 아님)", productStatus: "N/A", salesCtaAllowed: false };
  }
  // Product-shaped topic, but honesty gate: no active affiliate product means
  // we do NOT promise sales potential or emit a CTA.
  if (!affiliateActiveCount) {
    return {
      level: "ESTIMATE_BLOCKED",
      productStatus: "제휴 승인 대기",
      salesCtaAllowed: false,
      note: "활성 제휴 상품 0개 — 판매 CTA를 생성하지 않습니다.",
    };
  }
  const c = item.commercialLevel ?? 3;
  return {
    level: c >= 4 ? "높음(ESTIMATE_LOCAL)" : c >= 3 ? "보통(ESTIMATE_LOCAL)" : "낮음(ESTIMATE_LOCAL)",
    productStatus: "제휴 연결 가능",
    salesCtaAllowed: true,
  };
}

export function buildRecommendations({
  keywords = [],
  articles = [],
  categories = [],
  affiliateActiveCount = 0,
  now = new Date(),
  limit = 10,
} = {}) {
  const seen = new Set();
  const pool = [...poolFromKeywords(keywords, articles), ...poolFromCategories(categories)].filter((item) => {
    const key = String(item.topic).toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const enriched = pool.map((item) => {
    const type = classifyTopicType(item.topic, item.intent);
    const dup = duplicationAgainstCorpus(item.topic, item.topic, articles);
    const { composite, breakdown } = scoreCandidate(item, dup);
    const bucket = bucketOf(type, item.seasonalityLevel);
    return {
      topic: item.topic,
      title: item.topic,
      type,
      bucket,
      origin: item.origin,
      category: item.category,
      reason: buildReason(type, dup, item),
      // Honest signal reporting — never a fabricated trend number.
      trend: {
        sevenDay: "UNKNOWN",
        thirtyDay: "UNKNOWN",
        source: "NEEDS_CONFIGURATION: 실시간 트렌드 API 미연동",
      },
      seasonality:
        item.seasonalityLevel == null
          ? { level: "UNKNOWN", source: "NEEDS_CONFIGURATION" }
          : { level: item.seasonalityLevel, source: "local manual estimate (keywords.json)" },
      competition:
        item.competitionLocalEstimate == null
          ? { live: "UNKNOWN", localEstimate: null, source: "NEEDS_CONFIGURATION: SERP 경쟁도 API 미연동" }
          : { live: "UNKNOWN", localEstimate: item.competitionLocalEstimate, source: "local manual estimate only" },
      productCategory: item.category || "UNKNOWN",
      monetization: monetization(type, item, affiliateActiveCount),
      officialSource: { url: "", collectedAt: null, status: "NEEDS_CONFIGURATION: 공식 출처 미수집(원고 생성 단계에서 실제 URL 확보)" },
      duplication: dup,
      score: composite,
      scoreBreakdown: breakdown,
    };
  });

  // Fill each bucket toward its target, best score first, then top up to `limit`.
  const byBucket = { practical: [], commercial: [], seasonal: [] };
  for (const c of enriched.sort((a, b) => b.score - a.score)) byBucket[c.bucket].push(c);

  const picked = [];
  const pushUnique = (c) => {
    if (picked.length < limit && !picked.includes(c)) picked.push(c);
  };
  for (const [bucket, target] of Object.entries(BUCKET_TARGET)) {
    byBucket[bucket].slice(0, target).forEach(pushUnique);
  }
  // Top up from the global best if any bucket was short.
  for (const c of enriched) pushUnique(c);

  const final = picked.slice(0, limit).map((c, i) => ({ ...c, priority: i + 1 }));

  return {
    generatedAt: now.toISOString(),
    poolSize: pool.length,
    affiliateActiveCount,
    dataSources: [
      "keywords.json (로컬 키워드 아이디어)",
      "categories.json (편집 시드 리스트)",
      "articles.json (중복 검사 대상)",
    ],
    blocked: affiliateActiveCount === 0 ? ["BLOCKED_AFFILIATE_APPROVAL"] : [],
    unknownFields: ["trend.sevenDay", "trend.thirtyDay", "competition.live", "officialSource.url"],
    candidates: final,
    mix: {
      practical: final.filter((c) => c.bucket === "practical").length,
      commercial: final.filter((c) => c.bucket === "commercial").length,
      seasonal: final.filter((c) => c.bucket === "seasonal").length,
    },
  };
}

function buildReason(type, dup, item) {
  const parts = [];
  const typeLabel = { tip: "실용 팁형", info: "정보형", product: "제품형", comparison: "비교형" }[type];
  parts.push(`${typeLabel} 주제`);
  if (item.origin.startsWith("category-seed")) parts.push("편집 시드 카테고리 기반");
  else parts.push("미사용 로컬 키워드");
  if (dup.level === "none") parts.push("기존 글과 검색의도 중복 없음");
  else parts.push(`기존 ${dup.matchedArticleId || "글"}과 중복도 ${dup.overlap}% (${dup.level})`);
  return parts.join(" · ");
}
