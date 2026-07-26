// "Blogger 초안 반영" — one-click draft sync. Given an article + connected blog,
// it PATCHes the article's existing manual Blogger DRAFT if found (by stored
// postId, else by exact normalized title), otherwise creates a new DRAFT. It is
// idempotent (re-running PATCHes the same postId — never creates duplicates) and
// DRAFT-ONLY: it never calls the public publish path and never flips isDraft off.
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { readJson, writeJson } from "@/lib/data-store";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import { getTokenByBlogId, decryptToken, upsertTokenForBlog } from "@/lib/atlas/repositories/token-repository";
import { getJobsByArticleId, createPublishJob, updatePublishJobStatus } from "@/lib/atlas/repositories/publishing-repository";
import { buildBloggerHtml } from "@/lib/html-exporter";
import { selectDraftCandidate, validateDraftHtml } from "@/lib/atlas/blogger-draft-utils";

export const runtime = "nodejs";

// A job carrying the draft's postId. Distinct from "succeeded" so it never
// collides with the public-publish duplicate guard in /api/publish.
const DRAFT_JOB_STATUS = "draft_synced";

// A hand-finalized HTML override (e.g. docs/art_004-blogger-final.html) wins, so
// the exact reviewed HTML with embedded Cloudinary images is what reaches Blogger.
// Otherwise the canonical buildBloggerHtml(article) is used.
function resolveFinalHtml(article) {
  const overridePath = path.join(process.cwd(), "docs", `${article.id}-blogger-final.html`);
  if (fs.existsSync(overridePath)) {
    return { html: fs.readFileSync(overridePath, "utf-8"), source: `docs/${article.id}-blogger-final.html` };
  }
  return { html: buildBloggerHtml(article), source: "buildBloggerHtml" };
}

function findDraftJob(articleId, blogId) {
  return getJobsByArticleId(articleId).find(
    (j) => j.channelId === blogId && j.externalId && j.status === DRAFT_JOB_STATUS
  );
}

// Runs fn(accessToken); on TOKEN_EXPIRED refreshes once and retries, persisting
// the new access token while preserving the existing refresh token.
async function withRefresh(blogId, scope, tokenState, fn) {
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
        scope,
        expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
      });
      return await fn(tokenState.accessToken);
    }
    throw err;
  }
}

function reconnect(message) {
  return NextResponse.json({ status: "reconnect_required", message }, { status: 200 });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { articleId, blogId } = body;
  if (!articleId || !blogId) {
    return NextResponse.json({ status: "error", errorCode: "ARTICLE_AND_BLOG_REQUIRED" }, { status: 400 });
  }

  const blogsData = readJson("blogs.json");
  const blog = blogsData.items.find((b) => b.id === blogId);
  if (!blog) return NextResponse.json({ status: "error", errorCode: "BLOG_NOT_FOUND" }, { status: 404 });
  if (!blog.tokenRef) return reconnect("Blogger 연결이 필요합니다. 한 번 다시 연결해 주세요.");

  const articlesData = readJson("articles.json");
  const article = articlesData.articles.find((a) => a.id === articleId);
  if (!article) return NextResponse.json({ status: "error", errorCode: "ARTICLE_NOT_FOUND" }, { status: 404 });

  const tokenRecord = getTokenByBlogId(blogId);
  if (!tokenRecord) return reconnect("Blogger 연결이 만료되었습니다. 한 번 다시 연결해 주세요.");

  const { html, source } = resolveFinalHtml(article);
  const check = validateDraftHtml(html);
  if (!check.ok) {
    return NextResponse.json({ status: "error", errorCode: "HTML_VALIDATION_FAILED", issues: check.issues }, { status: 400 });
  }

  const decrypted = decryptToken(tokenRecord);
  const tokenState = { accessToken: decrypted.accessToken, refreshToken: decrypted.refreshToken };
  const scope = tokenRecord.scope;

  try {
    let bloggerBlogId = blog.bloggerBlogId;
    if (!bloggerBlogId) {
      bloggerBlogId = await withRefresh(blogId, scope, tokenState, (at) => bloggerProvider.fetchFirstBlogId(at));
      blog.bloggerBlogId = bloggerBlogId;
      blog.updatedAt = new Date().toISOString();
      writeJson("blogs.json", blogsData);
    }

    // 1) stored postId (idempotency) — verify it still exists as a DRAFT.
    let postId = null;
    const existingJob = findDraftJob(articleId, blogId);
    let jobId = existingJob?.id || null;
    if (existingJob) {
      const post = await withRefresh(blogId, scope, tokenState, (at) =>
        bloggerProvider.getPostAdmin(bloggerBlogId, existingJob.externalId, at)
      );
      if (post && post.status === "DRAFT") postId = post.id;
    }

    // 2) exact normalized-title search among DRAFTs.
    if (!postId) {
      const drafts = await withRefresh(blogId, scope, tokenState, (at) =>
        bloggerProvider.listDrafts(bloggerBlogId, at)
      );
      const sel = selectDraftCandidate(drafts, article.title);
      if (sel.match === "multiple") {
        return NextResponse.json(
          {
            status: "multiple_candidates",
            candidates: sel.candidates,
            message: "같은 제목의 초안이 여러 개입니다. 하나만 남기고 정리한 뒤 다시 시도해 주세요.",
          },
          { status: 200 }
        );
      }
      if (sel.match === "found") postId = sel.post.id;
    }

    // 3) PATCH existing draft, else create a new DRAFT.
    let action;
    let finalPostId = postId;
    if (postId) {
      await withRefresh(blogId, scope, tokenState, (at) =>
        bloggerProvider.updatePost(bloggerBlogId, postId, { html }, { accessToken: at })
      );
      action = "patched";
    } else {
      const created = await withRefresh(blogId, scope, tokenState, (at) =>
        bloggerProvider.insertDraft(bloggerBlogId, { title: article.title, html, labels: article.tags || [] }, at)
      );
      finalPostId = created.id;
      action = "created";
    }

    // 4) persist postId so re-runs PATCH the same post (no duplicate drafts).
    if (!jobId) {
      jobId = createPublishJob({ articleId, channelId: blogId, provider: "blogger" }).id;
    }
    updatePublishJobStatus(jobId, {
      status: DRAFT_JOB_STATUS,
      externalId: finalPostId,
      publishedUrl: "",
      message: action === "patched" ? "Blogger 초안 PATCH 반영" : "Blogger 초안 생성",
    });

    // 5) re-read remotely and verify DRAFT + images.
    const verify = await withRefresh(blogId, scope, tokenState, (at) =>
      bloggerProvider.getPostAdmin(bloggerBlogId, finalPostId, at)
    );
    const remoteImg = (String(verify?.content || "").match(/<img\b/gi) || []).length;
    const remoteCloud = (String(verify?.content || "").match(/https:\/\/res\.cloudinary\.com\//g) || []).length;

    return NextResponse.json({
      status: "ok",
      action,
      postId: finalPostId,
      bloggerBlogId,
      htmlSource: source,
      localImgCount: check.imgCount,
      localCloudinaryCount: check.cloudinaryCount,
      remote: {
        isDraft: verify?.status === "DRAFT",
        status: verify?.status || "",
        imgCount: remoteImg,
        cloudinaryCount: remoteCloud,
        title: verify?.title || "",
      },
    });
  } catch (err) {
    const isAuth =
      err.code === "TOKEN_EXPIRED" ||
      err.code === "REFRESH_INVALID" ||
      /invalid_grant|expired|revoked|unauthorized/i.test(err.message || "");
    if (isAuth) return reconnect("Blogger 연결이 만료되었습니다. 한 번 다시 연결해 주세요.");
    // Never surface tokens/secrets; only a short generic message.
    return NextResponse.json(
      { status: "error", errorCode: "DRAFT_SYNC_FAILED", message: String(err.message || "").slice(0, 200) },
      { status: 500 }
    );
  }
}
