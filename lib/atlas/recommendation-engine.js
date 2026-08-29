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
} from "./atlas-scope.js";
import {
  WELLNESS_FOCUS_SIGNALS,
  WELLNESS_MODALITY_SIGNALS,
  isWellnessText,
} from "./wellness-scope.js";

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

// ─── Semantic topic signature (R2.2 duplicate hotfix) ────────────────────────
// Title wording is not a topic. R2 kept re-recommending topics ATLAS had already
// published: "Choosing Travel Medical Insurance for Senior Travelers" shares only
// two non-stopword tokens with the published art_011 ("Travel Medical Insurance
// for Seniors Over 65: A Pre-Trip Checklist"), so the token-overlap check above
// scored it 20% — LOW — and the Hard Gate let it through.
//
// A reader experiences two articles as the same one when three things agree:
// who it is for, which coverage it is about, and what they are trying to decide.
// The signature below is compared against existing article titles/slugs/search
// intents, the duplicateForbidden list, and jobs that already exist.

// Reader segment. An article written for a segment is a different article from
// the general one, so a segment match is what makes two coverage-equal topics
// collide.
const AUDIENCE_SIGNALS = [
  { id: "senior", re: /\bseniors?\b|\bover\s*6[05]\b|elderly|medicare/ },
  { id: "student", re: /\bstudents?\b|study(?:ing)?\s+abroad|semester|\bj\s*1\b/ },
  { id: "family", re: /\bfamil(?:y|ies)\b|\bchildren\b|\bkids?\b|infant/ },
  { id: "frequent-traveler", re: /frequent\s+traveler|multi\s*trip|\bannual\b/ },
  { id: "pregnancy", re: /pregnan/ },
  { id: "cruise", re: /\bcruise\b/ },
];

// Specific coverage / product type. Bare "travel insurance" is deliberately NOT
// here — it is the generic bucket below, because treating it as a type would
// make every candidate collide with every article in the cluster.
const COVERAGE_SIGNALS = [
  { id: "travel-medical", re: /travel\s+medical|medical\s+insurance|medical\s+coverage|health\s+(?:insurance|coverage|plan)/ },
  { id: "evacuation", re: /evacuation|medevac|air\s+ambulance|repatriation/ },
  { id: "trip-cancellation", re: /trip\s+cancellation|cancel\s+for\s+any\s+reason|\bcfar\b|interruption/ },
  { id: "baggage", re: /baggage|luggage/ },
  { id: "delay", re: /\bdelay/ },
  { id: "pre-existing", re: /pre\s*existing|\bwaiver\b/ },
  { id: "adventure", re: /adventure|hiking|diving|scuba|skiing|outdoor/ },
  { id: "weather", re: /hurricane|typhoon|\bstorm\b|weather/ },
];
const GENERIC_COVERAGE = /travel\s+insurance|trip\s+insurance/;

// What the reader is trying to do. Narrow on purpose: a token that matches
// almost every insurance article (the bare word "coverage") carries no
// discriminating information, so it is not listed.
const INTENT_SIGNALS = [
  { id: "compare", re: /\bcompare\b|comparison|\bvs\b|versus|which\s+.*\bfits?\b|\bbest\b/ },
  { id: "checklist", re: /checklist|pre\s*trip|before\s+you\s+(?:go|travel)|prepare|preparation/ },
  { id: "qualify", re: /qualify|eligib|\bwaiver\b|requirement/ },
  { id: "covered-reasons", re: /\bcovers?\b|\bcovered\b|what\s+.*\binclude/ },
  { id: "exclusions", re: /exclusion|not\s+covered|add\s*on/ },
  { id: "limits", re: /\blimits?\b|how\s+much\s+is\s+enough|benefit\s+amount/ },
  { id: "timing", re: /when\s+to\s+buy|how\s+(?:soon|early)|timing|deadline/ },
  { id: "claim", re: /\bclaim\b|reimburse/ },
  { id: "cost", re: /\bcost\b|\bprice\b|how\s+much\s+does/ },
];

// Slugs and searchIntentKeys are hyphenated ("travel-medical-insurance-..."), so
// every signal is matched against one normalized, space-separated string.
function normalizeTopicText(...parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchIds(signals, text) {
  return new Set(signals.filter((s) => s.re.test(text)).map((s) => s.id));
}

function overlaps(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

export function topicSignature(...parts) {
  const text = normalizeTopicText(...parts);
  return {
    text,
    audience: matchIds(AUDIENCE_SIGNALS, text),
    coverage: matchIds(COVERAGE_SIGNALS, text),
    generic: GENERIC_COVERAGE.test(text),
    intent: matchIds(INTENT_SIGNALS, text),
    // Travel Wellness cluster. Two routines are not told apart by insurance
    // type or reader segment, so they carry their own dimensions: WHICH body
    // area / context, and WITH WHAT equipment.
    wellness: isWellnessText(text),
    focus: matchIds(WELLNESS_FOCUS_SIGNALS, text),
    modality: matchIds(WELLNESS_MODALITY_SIGNALS, text),
    words: new Set(text.split(" ").filter(Boolean)),
  };
}

// Wellness-cluster duplication. Two routines are the same article when they are
// literally the same topic worded differently (a job that already exists for
// this seed), or when they hit the same body area with the same equipment for
// the same reason. Deliberately NOT "same body area" alone: massage-ball work
// and light dumbbells for tight shoulders are two genuinely different guides,
// and the launch seed set contains both.
//
// A wellness signature can never collide with an insurance one — this returns
// null unless BOTH sides carry a movement signal — so the existing cluster's
// verdicts are byte-identical to before.
const WELLNESS_TITLE_OVERLAP = 0.7;

function wellnessCollision(a, b) {
  if (!a.wellness || !b.wellness) return null;
  if (jaccard(a.words, b.words) >= WELLNESS_TITLE_OVERLAP) return "동일 주제(제목 표현만 다름)";
  if (!overlaps(a.focus, b.focus)) return null;
  if (overlaps(a.modality, b.modality) && overlaps(a.intent, b.intent))
    return "동일 부위·동일 도구 + 동일 검색 의도";
  return null;
}

// Two signatures are the same topic when they share the insurance type AND
// either the reader segment, or (for two non-segment topics) the search intent.
// Returns the human-readable reason, or null.
export function signatureCollision(a, b) {
  const wellness = wellnessCollision(a, b);
  if (wellness) return wellness;
  const bothInsurance = (a.coverage.size > 0 || a.generic) && (b.coverage.size > 0 || b.generic);
  if (!bothInsurance) return null;
  const sameSpecificType = overlaps(a.coverage, b.coverage);
  const bothGenericOnly = a.coverage.size === 0 && b.coverage.size === 0;
  // One side naming no specific type ("student travel insurance") is not a
  // different topic from the side that names one ("student travel MEDICAL
  // insurance") — for the same reader segment it is the same article.
  const eitherGenericOnly = a.coverage.size === 0 || b.coverage.size === 0;

  if (overlaps(a.audience, b.audience) && (sameSpecificType || eitherGenericOnly))
    return "동일 독자층 + 동일 보험 유형";
  if (a.audience.size === 0 && b.audience.size === 0 && (sameSpecificType || bothGenericOnly) && overlaps(a.intent, b.intent))
    return "동일 보험 유형 + 동일 검색 의도";
  return null;
}

// Topics ATLAS must never publish again, independent of what is in articles.json
// (mirrors the duplicateForbidden list shipped in the ChatGPT request file).
export const DUPLICATE_FORBIDDEN_TOPICS = [
  "Travel medical insurance vs. general travel insurance comparison",
  "How to choose / compare overseas travel insurance",
];

const LIVE_ARTICLE_STATUS = ["written", "published"];

// Minimum slots held for Travel Wellness & Everyday Fitness while it has
// eligible seeds. Without a floor a long unused-keyword list could fill every
// remaining slot and the new category would never reach the screen; with one,
// the Money Hunter refill still keeps its priority over the static seeds.
const WELLNESS_RESERVED_SLOTS = 3;

// Everything a new recommendation must not repeat: published/written articles
// (title + slug + search intent), the forbidden list, and jobs that already
// exist — a topic already in production is not a new recommendation either.
export function buildDuplicateIndex({ articles = [], jobs = [], forbidden = DUPLICATE_FORBIDDEN_TOPICS } = {}) {
  const entries = [];
  for (const a of articles) {
    if (!LIVE_ARTICLE_STATUS.includes(a?.status)) continue;
    entries.push({
      id: a.id,
      source: "article",
      signature: topicSignature(a.title, a.slug, a.searchIntentKey || a.searchIntent, a.keyword),
    });
  }
  for (const j of jobs) {
    if (!j?.topic || j.status === "FAILED") continue;
    entries.push({ id: j.id, source: "job", signature: topicSignature(j.topic, j.searchIntent) });
  }
  for (const t of forbidden) {
    entries.push({ id: t, source: "duplicateForbidden", signature: topicSignature(t) });
  }
  return entries;
}

// First entry the candidate collides with, or null.
export function findSemanticDuplicate(candidate, index = []) {
  const sig = topicSignature(candidate.title, candidate.slug, candidate.searchIntent, candidate.keyword);
  for (const e of index) {
    const reason = signatureCollision(sig, e.signature);
    if (reason) return { id: e.id, source: e.source, reason };
  }
  return null;
}

// ─── Hard Gate ───────────────────────────────────────────────────────────────
// Every rule must pass for a topic to become a Production candidate. A high
// score can never bypass this.
function hardGate(candidate, dup, duplicateIndex = []) {
  const failures = [];
  if (!isEnglish(candidate.title) || !isEnglish(candidate.searchIntent))
    failures.push("대상 독자/언어: 영문이 아님");
  if (!AXIS_IDS.has(candidate.axis)) failures.push("ATLAS 콘텐츠 축에 포함되지 않음");
  if (dup.duplicationRisk === "HIGH") failures.push(`기존 글과 검색 의도 중복(HIGH): ${dup.overlappingArticleIds.join(", ")}`);
  const semantic = findSemanticDuplicate(candidate, duplicateIndex);
  if (semantic) failures.push(`핵심 주제 중복(${semantic.source} ${semantic.id}): ${semantic.reason}`);
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
function evaluate(candidate, articles, { liveData, affiliateActiveCount, duplicateIndex = [] }) {
  const dup = assessDuplication(candidate, articles);
  const gate = hardGate(candidate, dup, duplicateIndex);
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
    // Only cards filled from keywords.json carry these: the real Money Hunter id
    // and the keyword exactly as stored, so the job and the ChatGPT request file
    // key off kw_0xx instead of minting a second identity from the title.
    ...(candidate.moneyHunterId ? { moneyHunterId: candidate.moneyHunterId, keyword: candidate.keyword } : {}),
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

// Turns an unused keywords.json candidate into a recommendation card. Used to
// refill the slots the duplicate gate emptied — the keyword text is carried
// verbatim (only capitalized for display) and no score is invented: moneyScore
// stays exactly what Money Hunter recorded, including null.
const KEYWORD_USED_STATUS = ["written", "published", "selected"];

function unusedCandidateCards(keywords, usedIds) {
  const used = new Set(usedIds);
  return keywords
    .filter((k) => k?.id && k.keyword)
    .filter((k) => !used.has(k.id) && !KEYWORD_USED_STATUS.includes(k.status))
    .filter((k) => isEnglish(k.keyword))
    .map((k) => {
      const scope = detectScope(`${k.keyword} ${k.category || ""}`);
      if (!scope.inScope) return null;
      return {
        title: k.keyword.replace(/\b[a-z]/g, (c) => c.toUpperCase()),
        keyword: k.keyword,
        moneyHunterId: k.id,
        searchIntent: k.intent || k.keyword,
        type: "guide",
        axis: scope.axis,
        relatedArticleIds: [],
        futureProductCategories: [],
        origin: "money-hunter-unused",
        reason: `미사용 Money Hunter 후보(${k.id}). 중복으로 제외된 추천 슬롯을 채웠습니다 — 트렌드·검색량은 확인되지 않았습니다.`,
      };
    })
    .filter(Boolean)
    // Newest discovery first: the freshest unused candidate fills the slot.
    .sort((a, b) => String(b.moneyHunterId).localeCompare(String(a.moneyHunterId)));
}

export function buildRecommendations({
  keywords = [],
  articles = [],
  categories = [],
  jobs = [],
  usedCandidateIds = [],
  affiliateActiveCount = 0,
  liveData = false,
  now = new Date(),
  limit = 10,
} = {}) {
  // Everything a candidate must not repeat, assembled BEFORE any card is
  // confirmed: existing articles, the forbidden list, and jobs already created.
  const duplicateIndex = buildDuplicateIndex({ articles, jobs });
  const usedIds = [
    ...usedCandidateIds,
    ...jobs.map((j) => j?.moneyHunterId).filter(Boolean),
  ];

  // Only the in-scope English editorial seeds can become Production candidates.
  const evaluated = EDITORIAL_SEEDS.map((seed) =>
    evaluate(seed, articles, { liveData, affiliateActiveCount, duplicateIndex }),
  );

  const accepted = [];
  // A confirmed card joins the index, so two cards in the same batch can never
  // be the same topic either.
  const runningIndex = [...duplicateIndex];
  const confirm = (card) => {
    accepted.push(card);
    runningIndex.push({
      id: card.title,
      source: "이번 주 추천",
      signature: topicSignature(card.title, card.searchIntent, card.keyword),
    });
  };

  const selfRejected = [];
  // A seed is only ever considered once, even though the passes below walk the
  // same list more than one time to top the batch back up.
  const handled = new Set();
  const takeSeeds = (cards, cap) => {
    for (const card of cards) {
      if (accepted.length >= cap) break;
      if (handled.has(card)) continue;
      const clash = findSemanticDuplicate({ title: card.title, searchIntent: card.searchIntent }, runningIndex);
      if (clash) {
        handled.add(card);
        selfRejected.push({ topic: card.title, sourcePool: "editorial-seed", reason: `핵심 주제 중복(${clash.source} ${clash.id}): ${clash.reason}` });
        continue;
      }
      handled.add(card);
      confirm(card);
    }
  };

  const passing = evaluated.filter((c) => c.hardGate.pass).sort((a, b) => b.score - a.score);
  const isWellnessCard = (c) => String(c.contentAxis?.id || "").startsWith("wellness-");
  const wellnessCards = passing.filter(isWellnessCard);

  // Slots emptied by the duplicate gate are refilled from unused Money Hunter
  // candidates — the same gate applies to them, so a refill can never smuggle a
  // duplicate back onto the screen.
  const refillPool = unusedCandidateCards(keywords, usedIds);
  const refillTaken = new Set();
  const takeRefill = (cap) => {
    for (const seed of refillPool) {
      if (accepted.length >= cap) break;
      if (refillTaken.has(seed)) continue;
      refillTaken.add(seed);
      const card = evaluate(seed, articles, { liveData, affiliateActiveCount, duplicateIndex: runningIndex });
      if (!card.hardGate.pass) {
        selfRejected.push({ topic: card.title, sourcePool: "keywords.json", reason: card.hardGate.failures.join(" · ") });
        continue;
      }
      confirm(card);
    }
  };

  // Order matters, and it is not just "highest score first".
  //   1. The original travel-insurance seeds keep first claim, but stop short
  //      of the floor reserved for the second category. Without that stop, a
  //      dozen evergreen insurance seeds would fill all ten slots every week
  //      and Travel Wellness would never reach the screen.
  //   2. The Money Hunter refill runs next at the FULL limit, exactly as it did
  //      before this category existed. Those are keywords the operator actually
  //      researched, so they keep their precedence over any static seed — the
  //      floor is carved out of the editorial seeds, never out of the refill.
  //   3. Travel Wellness seeds take whatever the floor kept open.
  //   4. Leftovers top the batch back up, so a short wellness list never costs
  //      the batch a card.
  const travelCards = passing.filter((c) => !isWellnessCard(c));
  const reserved = Math.min(WELLNESS_RESERVED_SLOTS, wellnessCards.length);
  takeSeeds(travelCards, limit - reserved);
  takeRefill(limit);
  takeSeeds(wellnessCards, limit);
  takeSeeds(travelCards, limit);

  const production = accepted.map((c, i) => ({ ...c, priority: i + 1 }));

  const rejectedSeeds = evaluated
    .filter((c) => !c.hardGate.pass)
    .map((c) => ({ topic: c.title, sourcePool: "editorial-seed", reason: c.hardGate.failures.join(" · ") }));

  const rejected = [...rejectedSeeds, ...selfRejected, ...rejectedPoolItems(keywords, categories)];

  return {
    generatedAt: now.toISOString(),
    sourceMode: liveData ? "LIVE" : "EDITORIAL_FALLBACK",
    liveData,
    scopeNote: liveData
      ? "실시간 트렌드 데이터 기반 후보입니다."
      : "실시간 트렌드가 연결되지 않았습니다. 현재 후보는 ATLAS 편집 기준(여행보험·여행 안전 클러스터) 기반이며, 실제 트렌드·검색량으로 검증되지 않았습니다.",
    dataSources: [
      "ATLAS editorial evergreen seeds (in-scope, English)",
      "articles.json (발행·작성 완료 글의 제목·slug·검색의도 중복 검사)",
      "production-jobs (이미 생성된 작업) · duplicateForbidden",
      "keywords.json 미사용 후보 (중복 제외로 빈 슬롯 보충)",
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
// Existing jobs are deliberately NOT part of this gate: re-clicking a card must
// still resolve to its own job (idempotency) instead of being refused. Only what
// is already written/published — and the forbidden list — can block generation.
export function assertProductionEligible(candidate, articles = []) {
  if (!candidate || typeof candidate !== "object")
    return { ok: false, reason: "후보 데이터가 없습니다." };
  const normalized = {
    title: candidate.title,
    searchIntent: candidate.searchIntent || candidate.title,
    keyword: candidate.keyword,
    axis: candidate.contentAxis?.id || candidate.axis,
    relatedArticleIds: candidate.relation?.relatedArticleIds || candidate.relatedArticleIds || [],
    sourceAvailable: candidate.officialSource?.availability !== "UNAVAILABLE",
    slug: candidate.slug,
  };
  const dup = assessDuplication(normalized, articles);
  const gate = hardGate(normalized, dup, buildDuplicateIndex({ articles }));
  return {
    ok: gate.pass,
    reason: gate.pass ? null : `범위 밖 후보 — 원고 생성 차단: ${gate.failures.join(" · ")}`,
    duplicationRisk: dup.duplicationRisk,
  };
}
