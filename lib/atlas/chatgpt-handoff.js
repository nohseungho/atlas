// ChatGPT Handoff (ATLAS Automation Core V1 — no external generation API cost).
// Default automation mode. ATLAS exports a request file, the user runs the
// research/writing/imaging inside ChatGPT Plus, and returns one package file.
// This module is PURE (no IO, no @/ provider imports) so it is fully unit-testable
// without a server or any credential. Cloudinary upload / article write / draft
// creation live in the route that consumes these validators.
import { isSemanticDuplicate, nicheMatches } from "./money-hunter-select.js";

export const REQUEST_SCHEMA = "atlas-request/1";
export const PACKAGE_SCHEMA = "atlas-package/1";
export const IMAGE_ROLES = ["featured", "context", "comparison", "action", "checklist"];

export const MASTER_SECTIONS = [
  "Intro (2-3 sentences)",
  "Quick Answer",
  "Body (## H2 sections, 1700-2100 words)",
  "Action Checklist",
  "FAQ (exactly 5)",
  "Sources & References (>= 3 verifiable HTTPS)",
];

export const QA_CRITERIA = {
  metaDescriptionChars: [50, 160],
  faqCount: 5,
  minHttpsSources: 3,
  disclaimerExactlyOnce: true,
  faqSectionExactlyOnce: true,
  sourcesSectionExactlyOnce: true,
  imageCount: 5,
  imageAltChars: [15, 160],
  imageAltRule: "Each image needs its own descriptive alt text stating what the image shows in context — never 'featured image', 'context image', or the role name.",
  forbid: ["code fence", "h1", "placeholder URL", "data URL", "fake affiliate/price/testimonial"],
  reuseFromExisting: false,
};

const ALT_MIN_CHARS = 15;
const ALT_MAX_CHARS = 160;
// Rejects the role-name placeholders ("featured image", "context", "image 3")
// that carry no information for a screen reader or for image search.
const PLACEHOLDER_ALT_PATTERN = new RegExp(
  `^(?:${IMAGE_ROLES.join("|")}|image|photo|picture|illustration|infographic|graphic|thumbnail)` +
    `(?:\\s+(?:image|photo|picture|illustration|infographic|graphic))?\\s*\\d*$`,
  "i"
);

// An alt is meaningful when it is a real descriptive phrase: long enough to say
// something, several words, and not one of the generic role placeholders.
export function isMeaningfulAlt(value) {
  const alt = String(value || "").trim().replace(/\s+/g, " ");
  if (alt.length < ALT_MIN_CHARS || alt.length > ALT_MAX_CHARS) return false;
  if (PLACEHOLDER_ALT_PATTERN.test(alt)) return false;
  return alt.split(" ").filter(Boolean).length >= 3;
}

const NICHE_BY_BLOG = {
  blog_001: "overseas travel / travel insurance / travel health / safety",
  blog_002: "english K-Beauty",
};

// Default mode is always CHATGPT_HANDOFF (no API cost). API_AUTO is opt-in only
// via an explicit env flag — a missing OPENAI_API_KEY never blocks anything.
export function automationMode() {
  const m = (typeof process !== "undefined" ? process.env?.ATLAS_AUTOMATION_MODE : "") || "";
  return String(m).toLowerCase() === "api_auto" ? "API_AUTO" : "CHATGPT_HANDOFF";
}

// Builds the secret-free request file the user uploads to ChatGPT. Never includes
// Blogger IDs, OAuth tokens, or Cloudinary credentials.
export function buildHandoffRequest({ jobId, blog, candidate, existingArticles = [], unusedCandidates = [], persona, template }) {
  const blogId = blog?.id || "blog_001";
  return {
    schemaVersion: REQUEST_SCHEMA,
    jobId,
    blogId,
    blogName: blog?.name || "",
    niche: NICHE_BY_BLOG[blogId] || "",
    readerPersona: persona || "US Tourist",
    revenueTemplate: template || "guide",
    selectedCandidate: candidate
      ? { moneyHunterId: candidate.id, keyword: candidate.keyword, moneyScore: candidate.moneyScore ?? null, category: candidate.category || "" }
      : null,
    unusedCandidates: (unusedCandidates || []).map((c) => ({
      moneyHunterId: c.id, keyword: c.keyword, moneyScore: c.moneyScore ?? null, category: c.category || "", evidenceNeeded: true,
    })),
    existingArticles: (existingArticles || []).map((a) => ({
      id: a.id, title: a.title, slug: a.slug, searchIntent: a.searchIntent || "", status: a.status,
    })),
    duplicateForbidden: [
      ...(existingArticles || []).map((a) => a.title),
      "Travel medical insurance vs. general travel insurance comparison",
      "How to choose / compare overseas travel insurance",
    ],
    masterSections: MASTER_SECTIONS,
    qaCriteria: QA_CRITERIA,
    imageRoles: IMAGE_ROLES,
    imageAltRequired: QA_CRITERIA.imageAltRule,
    packageSchemaExpected: PACKAGE_SCHEMA,
    note: "Return one atlas-package/1 JSON with completed English MASTER HTML + 5 real base64 images (roles above), each with its own descriptive alt. The MASTER HTML must contain exactly one FAQ section, one Sources section, and one disclaimer. No secrets. Base64 is transport-only.",
  };
}

// Verifies a base64 image is a real PNG/JPEG/WebP by magic bytes and size — used
// to reject junk BEFORE any external upload. Pure (Node Buffer only).
export function validateImageBase64(mimeType, base64, { maxBytes = 12 * 1024 * 1024, minBytes = 100 } = {}) {
  const issues = [];
  if (!base64 || typeof base64 !== "string") return { ok: false, issues: ["empty base64"] };
  let buf;
  try {
    buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  } catch {
    return { ok: false, issues: ["invalid base64"] };
  }
  if (buf.length < minBytes) issues.push("image too small");
  if (buf.length > maxBytes) issues.push("image too large");
  const head = buf.subarray(0, 12);
  const hex = head.toString("hex").toUpperCase();
  const isPng = hex.startsWith("89504E47");
  const isJpg = hex.startsWith("FFD8FF");
  const isWebp = hex.startsWith("52494646") && buf.subarray(8, 12).toString("ascii") === "WEBP";
  const detected = isPng ? "image/png" : isJpg ? "image/jpeg" : isWebp ? "image/webp" : "unknown";
  if (detected === "unknown") issues.push("unrecognized image magic bytes");
  if (mimeType && detected !== "unknown" && !String(mimeType).includes(detected.split("/")[1])) {
    issues.push(`mimeType ${mimeType} != detected ${detected}`);
  }
  return { ok: issues.length === 0, detected, bytes: buf.length, issues };
}

const PACKAGE_REQUIRED = [
  "schemaVersion", "jobId", "blogId", "moneyHunterId", "title", "slug", "metaDescription",
  "coreQuestion", "searchIntentKey", "topicEntities", "desiredReaderAction", "researchQuery",
  "researchedAt", "trendEvidence", "purchaseIntent", "affiliatePotential", "contentGap",
  "sources", "faq", "articleHtml", "images",
];

// Structural + QA validation of a returned package (no dedup here). Pure.
export function validatePackageStructure(pkg, { requestJobId, blogId } = {}) {
  const issues = [];
  if (!pkg || typeof pkg !== "object") return { ok: false, issues: ["package is not an object"] };
  if (pkg.schemaVersion !== PACKAGE_SCHEMA) issues.push(`schemaVersion must be ${PACKAGE_SCHEMA}`);
  for (const k of PACKAGE_REQUIRED) {
    const v = pkg[k];
    if (v === undefined || v === null || v === "") issues.push(`missing ${k}`);
  }
  if (requestJobId && pkg.jobId !== requestJobId) issues.push("jobId mismatch with request");
  if (blogId && pkg.blogId !== blogId) issues.push("blogId mismatch with request");

  const meta = String(pkg.metaDescription || "");
  if (meta.length < 50 || meta.length > 160) issues.push(`metaDescription length ${meta.length} (need 50-160)`);
  if (/[<>]/.test(meta) || /[\r\n]/.test(meta)) issues.push("metaDescription has tags/newlines");

  const sources = pkg.sources || [];
  const https = sources.filter((s) => /^https:\/\/\S+/.test(typeof s === "string" ? s : s?.url || ""));
  if (https.length < 3) issues.push(`fewer than 3 HTTPS sources (${https.length})`);

  const faq = pkg.faq || [];
  if (faq.length !== 5) issues.push(`faq must be exactly 5 (${faq.length})`);

  const imgs = pkg.images || [];
  if (imgs.length !== 5) issues.push(`images must be exactly 5 (${imgs.length})`);
  const roles = imgs.map((i) => i.role);
  for (const r of IMAGE_ROLES) if (!roles.includes(r)) issues.push(`missing image role: ${r}`);

  // Descriptive alt text is required per image, and must differ per image. The
  // import used to substitute "<role> image" when alt was missing, which is how
  // an article shipped with 5 alts that describe nothing.
  const alts = [];
  for (const img of imgs) {
    const alt = String(img?.alt || "").trim();
    if (!isMeaningfulAlt(alt)) {
      issues.push(`image ${img?.role || "?"}: alt must be descriptive text (${ALT_MIN_CHARS}-${ALT_MAX_CHARS} chars, 3+ words, not the role name)`);
      continue;
    }
    alts.push(alt.toLowerCase());
  }
  if (new Set(alts).size !== alts.length) issues.push("image alt text must be unique per image");

  return { ok: issues.length === 0, issues };
}

// MASTER QA on the article HTML (pre-Cloudinary). The 5-distinct-URL / img-count
// check runs AFTER image upload, in the route. Pure.
export function validatePackageHtml(html) {
  const s = String(html || "");
  const issues = [];
  if (/```/.test(s)) issues.push("code fence present");
  if ((s.match(/<h1\b/gi) || []).length > 0) issues.push("h1 present");
  if (/\bdata:image\//i.test(s)) issues.push("data URL in html");
  if (/(PLACEHOLDER|example\.com|YOUR_[A-Z_]+|\/path\/to\/)/i.test(s)) issues.push("placeholder/fake URL");
  if (/(AFFILIATE_LINK|buy now|amazon\.[a-z]|add to cart|product-card)/i.test(s)) issues.push("fake affiliate/sales surface");
  const disc = (s.match(/disclaimer/gi) || []).length;
  if (disc !== 1) issues.push(`disclaimer must appear exactly once (found ${disc})`);
  // Exactly one FAQ and one Sources section. A body carrying two of either is
  // already broken before the chrome assembler adds anything.
  const faq = (s.match(/<h[23][^>]*>[^<]*(?:\bFAQ\b|Frequently Asked Questions)[^<]*<\/h[23]>/gi) || []).length;
  const src = (s.match(/<h[23][^>]*>[^<]*(?:\bSources\b|\bReferences\b)[^<]*<\/h[23]>/gi) || []).length;
  if (faq !== 1) issues.push(`FAQ section must appear exactly once (found ${faq})`);
  if (src !== 1) issues.push(`Sources section must appear exactly once (found ${src})`);
  return { ok: issues.length === 0, issues };
}

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// Semantic dedup verdict: PASS | DUPLICATE_REVIEW_REQUIRED | FAIL. Compares the
// package's structured intent fields (not just the title) against existing
// articles, plus exact title/slug. Ambiguous overlap never auto-passes. Pure.
export function checkPackageDedup(pkg, existingArticles = []) {
  const existing = (existingArticles || []).map((a) => ({
    id: a.id, keyword: a.keyword || a.title, title: a.title, slug: a.slug,
    searchIntent: a.searchIntentKey || a.searchIntent || "",
    entities: a.topicEntities || [], readerAction: a.desiredReaderAction || "",
    answerScope: a.coreQuestion || a.metaDescription || "",
  }));

  for (const e of existing) {
    if (norm(e.title) === norm(pkg.title)) return { verdict: "FAIL", reason: `exact title duplicate of ${e.id}` };
    if (e.slug && pkg.slug && norm(e.slug) === norm(pkg.slug)) return { verdict: "FAIL", reason: `slug duplicate of ${e.id}` };
  }

  const candidate = {
    keyword: pkg.title, title: pkg.title, searchIntent: pkg.searchIntentKey,
    entities: pkg.topicEntities || [], readerAction: pkg.desiredReaderAction || "", answerScope: pkg.coreQuestion || "",
  };
  const dup = isSemanticDuplicate(candidate, existing);
  if (dup.duplicate) return { verdict: "FAIL", reason: dup.reason, of: dup.of };

  // Borderline: same intent + a shared entity but not a hard duplicate → review.
  const cEnt = new Set((pkg.topicEntities || []).map((x) => String(x).toLowerCase()));
  for (const e of existing) {
    const sameIntent = pkg.searchIntentKey && pkg.searchIntentKey === e.searchIntent;
    const shared = [...cEnt].some((x) => (e.entities || []).map((y) => String(y).toLowerCase()).includes(x));
    if (sameIntent && shared) return { verdict: "DUPLICATE_REVIEW_REQUIRED", reason: `borderline overlap with ${e.id}`, of: e.id };
  }
  return { verdict: "PASS" };
}

// ─── Keyword Discovery Handoff (runs BEFORE content handoff) ──────────────────
export const KEYWORD_REQUEST_SCHEMA = "atlas-keyword-request/1";
export const KEYWORD_PACKAGE_SCHEMA = "atlas-keyword-package/1";

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const KW_CANDIDATE_REQUIRED = [
  "keyword", "coreQuestion", "searchIntentKey", "topicEntities", "desiredReaderAction",
  "commercialIntent", "affiliatePotential", "competitionLevel", "trendEvidence", "sources",
];

// Builds the secret-free English-keyword discovery request for Blog 01.
export function buildKeywordRequest({ jobId, blog, existingArticles = [], existingCandidates = [], usedCandidateIds = [], persona, template }) {
  const blogId = blog?.id || "blog_001";
  const used = new Set(usedCandidateIds);
  return {
    schemaVersion: KEYWORD_REQUEST_SCHEMA,
    jobId,
    blogId,
    blogName: blog?.name || "",
    niche: NICHE_BY_BLOG[blogId] || "",
    readerPersona: persona || "US Tourist",
    revenueTemplate: template || "guide",
    language: "en",
    englishOnly: true,
    allowedNiche: "overseas travel / travel insurance / travel health / safety (English, US audience)",
    rejectTopics: ["K-Beauty", "car/auto insurance", "Korean-language keywords", "Korea-domestic-only topics"],
    existingArticles: existingArticles.map((a) => ({
      id: a.id, title: a.title, slug: a.slug, coreQuestion: a.coreQuestion || "",
      searchIntentKey: a.searchIntentKey || a.searchIntent || "", topicEntities: a.topicEntities || [],
    })),
    existingCandidates: existingCandidates.map((c) => ({
      moneyHunterId: c.id, keyword: c.keyword, category: c.category,
      used: used.has(c.id) || ["written", "published", "selected"].includes(c.status),
    })),
    duplicateForbidden: [
      ...existingArticles.map((a) => a.title),
      "compare / choose travel insurance",
      "travel medical insurance vs trip insurance",
    ],
    candidateRequiredFields: [
      "keyword (English)", "coreQuestion", "searchIntentKey", "topicEntities", "desiredReaderAction",
      "commercialIntent", "affiliatePotential", "competitionLevel", "trendEvidence", "sources (HTTPS)",
    ],
    numbersRule: "searchVolume and CPC MUST be the string UNKNOWN unless a real verified number is provided.",
    packageSchemaExpected: KEYWORD_PACKAGE_SCHEMA,
    note: "Return one atlas-keyword-package/1 with English Blog-01 candidates only. No secrets, no fabricated volume/CPC.",
  };
}

// Validates a single discovered candidate: required fields, English-only, Blog 01
// niche (rejects Korean / K-Beauty / auto-insurance), and at least one HTTPS source.
export function validateKeywordCandidate(candidate, { blogId = "blog_001" } = {}) {
  const issues = [];
  if (!candidate || typeof candidate !== "object") return { ok: false, issues: ["candidate is not an object"] };
  for (const k of KW_CANDIDATE_REQUIRED) {
    const v = candidate[k];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) issues.push(`missing ${k}`);
  }
  const kw = String(candidate.keyword || "");
  const cat = String(candidate.category || "");
  if (HANGUL.test(kw)) issues.push("Korean-language keyword rejected");
  if (!/[a-z]/i.test(kw)) issues.push("keyword is not English");
  if (/k-?beauty|skincare|cosmetic|makeup/i.test(`${kw} ${cat}`)) issues.push("K-Beauty rejected for Blog 01");
  if (/(\b(car|auto)\b[^.]*insurance)|자동차/i.test(`${kw} ${cat}`)) issues.push("auto insurance rejected for Blog 01");
  if (!nicheMatches(blogId, { category: cat, keyword: kw })) issues.push(`not in ${blogId} niche (travel/insurance/health/safety)`);
  const https = (candidate.sources || []).filter((s) => /^https:\/\/\S+/.test(typeof s === "string" ? s : s?.url || ""));
  if (https.length < 1) issues.push("no HTTPS source");
  return { ok: issues.length === 0, issues };
}

// PASS | DUPLICATE_REVIEW_REQUIRED | FAIL against existing articles + candidates.
export function checkKeywordDedup(candidate, existingArticles = [], existingCandidates = []) {
  const kwNorm = norm(candidate.keyword);
  for (const c of existingCandidates) if (norm(c.keyword) === kwNorm) return { verdict: "FAIL", reason: `duplicate of candidate ${c.id || c.keyword}` };
  const existing = (existingArticles || []).map((a) => ({
    id: a.id, keyword: a.keyword || a.title, title: a.title, slug: a.slug,
    searchIntent: a.searchIntentKey || a.searchIntent || "", entities: a.topicEntities || [],
    readerAction: a.desiredReaderAction || "", answerScope: a.coreQuestion || a.metaDescription || "",
  }));
  for (const e of existing) if (norm(e.title) === kwNorm) return { verdict: "FAIL", reason: `title duplicate of ${e.id}` };
  const cand = {
    keyword: candidate.keyword, title: candidate.keyword, searchIntent: candidate.searchIntentKey,
    entities: candidate.topicEntities || [], readerAction: candidate.desiredReaderAction || "", answerScope: candidate.coreQuestion || "",
  };
  const dup = isSemanticDuplicate(cand, existing);
  if (dup.duplicate) return { verdict: "FAIL", reason: dup.reason, of: dup.of };
  const cEnt = new Set((candidate.topicEntities || []).map((x) => String(x).toLowerCase()));
  for (const e of existing) {
    const sameIntent = candidate.searchIntentKey && candidate.searchIntentKey === e.searchIntent;
    const shared = [...cEnt].some((x) => (e.entities || []).map((y) => String(y).toLowerCase()).includes(x));
    if (sameIntent && shared) return { verdict: "DUPLICATE_REVIEW_REQUIRED", reason: `borderline overlap with ${e.id}`, of: e.id };
  }
  return { verdict: "PASS" };
}

// Validates a whole discovery package and partitions candidates into
// accepted / rejected / review. Pure — DB write happens in the route.
export function validateKeywordPackage(pkg, { requestJobId, blogId = "blog_001", existingArticles = [], existingCandidates = [] } = {}) {
  const errors = [];
  if (!pkg || typeof pkg !== "object") return { ok: false, errors: ["package is not an object"], accepted: [], rejected: [], review: [] };
  if (pkg.schemaVersion !== KEYWORD_PACKAGE_SCHEMA) errors.push(`schemaVersion must be ${KEYWORD_PACKAGE_SCHEMA}`);
  if (requestJobId && pkg.jobId !== requestJobId) errors.push("jobId mismatch");
  if (blogId && pkg.blogId && pkg.blogId !== blogId) errors.push("blogId mismatch");
  const cands = Array.isArray(pkg.candidates) ? pkg.candidates : [];
  if (!cands.length) errors.push("no candidates");

  const accepted = [];
  const rejected = [];
  const review = [];
  const seen = new Set(existingCandidates.map((c) => norm(c.keyword)));
  for (const c of cands) {
    const vs = validateKeywordCandidate(c, { blogId });
    if (!vs.ok) { rejected.push({ keyword: c.keyword, issues: vs.issues }); continue; }
    if (seen.has(norm(c.keyword))) { rejected.push({ keyword: c.keyword, issues: ["duplicate keyword (already in DB / package)"] }); continue; }
    const d = checkKeywordDedup(c, existingArticles, existingCandidates);
    if (d.verdict === "FAIL") { rejected.push({ keyword: c.keyword, issues: [d.reason] }); continue; }
    if (d.verdict === "DUPLICATE_REVIEW_REQUIRED") { review.push({ keyword: c.keyword, reason: d.reason, of: d.of }); continue; }
    seen.add(norm(c.keyword));
    accepted.push(c);
  }
  return { ok: errors.length === 0, errors, accepted, rejected, review };
}
