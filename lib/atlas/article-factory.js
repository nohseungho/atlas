// ─── Article Factory V1 ──────────────────────────────────────────────────────
// Validates and normalizes a hand-authored MASTER package before it is written
// into articles.json. This is NOT a content generator: it never invents body
// text, sources, or images. It only checks what a human (or Claude, outside the
// app) already wrote and refuses to persist anything incomplete or unsafe.
//
// URL policy is deliberately delegated to revenue-layout-engine so the Factory
// admits exactly what the renderer will later accept — one rule set, not two.
import { isValidUrl, isPublicImageUrl } from "./revenue-layout-engine";

export const REQUIRED_VISUAL_COUNT = 5;
export const MIN_SOURCES = 2;
export const MIN_TAKEAWAYS = 3;
export const MIN_FAQ = 3;
export const MIN_CRITERIA = 2;

// Hangul blocks — the MASTER body must be English; only koreanReview may be KR.
const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

// ─── ID / slug suggestion ────────────────────────────────────────────────────
// Mirrors the numbering already used by POST /api/articles so the Factory's
// suggestion and the eventual insert agree.
export function nextArticleId(articles) {
  const max = list(articles).reduce((acc, item) => {
    const match = /^art_(\d+)$/.exec(item?.id || "");
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `art_${String(max + 1).padStart(3, "0")}`;
}

export function suggestSlug(keyword) {
  return text(keyword)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A keyword is available when no article already claims it — by keywordId link
// or by matching keyword text on a written/published article. art_002/art_003
// carry an empty keywordId, so the text comparison is what actually protects
// the live posts from being duplicated.
const CLAIMED_STATUSES = new Set(["written", "published", "draft"]);

export function findUnusedKeywords(keywords, articles) {
  const claimedIds = new Set();
  const claimedText = new Set();

  for (const article of list(articles)) {
    if (!CLAIMED_STATUSES.has(article?.status)) continue;
    if (text(article.keywordId)) claimedIds.add(text(article.keywordId));
    if (text(article.keyword)) claimedText.add(text(article.keyword).toLowerCase());
  }

  return list(keywords).filter((k) => {
    if (k?.status === "published") return false;
    if (claimedIds.has(text(k?.id))) return false;
    return !claimedText.has(text(k?.keyword).toLowerCase());
  });
}

// ─── MASTER package validation ───────────────────────────────────────────────
// Returns { ok, errors, warnings }. Every failure is reported at once so the
// operator fixes one round instead of playing whack-a-mole.
export function validateMasterPackage(master, { articles = [], mode = "production" } = {}) {
  const errors = [];
  const warnings = [];
  const add = (msg) => errors.push(msg);

  if (!master || typeof master !== "object") {
    return { ok: false, errors: ["MASTER 패키지가 객체가 아닙니다."], warnings };
  }

  // ── English identity fields
  const title = text(master.title);
  const slug = text(master.slug);
  const metaDescription = text(master.metaDescription);
  const keyword = text(master.keyword);

  if (!title) add("title이 비어 있습니다.");
  else if (HANGUL.test(title)) add("title에 한글이 포함되어 있습니다. MASTER는 영문이어야 합니다.");

  if (!slug) add("slug가 비어 있습니다.");
  else if (!SLUG_PATTERN.test(slug))
    add("slug는 소문자·숫자·하이픈만 사용할 수 있습니다 (예: travel-insurance-guide).");

  if (!metaDescription) add("metaDescription이 비어 있습니다.");
  else if (HANGUL.test(metaDescription)) add("metaDescription에 한글이 포함되어 있습니다.");
  else if (metaDescription.length < 80 || metaDescription.length > 320)
    warnings.push(`metaDescription 길이가 ${metaDescription.length}자입니다 (권장 80~320자).`);

  if (!keyword) add("keyword가 비어 있습니다.");

  // ── Required structural blocks
  if (!text(master.quickAnswer)) add("Quick Answer가 비어 있습니다.");

  if (list(master.comparisonCriteria).filter((c) => text(c)).length < MIN_CRITERIA)
    add(`비교 기준(comparisonCriteria)이 ${MIN_CRITERIA}개 미만입니다.`);

  const body = text(master.bodyMarkdown);
  if (!body) add("bodyMarkdown(본문 섹션)이 비어 있습니다.");
  else if (!/^##\s+/m.test(body)) add("bodyMarkdown에 '## ' 섹션 헤딩이 없습니다.");

  const headers = list(master.comparisonHeaders).filter((h) => text(h));
  const table = list(master.comparisonTable);
  if (headers.length < 2) add("comparisonHeaders가 2개 미만입니다.");
  if (table.length < 2) add("comparisonTable 행이 2개 미만입니다.");
  else {
    const bad = table.findIndex((row) => list(row).length !== headers.length);
    if (bad >= 0) add(`comparisonTable ${bad + 1}행의 열 개수가 헤더와 다릅니다.`);
  }

  if (list(master.keyTakeaways).filter((t) => text(t)).length < MIN_TAKEAWAYS)
    add(`Key Takeaways가 ${MIN_TAKEAWAYS}개 미만입니다.`);

  const faq = list(master.faq).filter((f) => text(f?.question) && text(f?.answer));
  if (faq.length < MIN_FAQ) add(`FAQ가 ${MIN_FAQ}개 미만입니다 (question/answer 모두 필요).`);

  const methodology =
    typeof master.trust === "string" ? text(master.trust) : text(master.trust?.methodology);
  if (!methodology) add("Methodology/Trust 내용이 비어 있습니다.");

  // ── Sources: real https only
  const sources = list(master.sources);
  if (sources.length < MIN_SOURCES) add(`Sources가 ${MIN_SOURCES}개 미만입니다.`);
  sources.forEach((source, i) => {
    if (!text(source?.title)) add(`sources[${i}].title이 비어 있습니다.`);
    const url = text(source?.url);
    if (!url) add(`sources[${i}].url이 비어 있습니다.`);
    else if (mode === "production" && !isValidUrl(url, { requireHttps: true }))
      add(`sources[${i}].url이 실제 https URL이 아닙니다 (placeholder/localhost/file 차단).`);
  });

  // ── Visual assets: exactly 5, each with a prompt and a placement
  const visuals = list(master.visualAssets);
  if (visuals.length !== REQUIRED_VISUAL_COUNT)
    add(`visualAssets가 ${visuals.length}개입니다. 정확히 ${REQUIRED_VISUAL_COUNT}개여야 합니다.`);

  const seenKeys = new Set();
  visuals.forEach((asset, i) => {
    const key = text(asset?.key);
    if (!key) add(`visualAssets[${i}].key가 비어 있습니다.`);
    else if (seenKeys.has(key)) add(`visualAssets[${i}].key "${key}"가 중복됩니다.`);
    else seenKeys.add(key);

    if (!text(asset?.prompt)) add(`visualAssets[${i}].prompt가 비어 있습니다.`);
    if (!text(asset?.placement)) add(`visualAssets[${i}].placement가 비어 있습니다.`);
    if (!text(asset?.alt)) add(`visualAssets[${i}].alt가 비어 있습니다.`);

    // publicUrl is optional at Factory time — Cloudinary runs later. But if one
    // is present it must already satisfy the publish-mode rule.
    const publicUrl = text(asset?.publicUrl);
    if (publicUrl && mode === "production" && !isPublicImageUrl(publicUrl))
      add(`visualAssets[${i}].publicUrl이 공개 https 이미지 URL이 아닙니다.`);
  });

  // ── Korean review summary
  if (!text(master.koreanReview)) add("한국어 검수용 요약(koreanReview)이 비어 있습니다.");

  // ── Affiliate policy: absent URL means the whole surface stays hidden.
  // That is the existing renderer behaviour, so it is a warning, not an error.
  const plan = master.affiliatePlan;
  if (plan?.status === "active" && !isValidUrl(text(plan?.url)))
    add("affiliatePlan.status가 active인데 url이 유효하지 않습니다.");
  if (!plan || plan.status !== "active")
    warnings.push("제휴 URL이 없어 Disclosure·CTA·Product Card는 기존 정책대로 숨겨집니다.");

  // ── Duplicate guards against what is already in articles.json
  for (const existing of list(articles)) {
    if (slug && text(existing?.slug).toLowerCase() === slug.toLowerCase())
      add(`slug "${slug}"가 ${existing.id}와 중복됩니다.`);
    if (keyword && text(existing?.keyword).toLowerCase() === keyword.toLowerCase())
      add(`keyword "${keyword}"가 ${existing.id}와 중복됩니다.`);
    if (text(master.id) && text(existing?.id) === text(master.id))
      add(`id "${master.id}"가 이미 존재합니다.`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ─── Normalization ───────────────────────────────────────────────────────────
// Shapes a validated package into the article record schema already used by
// art_002/art_003, so Preview, image prep, and Publisher need no changes.
export function buildArticleFromMaster(master, { id, status = "written" } = {}) {
  const trust =
    typeof master.trust === "string" ? { methodology: master.trust } : master.trust || {};

  return {
    id,
    keywordId: text(master.keywordId),
    keyword: text(master.keyword),
    title: text(master.title),
    hookTitle: text(master.hookTitle) || text(master.title),
    slug: text(master.slug),
    language: "en",
    searchIntent: text(master.searchIntent) || "commercial",
    excerpt: text(master.excerpt) || text(master.metaDescription),
    metaDescription: text(master.metaDescription),
    category: text(master.category) || "Travel Insurance",
    tags: list(master.tags).map(text).filter(Boolean),
    template: text(master.template) || "revenue-comparison",
    outline: list(master.outline),
    quickAnswer: text(master.quickAnswer),
    comparisonCriteria: list(master.comparisonCriteria),
    keyTakeaways: list(master.keyTakeaways),
    comparisonHeaders: list(master.comparisonHeaders),
    comparisonTable: list(master.comparisonTable),
    sources: list(master.sources),
    trust,
    relatedArticles: list(master.relatedArticles),
    heroImage: master.heroImage || null,
    visualAssets: list(master.visualAssets),
    affiliatePlan: master.affiliatePlan || {
      providerId: "",
      providerName: "",
      network: "",
      status: "pending",
      url: "",
      disclosure: "",
      cta: { topLabel: "", decisionLabel: "" },
      productSlots: [],
    },
    bodyMarkdown: text(master.bodyMarkdown),
    faq: list(master.faq),
    qualityChecklist: list(master.qualityChecklist),
    koreanReview: text(master.koreanReview),
    status,
    publishedUrl: "",
    blogId: "",
  };
}
