// ─── Weekly Recommendation Engine (ATLAS R2.1) ───────────────────────────────
// Produces "이번 주 자동추천" candidates. The R2.1 hotfix constrains output to
// ATLAS's real content scope: overseas English readers, travel-insurance /
// travel-medical / trip-safety cluster only.
//
// Honesty contract (unchanged and reinforced):
//   • No live trends/SERP API is wired → sourceMode = EDITORIAL_FALLBACK, and
//     trend/competition stay UNKNOWN. We never dress a static seed as a live
//     trend, and never invent numbers to inflate a score (unconfirmed
//     components are EXCLUDED from the total with the reason shown).
//   • A Hard Gate runs BEFORE scoring. Off-scope, non-English, or intent-
//     duplicate topics are REJECTED regardless of any score.
//   • With zero active affiliate links, product-shaped topics still score their
//     monetization POTENTIAL, but affiliate readiness stays
//     BLOCKED_AFFILIATE_APPROVAL and no sales CTA is ever emitted.
import {
  CONTENT_AXES,
  AXIS_IDS,
  axisLabel,
  isEnglish,
  detectScope,
  EDITORIAL_SEEDS,
} from "./atlas-scope";

export { CONTENT_AXES };

const STOPWORDS = new Set([
  "the", "a", "an", "to", "for", "of", "and", "or", "in", "on", "your", "you",
  "how", "what", "best", "vs", "with", "is", "are", "does", "it", "that", "when",
  "much", "enough", "abroad", "travel", "trip", "international",
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

// Kept for backward compatibility (r2-selftest imports this).
export function classifyTopicType(topic, intent) {
  const t = String(topic || "").toLowerCase();
  if (/\bvs\b|compare|comparison|difference between/.test(t)) return "comparison";
  if (/checklist/.test(t)) return "checklist";
  if (/guide/.test(t)) return "guide";
  if (/\bbest\b|top \d|review|which .* to buy/.test(t)) return "product";
  if (intent === "commercial" || intent === "transactional") return "product";
  return "info";
}

// Coarse corpus duplication (kept for compatibility + used inside assessDuplication).
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

// Richer per-candidate duplication vs the real cluster: compares title tokens,
// search intent and coverage category — not just string match.
function assessDuplication(candidate, articles) {
  const candWords = new Set(words(candidate.title));
  const overlapping = [];
  let maxOverlap = 0;
  for (const a of articles) {
    if (!["written", "published"].includes(a?.status)) continue;
    const aWords = new Set(words(a.title));
    const tOverlap = jaccard(candWords, aWords);
    const sameSlug = candidate.slug && candidate.slug === a.slug;
    if (tOverlap >= 0.35 || sameSlug) overlapping.push(a.id);
    if (tOverlap > maxOverlap) maxOverlap = tOverlap;
  }
  let risk = "LOW";
  if (maxOverlap >= 0.6 || overlapping.length >= 2) risk = "HIGH";
  else if (maxOverlap >= 0.35) risk = "MEDIUM";
  return {
    duplicationRisk: risk,
    overlappingArticleIds: overlapping,
    overlap: Math.round(maxOverlap * 100),
  };
}

// ─── Hard Gate ───────────────────────────────────────────────────────────────
// Every rule must pass for a topic to become a Production candidate. A high
// score can never bypass this.
function hardGate(candidate, dup) {
  const failures = [];
  if (!isEnglish(candidate.title) || !isEnglish(candidate.searchIntent))
    failures.push("대상 독자/언어: 영문이 아님");
  if (!AXIS_IDS.has(candidate.axis)) failures.push("ATLAS 콘텐츠 축에 포함되지 않음");
  if (dup.duplicationRisk === "HIGH") failures.push(`기존 글과 검색 의도 중복(HIGH): ${dup.overlappingArticleIds.join(", ")}`);
  if (candidate.sourceAvailable === false) failures.push("공식 근거 확보 불가");
  if (/\$\d|guaranteed|100%|cheapest ever|lowest price/i.test(candidate.title))
    failures.push("과장/확인 불가 가격·혜택 주제");
  // A candidate never assumes a direct-buy CTA — that is enforced downstream as
  // salesCtaAllowed=false while affiliate is inactive; this is a structural pass.
  return { pass: failures.length === 0, failures };
}

// ─── Scoring (6 components, unconfirmed excluded) ─────────────────────────────
function scoreCandidate(candidate, dup, liveData) {
  const breakdown = {};
  const excluded = [];

  breakdown.contentFit = 30; // in-scope (gate passed)
  breakdown.intentUsefulness = ["guide", "checklist", "comparison", "buying-guide", "segment-guide"].includes(candidate.type) ? 20 : 15;
  breakdown.clusterConnection =
    (candidate.relatedArticleIds || []).length === 0 ? 0 : dup.duplicationRisk === "MEDIUM" ? 10 : 15;
  breakdown.sourceAvailability = candidate.sourceAvailable === false ? 0 : 15;
  breakdown.monetizationReadiness = Math.round(Math.min(10, (candidate.commercial ?? 3) * 2));

  // Timeliness/seasonality needs live data we do not have → excluded, not faked.
  if (liveData && typeof candidate.seasonality === "number") {
    breakdown.timeliness = Math.round(Math.min(10, candidate.seasonality * 2));
  } else {
    excluded.push({ component: "timeliness", max: 10, reason: "실시간 트렌드/계절성 데이터 미확인 → 점수에서 제외" });
  }

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const maxAvailable = 100 - excluded.reduce((a, e) => a + e.max, 0);
  return { total, breakdown, excluded, maxAvailable };
}

// Normalize a raw seed/pool item into the evaluated candidate shape.
function evaluate(candidate, articles, { liveData, affiliateActiveCount }) {
  const dup = assessDuplication(candidate, articles);
  const gate = hardGate(candidate, dup);
  const scored = scoreCandidate(candidate, dup, liveData);
  const relatedArticleIds = (candidate.relatedArticleIds || []).filter((id) =>
    articles.some((a) => a.id === id),
  );

  const monetizationPotential =
    candidate.commercial >= 5 ? "높음" : candidate.commercial >= 4 ? "보통" : "낮음";

  return {
    title: candidate.title,
    searchIntent: candidate.searchIntent,
    type: candidate.type,
    contentAxis: { id: candidate.axis, label: axisLabel(candidate.axis) },
    reason: candidate.reason,
    origin: candidate.origin || "editorial-seed",
    sourceMode: liveData ? "LIVE" : "EDITORIAL_FALLBACK",
    liveData,
    trend: { sevenDay: "UNKNOWN", thirtyDay: "UNKNOWN", source: liveData ? "live" : "NEEDS_CONFIGURATION: 실시간 트렌드 API 미연동" },
    competition: { live: "UNKNOWN", source: "NEEDS_CONFIGURATION: SERP 경쟁도 API 미연동" },
    relation: {
      duplicationRisk: dup.duplicationRisk,
      overlappingArticleIds: dup.overlappingArticleIds,
      relatedArticleIds,
      differentiatedIntent: candidate.searchIntent,
      clusterRole: relatedArticleIds.length
        ? `기존 ${relatedArticleIds.join(", ")} 클러스터 보완`
        : "신규 클러스터 시드",
    },
    officialSource: {
      availability: candidate.sourceAvailable === false ? "UNAVAILABLE" : "AVAILABLE",
      status: "공식 출처 존재(예: US State Dept·CDC·보험 약관) — 원고 생성 단계에서 실제 URL 수집",
      collectedAt: null,
    },
    monetization: {
      potential: monetizationPotential,
      futureProductCategories: candidate.futureProductCategories || [],
      activeAffiliateLinks: affiliateActiveCount,
      affiliateReadiness: affiliateActiveCount > 0 ? "READY" : "BLOCKED_AFFILIATE_APPROVAL",
      salesCtaAllowed: false, // never true while affiliate inactive
    },
    score: scored.total,
    scoreBreakdown: scored.breakdown,
    excludedComponents: scored.excluded,
    maxAvailableScore: scored.maxAvailable,
    hardGate: gate,
    eligibility: {
      canGenerate: gate.pass,
      blockedReason: gate.pass ? null : `원고 생성 차단: ${gate.failures.join(" · ")}`,
    },
  };
}

// Off-scope pool items (keywords.json / categories.json) → surfaced only as
// REJECTED, so a reviewer can see the filter working. Never Production.
function rejectedPoolItems(keywords, categories) {
  const items = [];
  for (const k of keywords || []) {
    const scope = detectScope(k.keyword);
    if (!isEnglish(k.keyword) || !scope.inScope) {
      items.push({
        topic: k.keyword,
        sourcePool: "keywords.json",
        reason: !isEnglish(k.keyword) ? "영문 아님(국내 주제)" : "ATLAS 콘텐츠 축 밖",
      });
    }
  }
  for (const c of categories || []) {
    for (const seed of c.exampleKeywords || []) {
      const scope = detectScope(seed);
      if (!scope.inScope) {
        items.push({ topic: seed, sourcePool: `categories.json:${c.slug}`, reason: "ATLAS 콘텐츠 축 밖" });
      }
    }
  }
  return items;
}

export function buildRecommendations({
  keywords = [],
  articles = [],
  categories = [],
  affiliateActiveCount = 0,
  liveData = false,
  now = new Date(),
  limit = 10,
} = {}) {
  // Only the in-scope English editorial seeds can become Production candidates.
  const evaluated = EDITORIAL_SEEDS.map((seed) =>
    evaluate(seed, articles, { liveData, affiliateActiveCount }),
  );

  const production = evaluated
    .filter((c) => c.hardGate.pass)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c, i) => ({ ...c, priority: i + 1 }));

  const rejectedSeeds = evaluated
    .filter((c) => !c.hardGate.pass)
    .map((c) => ({ topic: c.title, sourcePool: "editorial-seed", reason: c.hardGate.failures.join(" · ") }));

  const rejected = [...rejectedSeeds, ...rejectedPoolItems(keywords, categories)];

  return {
    generatedAt: now.toISOString(),
    sourceMode: liveData ? "LIVE" : "EDITORIAL_FALLBACK",
    liveData,
    scopeNote: liveData
      ? "실시간 트렌드 데이터 기반 후보입니다."
      : "실시간 트렌드가 연결되지 않았습니다. 현재 후보는 ATLAS 편집 기준(여행보험·여행 안전 클러스터) 기반이며, 실제 트렌드·검색량으로 검증되지 않았습니다.",
    dataSources: [
      "ATLAS editorial evergreen seeds (in-scope, English)",
      "articles.json (art_002~006 중복·클러스터 검사)",
    ],
    affiliateActiveCount,
    blocked: affiliateActiveCount === 0 ? ["BLOCKED_AFFILIATE_APPROVAL"] : [],
    unknownFields: ["trend.sevenDay", "trend.thirtyDay", "competition.live", "officialSource.url"],
    counts: {
      production: production.length,
      rejected: rejected.length,
      contentAxes: CONTENT_AXES.length,
    },
    candidates: production,
    rejected: rejected.slice(0, 20),
  };
}

// ─── Shared eligibility gate (UI + server, no bypass) ────────────────────────
// Recomputes the Hard Gate from a candidate's own fields so a hand-crafted API
// payload cannot smuggle an off-scope topic into article generation.
export function assertProductionEligible(candidate, articles = []) {
  if (!candidate || typeof candidate !== "object")
    return { ok: false, reason: "후보 데이터가 없습니다." };
  const normalized = {
    title: candidate.title,
    searchIntent: candidate.searchIntent || candidate.title,
    axis: candidate.contentAxis?.id || candidate.axis,
    relatedArticleIds: candidate.relation?.relatedArticleIds || candidate.relatedArticleIds || [],
    sourceAvailable: candidate.officialSource?.availability !== "UNAVAILABLE",
    slug: candidate.slug,
  };
  const dup = assessDuplication(normalized, articles);
  const gate = hardGate(normalized, dup);
  return {
    ok: gate.pass,
    reason: gate.pass ? null : `범위 밖 후보 — 원고 생성 차단: ${gate.failures.join(" · ")}`,
    duplicationRisk: dup.duplicationRisk,
  };
}
