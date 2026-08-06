// ─── ATLAS SEO Engine (V1) ───────────────────────────────────────────────────
// Derives every SEO surface from an imported draft: slug, meta description,
// labels, internal links, JSON-LD, Related ATLAS Guides. Pure — no IO, no @/
// imports — so all of it is unit-testable without a server.
//
// Hard rule (§5): an internal link may only ever point at a REAL publishedUrl
// recorded in articles.json. An article without a live public URL is not
// linkable, full stop — that is what produced the two 404 internal targets the
// audit found. Nothing here invents a URL, a statistic, or a search figure.
import { STATE } from "./content-pipeline-state.js";

export const SITE_NAME = "ATLAS — Travel Risk & Cost Guides";
export const SITE_URL = "https://atlas-money-2026.blogspot.com";

// The six clusters the blog is built around. `match` decides which cluster a
// keyword belongs to; `labels` are the Blogger labels that cluster contributes.
//
// ORDER IS THE TIE-BREAK: the first matching cluster wins, so the more specific
// pattern must come first. Baggage precedes flight-disruption because "delayed
// baggage" would otherwise be swallowed by "delay". The insurance pattern is
// deliberately limited to insurance-product vocabulary — generic words like
// "coverage" and "policy" appear in every cluster and used to pull medical and
// baggage topics into Travel Insurance.
export const CONTENT_CLUSTERS = [
  {
    id: "travel-insurance",
    name: "Travel Insurance",
    labels: ["Travel Insurance", "Trip Cost"],
    match: /travel insurance|trip insurance|insurance policy|policy wording|deductible|premium|reimburs/i,
  },
  {
    id: "medical-abroad",
    name: "Medical Emergencies Abroad",
    labels: ["Medical Abroad", "Travel Health"],
    match: /medical|hospital|evacuation|illness|sick|prescription|vaccin|doctor|emergency care|health kit/i,
  },
  {
    id: "baggage",
    name: "Lost or Delayed Baggage",
    labels: ["Baggage", "Passenger Rights"],
    match: /baggage|luggage|suitcase|checked bag|lost bag|carry-?on/i,
  },
  {
    id: "flight-disruption",
    name: "Flight Cancellation & Delay",
    labels: ["Flight Delay", "Passenger Rights"],
    match: /flight|cancell?ation|delay|rebook|tarmac|overbook|denied boarding|refund|airline/i,
  },
  {
    id: "senior-family",
    name: "Senior & Family Travel",
    labels: ["Senior Travel", "Family Travel"],
    match: /senior|elderly|medicare|child|kid|family|infant|pregnan|pre-?existing condition/i,
  },
  {
    id: "trip-safety",
    name: "Trip Safety & Emergency Preparation",
    labels: ["Trip Safety", "Travel Prep"],
    match: /safety|emergency|embassy|theft|scam|natural disaster|advisory|water safety|food safety|prepare/i,
  },
];

export const SEO_LIMITS = {
  metaDescription: [150, 160], // §5: 150~160자
  labels: [2, 4],
  internalLinks: [2, 4],
  titleChars: [30, 70],
};

// Authority domains for §6 ("최소 3개의 실제 권위 출처"). Kept explicit rather
// than pattern-guessed so a marketing blog can never pass as a source.
export const AUTHORITY_HOSTS = [
  "cdc.gov",
  "wwwnc.cdc.gov",
  "travel.state.gov",
  "state.gov",
  "transportation.gov",
  "dot.gov",
  "tsa.gov",
  "cms.gov",
  "medicare.gov",
  "naic.org",
  "faa.gov",
  "usa.gov",
  "ftc.gov",
  "who.int",
];

export function hostOf(url) {
  const m = /^https:\/\/([^/?#]+)/i.exec(String(url || "").trim());
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}

export function isAuthoritySource(url) {
  const host = hostOf(url);
  if (!host) return false;
  return AUTHORITY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function classifyCluster(text) {
  const s = String(text || "");
  return CONTENT_CLUSTERS.find((c) => c.match.test(s)) || null;
}

// ─── Slug ────────────────────────────────────────────────────────────────────
export function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Collision-free slug. Blogger itself appends "_02069363082" when two posts
// share a slug (which is exactly how art_005/art_006 ended up with URLs ATLAS
// did not know about), so we resolve collisions here instead — readably.
export function uniqueSlug(base, existingSlugs = []) {
  const taken = new Set((existingSlugs || []).map((s) => slugify(s)).filter(Boolean));
  const root = slugify(base) || "atlas-guide";
  if (!taken.has(root)) return root;
  for (let i = 2; i <= 50; i += 1) {
    const candidate = `${root}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

// ─── Meta description ────────────────────────────────────────────────────────
const [META_MIN, META_MAX] = SEO_LIMITS.metaDescription;

export function validateMetaDescription(value) {
  const s = String(value || "").trim();
  const issues = [];
  if (!s) return { ok: false, length: 0, issues: ["meta description가 없습니다."] };
  if (/[<>]/.test(s)) issues.push("meta description에 태그 문자가 있습니다.");
  if (/[\r\n]/.test(s)) issues.push("meta description에 줄바꿈이 있습니다.");
  if (s.length < META_MIN || s.length > META_MAX) {
    issues.push(`meta description ${s.length}자 (${META_MIN}~${META_MAX}자 필요)`);
  }
  return { ok: issues.length === 0, length: s.length, issues };
}

// Trims an over-long description at a word boundary. Never pads a short one:
// inventing filler text to hit 150 chars is exactly the kind of fake output
// this pipeline refuses to produce — a short description is reported instead.
export function normalizeMetaDescription(value) {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  if (s.length <= META_MAX) return s;
  const cut = s.slice(0, META_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = (lastSpace > META_MIN ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—-]+$/, "");
  return trimmed;
}

// ─── Labels ──────────────────────────────────────────────────────────────────
// 2~4 labels: the matched cluster's labels first, then explicit tags. Labels are
// deduped case-insensitively because Blogger treats them as distinct otherwise.
export function selectLabels({ title = "", keyword = "", tags = [] } = {}) {
  const cluster = classifyCluster(`${keyword} ${title}`);
  const out = [];
  const seen = new Set();
  const push = (label) => {
    const clean = String(label || "").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key) || out.length >= SEO_LIMITS.labels[1]) return;
    seen.add(key);
    out.push(clean);
  };

  if (cluster) cluster.labels.forEach(push);
  (tags || []).forEach(push);
  // A topic we cannot classify still needs the 2-label minimum, so fall back to
  // the blog-wide labels rather than shipping a post with one or zero.
  for (const fallback of ["Travel Guides", "Trip Planning"]) {
    if (out.length >= SEO_LIMITS.labels[0]) break;
    push(fallback);
  }
  return out;
}

// ─── Internal links ──────────────────────────────────────────────────────────
// Only PUBLISHED articles carrying a real https publishedUrl are linkable.
export function linkableArticles(articles = []) {
  return (articles || []).filter(
    (a) =>
      a &&
      a.id &&
      String(a.title || "").trim() &&
      /^https:\/\/\S+$/i.test(String(a.publishedUrl || "").trim()) &&
      (a.status === "published" || a.publishState === STATE.PUBLISHED.toLowerCase() || a.publishState === "published"),
  );
}

function relevanceScore(target, { keyword = "", title = "", cluster = null }) {
  const targetCluster = classifyCluster(`${target.keyword || ""} ${target.title || ""}`);
  let score = 0;
  if (cluster && targetCluster && targetCluster.id === cluster.id) score += 3;

  const words = (s) =>
    new Set(
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const mine = words(`${keyword} ${title}`);
  const theirs = words(`${target.keyword || ""} ${target.title || ""}`);
  for (const w of mine) if (theirs.has(w)) score += 1;
  return score;
}

/**
 * 2~4 internal links to real live posts, most relevant first. `excludeId` keeps
 * an article from linking to itself. Returns fewer than the minimum only when
 * the blog genuinely has fewer linkable posts — the caller reports that as a QA
 * failure rather than filling the gap with a fabricated URL.
 */
export function selectInternalLinks({ keyword = "", title = "", articles = [], excludeId = "", max = SEO_LIMITS.internalLinks[1] } = {}) {
  const cluster = classifyCluster(`${keyword} ${title}`);
  return linkableArticles(articles)
    .filter((a) => a.id !== excludeId)
    .map((a) => ({
      articleId: a.id,
      title: a.title,
      url: String(a.publishedUrl).trim(),
      cluster: classifyCluster(`${a.keyword || ""} ${a.title || ""}`)?.id || "",
      score: relevanceScore(a, { keyword, title, cluster }),
    }))
    .sort((a, b) => b.score - a.score || a.articleId.localeCompare(b.articleId))
    .slice(0, max);
}

export function validateInternalLinks(links = [], { articles = [] } = {}) {
  const issues = [];
  const [min, max] = SEO_LIMITS.internalLinks;
  const live = new Map(linkableArticles(articles).map((a) => [String(a.publishedUrl).trim(), a.id]));

  if (links.length < min) issues.push(`내부링크 ${links.length}개 (최소 ${min}개 필요)`);
  if (links.length > max) issues.push(`내부링크 ${links.length}개 (최대 ${max}개)`);

  const seen = new Set();
  for (const link of links) {
    const url = String(link?.url || "").trim();
    if (!/^https:\/\/\S+$/i.test(url)) {
      issues.push(`내부링크 URL 형식 오류: ${url || "(빈 값)"}`);
      continue;
    }
    if (!live.has(url)) issues.push(`내부링크가 실제 공개 URL이 아닙니다: ${url}`);
    if (seen.has(url)) issues.push(`내부링크 중복: ${url}`);
    seen.add(url);
  }
  return { ok: issues.length === 0, count: links.length, issues };
}

// ─── Related ATLAS Guides block ──────────────────────────────────────────────
const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function buildRelatedGuidesHtml(links = []) {
  if (!links.length) return "";
  const items = links
    .map((l) => `    <li><a href="${esc(l.url)}">${esc(l.title)}</a></li>`)
    .join("\n");
  return `<section class="atlas-related">\n  <h2>Related ATLAS Guides</h2>\n  <ul>\n${items}\n  </ul>\n</section>`;
}

// ─── JSON-LD ─────────────────────────────────────────────────────────────────
// Exactly one Article node. Only fields we actually hold are emitted — no
// invented author, rating, or date.
export function buildJsonLd(article, { siteUrl = SITE_URL, siteName = SITE_NAME } = {}) {
  const url = String(article?.publishedUrl || "").trim();
  const image = (article?.visualAssets || [])
    .map((v) => String(v?.publicUrl || "").trim())
    .filter((u) => /^https:\/\/\S+$/i.test(u));

  const node = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: String(article?.title || "").slice(0, 110),
    description: String(article?.metaDescription || ""),
    inLanguage: "en-US",
    isAccessibleForFree: true,
    publisher: { "@type": "Organization", name: siteName, url: siteUrl },
  };
  if (url) {
    node.url = url;
    node.mainEntityOfPage = { "@type": "WebPage", "@id": url };
  }
  if (image.length) node.image = image;
  if (article?.publishedAt) node.datePublished = article.publishedAt;
  if (article?.updatedAt) node.dateModified = article.updatedAt;
  return node;
}

export function validateJsonLd(node) {
  const issues = [];
  if (!node || typeof node !== "object") return { ok: false, issues: ["JSON-LD가 객체가 아닙니다."] };
  if (node["@context"] !== "https://schema.org") issues.push("@context가 schema.org가 아닙니다.");
  if (node["@type"] !== "Article") issues.push("@type이 Article이 아닙니다.");
  if (!String(node.headline || "").trim()) issues.push("headline이 없습니다.");
  if (!String(node.description || "").trim()) issues.push("description이 없습니다.");
  try {
    JSON.parse(JSON.stringify(node));
  } catch {
    issues.push("JSON 직렬화 실패");
  }
  return { ok: issues.length === 0, issues };
}

export function jsonLdScriptTag(node) {
  // </script> inside a JSON string would close the tag early.
  const json = JSON.stringify(node, null, 2).replace(/<\//g, "<\\/");
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

// ─── One-shot SEO package ────────────────────────────────────────────────────
/**
 * Everything the publisher needs, derived from a draft + the live corpus.
 * `ok` is false when any required surface could not be produced honestly — the
 * caller must block publishing and show `issues`, never publish a partial one.
 */
export function buildSeoPackage(draft, { articles = [], excludeId = "" } = {}) {
  const keyword = draft?.keyword || draft?.title || "";
  const title = draft?.title || "";
  const cluster = classifyCluster(`${keyword} ${title}`);

  const slug = uniqueSlug(
    draft?.slug || title,
    (articles || []).filter((a) => a.id !== excludeId).map((a) => a.slug),
  );
  const metaDescription = normalizeMetaDescription(draft?.metaDescription || "");
  const metaCheck = validateMetaDescription(metaDescription);
  const labels = selectLabels({ title, keyword, tags: draft?.tags || [] });
  const internalLinks = selectInternalLinks({ keyword, title, articles, excludeId });
  const linkCheck = validateInternalLinks(internalLinks, { articles });
  const jsonLd = buildJsonLd({ ...draft, slug, metaDescription }, {});
  const jsonLdCheck = validateJsonLd(jsonLd);

  const issues = [
    ...metaCheck.issues,
    ...(labels.length < SEO_LIMITS.labels[0] ? [`라벨 ${labels.length}개 (최소 ${SEO_LIMITS.labels[0]}개)`] : []),
    ...linkCheck.issues,
    ...jsonLdCheck.issues,
  ];

  return {
    ok: issues.length === 0,
    cluster: cluster?.id || "",
    clusterName: cluster?.name || "",
    primaryKeyword: keyword,
    slug,
    metaDescription,
    metaLength: metaCheck.length,
    labels,
    internalLinks,
    relatedGuidesHtml: buildRelatedGuidesHtml(internalLinks),
    jsonLd,
    jsonLdScript: jsonLdScriptTag(jsonLd),
    issues,
  };
}
