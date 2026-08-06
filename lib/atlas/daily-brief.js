// ─── ATLAS Daily Brief (V1) ──────────────────────────────────────────────────
// "오늘의 글 준비" in one call: pick an unused keyword, check intent/topic
// overlap against what is already public, build the content brief, choose the
// internal-link targets, and emit ONE copy-pasteable English prompt for ChatGPT.
//
// Pure — no IO, no @/ imports, no network. It calls no generation API and never
// pretends one ran (§3): the human runs the prompt in ChatGPT Plus and pastes
// the result back. Nothing here fabricates search volume, CPC, or trend data.
import { classifyCluster, selectInternalLinks, SEO_LIMITS, CONTENT_CLUSTERS, SITE_NAME } from "./seo-engine.js";
import { nicheMatches, isSemanticDuplicate } from "./money-hunter-select.js";

export const BRIEF_SCHEMA = "atlas-brief/1";
export const DRAFT_PACKAGE_SCHEMA = "atlas-package/1";

// §4 — the article skeleton. `required:false` sections are included only when
// the topic actually calls for them, so every guide does not open identically.
export const ARTICLE_SECTIONS = [
  { id: "quickAnswer", heading: "Quick Answer", required: true, note: "2-3 sentences that answer the search query outright, before any preamble." },
  { id: "moneyAtRisk", heading: "The Money at Risk", required: true, note: "What this specific problem actually costs a U.S. traveler, with sourced figures only." },
  { id: "decisionTable", heading: "Situation-by-situation comparison or decision table", required: true, note: 'A real HTML <table> comparing scenarios/options — not a restatement of the prose. Wrap it in <div style="overflow-x:auto;">.' },
  { id: "beforeYouTravel", heading: "What to Do Before You Travel", required: true, note: "Concrete pre-trip actions, in the order a reader would do them." },
  { id: "commonMistakes", heading: "Common Mistakes", required: true, note: "Mistakes that cost money or coverage, each with the consequence." },
  { id: "faq", heading: "FAQ", required: true, note: "Exactly 5 questions a U.S. traveler would actually type." },
  { id: "sources", heading: "Sources & References", required: true, note: "At least 3 authoritative HTTPS sources, linked inline where used." },
  { id: "relatedGuides", heading: "Related ATLAS Guides", required: true, note: "ATLAS inserts this block — leave the marker, do not invent URLs." },
];

// At least one of these must be present and usable on its own (§4).
export const TAKEAWAY_ARTIFACTS = ["comparison table", "decision table", "checklist", "cost-estimate breakdown"];

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Picks ONE keyword to write today: in-niche, not already used by an article or
 * an open job, and not a semantic duplicate of anything published. Highest
 * moneyScore wins; ties break on the oldest id so the queue drains in order.
 * Returns { ok:false, reason } rather than inventing a topic when none is free.
 */
export function pickDailyKeyword({ keywords = [], articles = [], usedKeywordIds = [], blogId = "blog_001" } = {}) {
  const used = new Set(usedKeywordIds.filter(Boolean));
  const publishedTitles = new Set(
    (articles || []).filter((a) => ["written", "published"].includes(a.status)).map((a) => norm(a.title)),
  );
  const existing = (articles || []).map((a) => ({
    id: a.id,
    keyword: a.keyword || a.title,
    title: a.title,
    searchIntent: a.searchIntentKey || a.searchIntent || "",
    entities: a.topicEntities || [],
    readerAction: a.desiredReaderAction || "",
    answerScope: a.coreQuestion || a.metaDescription || "",
  }));

  const skipped = [];
  const eligible = [];
  for (const k of keywords || []) {
    if (used.has(k.id)) { skipped.push({ id: k.id, keyword: k.keyword, reason: "이미 사용된 키워드" }); continue; }
    if (["written", "published", "selected"].includes(k.status)) { skipped.push({ id: k.id, keyword: k.keyword, reason: `상태 ${k.status}` }); continue; }
    if (!nicheMatches(blogId, { category: k.category, keyword: k.keyword })) { skipped.push({ id: k.id, keyword: k.keyword, reason: "블로그 niche 불일치" }); continue; }
    if (publishedTitles.has(norm(k.keyword))) { skipped.push({ id: k.id, keyword: k.keyword, reason: "기존 글 제목과 동일" }); continue; }

    const dup = isSemanticDuplicate(
      { keyword: k.keyword, title: k.keyword, searchIntent: k.intent, entities: [], readerAction: "", answerScope: "" },
      existing,
    );
    if (dup.duplicate) { skipped.push({ id: k.id, keyword: k.keyword, reason: `기존 글과 의도 중복 (${dup.of || ""})` }); continue; }

    eligible.push(k);
  }

  if (!eligible.length) {
    return { ok: false, reason: "사용 가능한 미사용 키워드가 없습니다. Money Hunter에서 키워드를 먼저 발굴하세요.", skipped };
  }

  eligible.sort((a, b) => (b.moneyScore ?? 0) - (a.moneyScore ?? 0) || String(a.id).localeCompare(String(b.id)));
  return { ok: true, keyword: eligible[0], eligibleCount: eligible.length, skipped };
}

/**
 * The content brief for one keyword: cluster, search intent, the sections the
 * article must carry, the angles already covered (so the writer avoids them),
 * and the internal-link targets — real live URLs only.
 */
export function buildContentBrief({ keyword, articles = [], blogId = "blog_001", now = new Date().toISOString() } = {}) {
  const kw = keyword?.keyword || "";
  const cluster = classifyCluster(`${kw} ${keyword?.category || ""}`);
  const internalLinks = selectInternalLinks({ keyword: kw, title: kw, articles });

  const coveredAngles = (articles || [])
    .filter((a) => a.status === "published")
    .map((a) => ({ id: a.id, title: a.title, coreQuestion: a.coreQuestion || "", cluster: classifyCluster(`${a.keyword || ""} ${a.title || ""}`)?.id || "" }));

  return {
    schemaVersion: BRIEF_SCHEMA,
    blogId,
    keywordId: keyword?.id || "",
    keyword: kw,
    category: keyword?.category || "",
    searchIntent: keyword?.intent || "informational",
    cluster: cluster?.id || "",
    clusterName: cluster?.name || "",
    audience: "U.S. travelers preparing for an international trip",
    coreQuestion: `If this goes wrong on a trip, how much can a U.S. traveler lose — and what should they do before departure?`,
    sections: ARTICLE_SECTIONS,
    requiredArtifact: TAKEAWAY_ARTIFACTS,
    coveredAngles,
    internalLinkTargets: internalLinks,
    internalLinkRule: `Use ONLY these ${internalLinks.length} URLs for internal links (${SEO_LIMITS.internalLinks[0]}-${SEO_LIMITS.internalLinks[1]}). Never invent an ATLAS URL.`,
    createdAt: now,
  };
}

const clusterList = CONTENT_CLUSTERS.map((c) => `- ${c.name}`).join("\n");

/**
 * The single prompt the user copies into ChatGPT. It embeds the brief, the
 * required JSON shape, and every hard rule the importer will enforce — so a
 * compliant reply imports on the first try instead of bouncing off validation.
 */
export function buildPromptText({ brief, jobId, existingTitles = [] } = {}) {
  const links = (brief?.internalLinkTargets || [])
    .map((l) => `  - "${l.title}" → ${l.url}`)
    .join("\n") || "  (none available — omit internal links and say so in notes)";

  const avoid = (existingTitles || []).map((t) => `  - ${t}`).join("\n") || "  (none)";
  const sections = ARTICLE_SECTIONS.map((s) => `  ${s.heading} — ${s.note}`).join("\n");

  return `You are writing one publication-ready English article for ${SITE_NAME}, a blog for U.S. travelers.

TARGET KEYWORD: ${brief?.keyword || ""}
CLUSTER: ${brief?.clusterName || "(unclassified)"}
SEARCH INTENT: ${brief?.searchIntent || "informational"}
AUDIENCE: ${brief?.audience || "U.S. travelers"}
CORE QUESTION THE ARTICLE MUST ANSWER: ${brief?.coreQuestion || ""}

BLOG CLUSTERS (stay inside these):
${clusterList}

REQUIRED SECTIONS (use these as H2 headings, in this order):
${sections}

DO NOT DUPLICATE these already-published articles — pick a genuinely different angle:
${avoid}

INTERNAL LINKS — use ONLY these real URLs, ${SEO_LIMITS.internalLinks[0]}-${SEO_LIMITS.internalLinks[1]} of them, placed inline where they help the reader:
${links}

HARD RULES (the importer rejects the article otherwise):
1. 1,700-2,100 words. No H1 — start at H2. No markdown code fences.
2. Do not open with a generic travel preamble. Start on the reader's actual problem; vary the opening from a standard template.
3. Include at least one of: ${TAKEAWAY_ARTIFACTS.join(", ")} — as a real HTML <table> or <ul>, usable on its own.
3a. EVERY <table> must be wrapped in <div style="overflow-x:auto;">...</div>. An unwrapped table overflows on a phone and the importer rejects the article for it.
4. Every cost figure, rule, and deadline must come from a source you actually cite. Invent NOTHING — no statistics, no agencies, no quotes, no case studies.
5. At least 3 authoritative HTTPS sources, preferring CDC, U.S. Department of State, DOT, TSA, CMS/Medicare, NAIC, or the actual policy/regulation text. Link them inline AND list them under "Sources & References".
6. Exactly one "FAQ" H2 (exactly 5 Q&As), exactly one "Sources & References" H2, and the word "disclaimer" exactly once.
7. Medical, insurance, and legal statements must be descriptive, never a guarantee. No "you will be covered", "guaranteed", "always pays". Say what a policy or rule typically does and tell the reader to confirm the wording.
8. No affiliate links, product links, prices to buy, "buy now" CTAs, or anything encouraging ad clicks. This blog has no approved affiliate program.
9. metaDescription must be ${SEO_LIMITS.metaDescription[0]}-${SEO_LIMITS.metaDescription[1]} characters, no tags, no line breaks.
10. Provide exactly 5 images as base64, roles: featured, context, comparison, action, checklist. Each needs its OWN descriptive alt text (15-160 chars, 3+ words) saying what the image shows — never "featured image" or the role name. Place <!--ATLAS_IMAGE:role--> markers in the HTML where each belongs.
11. Leave the "Related ATLAS Guides" H2 with an empty <ul> — ATLAS fills it from real published URLs.

RETURN FORMAT — reply with ONE JSON object and nothing else:
{
  "schemaVersion": "${DRAFT_PACKAGE_SCHEMA}",
  "jobId": "${jobId || ""}",
  "blogId": "${brief?.blogId || "blog_001"}",
  "moneyHunterId": "${brief?.keywordId || ""}",
  "title": "...", "slug": "...", "metaDescription": "...",
  "coreQuestion": "...", "searchIntentKey": "...", "topicEntities": ["..."],
  "desiredReaderAction": "...", "researchQuery": "...", "researchedAt": "YYYY-MM-DD",
  "trendEvidence": "...", "purchaseIntent": "...", "affiliatePotential": "...", "contentGap": "...",
  "tags": ["..."], "quickAnswer": "...", "moneyAtRisk": "...",
  "sources": [{ "title": "...", "url": "https://..." }],
  "faq": [{ "question": "...", "answer": "..." }],
  "articleHtml": "<h2>...</h2>...",
  "images": [{ "role": "featured", "mimeType": "image/png", "base64": "...", "alt": "..." }]
}`;
}

/**
 * The whole "오늘의 글 준비" result. `ok:false` means today's article cannot be
 * prepared and says exactly why — it never falls back to a made-up keyword.
 */
export function prepareDailyBrief({ keywords = [], articles = [], usedKeywordIds = [], blogId = "blog_001", jobId = "", now = new Date().toISOString() } = {}) {
  const picked = pickDailyKeyword({ keywords, articles, usedKeywordIds, blogId });
  if (!picked.ok) return { ok: false, reason: picked.reason, skipped: picked.skipped };

  const brief = buildContentBrief({ keyword: picked.keyword, articles, blogId, now });
  const existingTitles = (articles || []).filter((a) => a.status === "published").map((a) => a.title);
  const promptText = buildPromptText({ brief, jobId, existingTitles });

  return {
    ok: true,
    keyword: picked.keyword,
    brief,
    promptText,
    eligibleCount: picked.eligibleCount,
    internalLinkCount: brief.internalLinkTargets.length,
  };
}
