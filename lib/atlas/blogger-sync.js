// Read-only Blogger status sync. Reconciles EVERY ATLAS article with the blog's
// actual LIVE posts so the Publisher reflects real public state — it NEVER
// modifies, publishes, or deletes any Blogger post, and never rewrites remote HTML.
//
// Match order per article: stored bloggerPostId → canonical publishedUrl →
// exact normalized title. 2+ title/URL candidates ⇒ conflict, never auto-linked.
// LIVE posts that belong to no ATLAS article (e.g. Site Verification) are
// reported as external posts — no ATLAS article is ever created for them.
import { readJson } from "@/lib/data-store";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import { getTokenByBlogId, decryptToken, upsertTokenForBlog } from "@/lib/atlas/repositories/token-repository";
import { normalizeTitle } from "@/lib/atlas/blogger-draft-utils";
import { applySyncResult, recordSyncFailure } from "@/lib/atlas/publisher-state";

const DEFAULT_BLOG_ID = "blog_001";

export const RECONNECT_CODE = "BLOGGER_RECONNECT_REQUIRED";

export function isAuthError(err) {
  return (
    err?.code === "TOKEN_EXPIRED" ||
    err?.code === "REFRESH_INVALID" ||
    /invalid_grant|expired|revoked|unauthorized/i.test(err?.message || "")
  );
}

/**
 * Builds an authorized caller for a blog: runs `fn(accessToken)` and, on a 401,
 * refreshes once with the stored refresh_token and retries. Throws with
 * code=TOKEN_EXPIRED/REFRESH_INVALID when reconnect is genuinely required.
 * Reuses the existing token repository and OAuth flow — no new auth structure.
 */
export function createBloggerSession(blogId = DEFAULT_BLOG_ID) {
  const tokenRecord = getTokenByBlogId(blogId);
  if (!tokenRecord) return null;

  const blogsData = readJson("blogs.json");
  const blog = blogsData.items.find((b) => b.id === blogId);
  if (!blog?.bloggerBlogId) return null;

  const { accessToken, refreshToken } = decryptToken(tokenRecord);
  const tokenState = { accessToken, refreshToken };

  async function run(fn) {
    try {
      return await fn(tokenState.accessToken);
    } catch (err) {
      if (err.code === "TOKEN_EXPIRED" && tokenState.refreshToken) {
        const refreshed = await bloggerProvider.refreshAccessToken(tokenState.refreshToken);
        tokenState.accessToken = refreshed.accessToken;
        upsertTokenForBlog({
          blogId,
          provider: "blogger",
          accessToken: tokenState.accessToken,
          refreshToken: tokenState.refreshToken,
          scope: tokenRecord.scope,
          expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        });
        return await fn(tokenState.accessToken);
      }
      throw err;
    }
  }

  return { blogId, bloggerBlogId: blog.bloggerBlogId, run, tokenState };
}

/**
 * Full Publisher sync. Returns:
 *   { status:"ok"|"conflict", counts, rows, externalPosts, livePosts, syncedAt }
 *   { status:"reconnect_required", errorCode:"BLOGGER_RECONNECT_REQUIRED" }
 *   { status:"error", message }
 * On any failure articles.json is left completely untouched.
 */
export async function syncPublishedArticles(blogId = DEFAULT_BLOG_ID) {
  const session = createBloggerSession(blogId);
  if (!session) {
    recordSyncFailure({ blogId, status: "reconnect_required", message: "Blogger 연결이 없습니다." });
    return {
      status: "reconnect_required",
      errorCode: RECONNECT_CODE,
      message: "Blogger 연결이 만료되었습니다. 한 번 다시 연결해 주세요.",
    };
  }

  let livePosts;
  let drafts = [];
  try {
    livePosts = await session.run((at) => bloggerProvider.listLivePosts(session.bloggerBlogId, at));
    drafts = await session.run((at) => bloggerProvider.listDrafts(session.bloggerBlogId, at));
  } catch (err) {
    if (isAuthError(err)) {
      recordSyncFailure({ blogId, status: "reconnect_required", message: "OAuth 만료" });
      return {
        status: "reconnect_required",
        errorCode: RECONNECT_CODE,
        message: "Blogger 연결이 만료되었습니다. 한 번 다시 연결해 주세요.",
      };
    }
    const message = String(err.message || "").slice(0, 150);
    recordSyncFailure({ blogId, status: "error", message });
    return { status: "error", message };
  }

  const result = applySyncResult({ blogId, livePosts, bloggerBlogId: session.bloggerBlogId });

  // Duplicate DRAFTs of an article title are reported only — never touched.
  const articles = readJson("articles.json").articles || [];
  const duplicateDrafts = [];
  for (const a of articles) {
    const dup = drafts.filter((d) => normalizeTitle(d.title) === normalizeTitle(a.title));
    if (dup.length) duplicateDrafts.push({ articleId: a.id, drafts: dup.map((x) => ({ id: x.id, title: x.title })) });
  }

  return {
    status: result.hasConflict ? "conflict" : "ok",
    counts: result.counts,
    rows: result.rows,
    externalPosts: result.externalPosts,
    livePostTitles: livePosts.map((p) => ({ id: p.id, title: p.title, url: p.url })),
    duplicateDrafts,
    changed: result.changed,
    syncedAt: result.syncedAt,
  };
}
