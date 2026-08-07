// Pure reconciliation between ATLAS articles and the blog's real LIVE posts.
// No fs / no network / no framework imports, so the whole matching contract is
// unit-testable without a server or a Blogger call.
//
// Matching priority per article (spec order, strongest first):
//   1. stored bloggerPostId, exact
//   2. stored publishedUrl, exact canonical URL
//   3. exact normalized title — ONLY when exactly one LIVE post matches
// 2+ title candidates is a duplicate-publish hazard, so it is reported as a
// conflict and never auto-linked.
//
// This module only ever UPGRADES an article (unlinked → linked). It never
// demotes a published article, because a transient Blogger/OAuth failure must
// not rewrite the record of a post that is already public.
import { normalizeTitle } from "./blogger-draft-utils.js";

// Publisher workflow state. Kept in `article.publishState`, deliberately
// separate from the legacy `article.status` ("written"/"published") that the
// rest of ATLAS (writer, QA, recommendations, article-factory) filters on.
export const PUBLISH_STATE = {
  WRITTEN: "written",
  APPROVED: "approved",
  PUBLISHING: "publishing",
  PUBLISHED: "published",
  FAILED: "publish_failed",
};

const PUBLISH_STATE_VALUES = new Set(Object.values(PUBLISH_STATE));

// Legacy records only carry `status`. Anything already public stays public.
export function publishStateOf(article) {
  if (!article) return PUBLISH_STATE.WRITTEN;
  if (article.status === "published" || article.publishedUrl || article.bloggerPostId) {
    // A public post can never be walked back to written/approved by inference.
    if (article.publishState === PUBLISH_STATE.PUBLISHED) return PUBLISH_STATE.PUBLISHED;
    if (article.status === "published" || article.publishedUrl) return PUBLISH_STATE.PUBLISHED;
  }
  if (PUBLISH_STATE_VALUES.has(article.publishState)) return article.publishState;
  return PUBLISH_STATE.WRITTEN;
}

export function isPublishedState(article) {
  return publishStateOf(article) === PUBLISH_STATE.PUBLISHED;
}

// protocol + host + path, trailing slash and ".html" preserved but case/query/
// hash normalized away. Used for "canonical URL 정확 일치" — not a fuzzy match.
export function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${url.host}${path}`.toLowerCase();
  } catch {
    return "";
  }
}

function brief(post) {
  return { id: post.id, title: post.title || "", url: post.url || "" };
}

/**
 * Matches a single article against the LIVE post list.
 * @returns {{status:"matched",by:string,post:object}
 *          |{status:"conflict",by:string,candidates:object[]}
 *          |{status:"unmatched"}}
 */
export function matchLivePost(article, livePosts, options = {}) {
  const { excludePostIds = null, allowTitleMatch = true } = options;
  const all = Array.isArray(livePosts) ? livePosts : [];
  const posts = excludePostIds ? all.filter((p) => !excludePostIds.has(String(p.id))) : all;

  if (article?.bloggerPostId) {
    const byId = all.find((p) => String(p.id) === String(article.bloggerPostId));
    if (byId) return { status: "matched", by: "postId", post: byId };
  }

  const storedUrl = canonicalUrl(article?.publishedUrl || article?.bloggerUrl || "");
  if (storedUrl) {
    const byUrl = posts.filter((p) => canonicalUrl(p.url) === storedUrl);
    if (byUrl.length === 1) return { status: "matched", by: "url", post: byUrl[0] };
    if (byUrl.length > 1) return { status: "conflict", by: "url", candidates: byUrl.map(brief) };
  }

  if (allowTitleMatch) {
    const target = normalizeTitle(article?.title);
    if (target) {
      const byTitle = posts.filter((p) => normalizeTitle(p.title) === target);
      if (byTitle.length === 1) return { status: "matched", by: "title", post: byTitle[0] };
      if (byTitle.length > 1) return { status: "conflict", by: "title", candidates: byTitle.map(brief) };
    }
  }

  return { status: "unmatched" };
}

/**
 * Reconciles every ATLAS article against the full LIVE post list.
 *
 * Two passes on purpose: strong identifiers (postId / canonical URL) claim their
 * posts first, so a weaker title match can never steal a post that already
 * belongs to another article.
 *
 * @returns {{rows:object[], externalPosts:object[], counts:object, hasConflict:boolean}}
 */
export function reconcileArticles({ articles, livePosts, bloggerBlogId = "", now = new Date().toISOString() }) {
  const posts = Array.isArray(livePosts) ? livePosts : [];
  const list = Array.isArray(articles) ? articles : [];
  const claimed = new Set();
  const byArticleId = new Map();
  const pending = [];

  // Pass 1 — postId / canonical URL only.
  for (const article of list) {
    const result = matchLivePost(article, posts, { allowTitleMatch: false });
    if (result.status === "matched") {
      claimed.add(String(result.post.id));
      byArticleId.set(article.id, result);
    } else if (result.status === "conflict") {
      byArticleId.set(article.id, result);
    } else {
      pending.push(article);
    }
  }

  // Pass 2 — exact normalized title, over unclaimed posts only.
  for (const article of pending) {
    byArticleId.set(article.id, matchLivePost(article, posts, { excludePostIds: claimed }));
    const result = byArticleId.get(article.id);
    if (result.status === "matched") claimed.add(String(result.post.id));
  }

  const rows = list.map((article) => buildRow(article, byArticleId.get(article.id), bloggerBlogId, now));
  const externalPosts = posts.filter((p) => !claimed.has(String(p.id))).map(brief);

  return {
    rows,
    externalPosts,
    hasConflict: rows.some((r) => r.linkStatus === "conflict"),
    counts: computeCounts({ rows, livePostCount: posts.length, externalCount: externalPosts.length }),
  };
}

function buildRow(article, result, bloggerBlogId, now) {
  const wasPublished = isPublishedState(article);
  const base = {
    articleId: article.id,
    title: article.title || "",
    matchedBy: "",
    postId: article.bloggerPostId || "",
    url: article.publishedUrl || article.bloggerUrl || "",
    publishedAt: article.publishedAt || "",
    conflictPostIds: [],
    error: "",
    updates: null,
  };

  if (result?.status === "matched") {
    const post = result.post;
    return {
      ...base,
      linkStatus: "linked",
      missingLink: false,
      matchedBy: result.by,
      postId: post.id,
      url: post.url || article.publishedUrl || "",
      publishedAt: article.publishedAt || post.published || now,
      // Only additive fields — no body/HTML/image field is ever touched here.
      updates: {
        bloggerBlogId: bloggerBlogId || article.bloggerBlogId || "",
        bloggerPostId: post.id,
        bloggerUrl: post.url || "",
        bloggerStatus: "LIVE",
        bloggerSyncedAt: now,
        publishedUrl: article.publishedUrl || post.url || "",
        publishedAt: article.publishedAt || post.published || now,
        publishState: PUBLISH_STATE.PUBLISHED,
        status: "published",
        publishError: "",
        publishErrorCode: "",
      },
    };
  }

  if (result?.status === "conflict") {
    return {
      ...base,
      linkStatus: "conflict",
      missingLink: true,
      matchedBy: result.by,
      conflictPostIds: (result.candidates || []).map((c) => c.id),
      error: `동일 ${result.by === "url" ? "URL" : "제목"} 공개 게시물이 ${
        (result.candidates || []).length
      }개입니다. 중복 발행 위험으로 자동 연결하지 않았습니다.`,
    };
  }

  return {
    ...base,
    // Never demoted: an article ATLAS already knows is public stays published and
    // is reported as a broken link instead of being silently reset to written.
    linkStatus: "unlinked",
    missingLink: wasPublished,
    error: wasPublished ? "ATLAS는 발행됨으로 기록했지만 Blogger 공개 게시물을 찾지 못했습니다." : "",
  };
}

export function computeCounts({ rows, livePostCount = 0, externalCount = 0 }) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    bloggerLive: livePostCount,
    atlasLinked: list.filter((r) => r.linkStatus === "linked").length,
    external: externalCount,
    pending: list.filter((r) => r.linkStatus === "unlinked" && !r.missingLink).length,
    missingLinks: list.filter((r) => r.missingLink).length,
    conflicts: list.filter((r) => r.linkStatus === "conflict").length,
  };
}

// Identity fields must never be blanked by a sync: losing a stored postId/URL
// would make ATLAS forget which public post an article owns, and the next
// publish would then create a duplicate.
const NEVER_BLANK = new Set([
  "bloggerBlogId",
  "bloggerPostId",
  "bloggerUrl",
  "publishedUrl",
  "publishedAt",
]);

// Applies a reconcile row's updates onto the article object in place.
// Returns true when something actually changed.
export function applyRowUpdates(article, row) {
  if (!row?.updates) return false;
  let changed = false;
  for (const [key, value] of Object.entries(row.updates)) {
    if (value === "" && NEVER_BLANK.has(key)) continue;
    if (article[key] !== value) {
      article[key] = value;
      changed = true;
    }
  }
  return changed;
}
