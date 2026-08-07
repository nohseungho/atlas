// Cloudinary Image Automation Sprint V1 — single responsibility route:
// upload an article's visualAssets to Cloudinary, save the resulting public
// HTTPS URLs, and patch the article's *existing* Blogger post's content.
// Never creates a new Blogger post (posts.insert is never called here).
import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { buildBloggerHtml } from "@/lib/html-exporter";
import {
  isCloudinaryConfigured,
  resolveLocalAssetFile,
  uploadArticleImage,
} from "@/lib/atlas/providers/cloudinary-provider";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import { getTokenByBlogId, decryptToken, upsertTokenForBlog } from "@/lib/atlas/repositories/token-repository";
import { getJobsByArticleId, markJobImageSync } from "@/lib/atlas/repositories/publishing-repository";
import { isPublicImageUrl } from "@/lib/atlas/revenue-layout-engine";

// Two explicit request modes. "prepare" (written articles) uploads to Cloudinary
// and saves publicUrl only — it must never reach the Blogger update path below.
// "sync" (published articles) is the original flow: upload, save, then patch the
// *existing* verified Blogger post. Absent mode defaults to "sync" so the
// pre-existing Publisher call (which sends no mode) keeps working unchanged.
const VALID_MODES = new Set(["prepare", "sync"]);

export const runtime = "nodejs";

const ARTICLES_FILE = "articles.json";

// Only same-machine requests from the Publisher's own fixed dev port are
// trusted — mirrors the OFFICIAL_REDIRECT_URI convention already used for
// Blogger OAuth in this codebase.
function isLocalOrigin(request) {
  return (request.headers.get("host") || "") === "localhost:3002";
}

function isRequired(asset) {
  return asset.required !== false;
}

function latestSucceededJob(articleId, blogId) {
  const jobs = getJobsByArticleId(articleId).filter(
    (j) => j.channelId === blogId && j.status === "succeeded" && j.externalId
  );
  jobs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return jobs[0] || null;
}

// Retries a Blogger API call once after refreshing the access token on
// TOKEN_EXPIRED. Mutates tokenState.accessToken in place so subsequent calls
// in the same request reuse the refreshed token.
async function withTokenRefresh(blog, tokenState, fn) {
  try {
    return await fn(tokenState.accessToken);
  } catch (err) {
    if (err.code === "TOKEN_EXPIRED" && tokenState.refreshToken) {
      const refreshed = await bloggerProvider.refreshAccessToken(tokenState.refreshToken);
      tokenState.accessToken = refreshed.accessToken;
      upsertTokenForBlog({
        blogId: blog.id,
        provider: "blogger",
        accessToken: tokenState.accessToken,
        refreshToken: tokenState.refreshToken,
        scope: tokenState.scope,
        expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
      });
      return await fn(tokenState.accessToken);
    }
    throw err;
  }
}

// GET: cheap readiness signal for the Publisher button (no Cloudinary/Google
// API calls — local filesystem + publishing.json only).
export async function GET(request) {
  if (!isLocalOrigin(request)) {
    return NextResponse.json({ errorCode: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const articleId = new URL(request.url).searchParams.get("articleId") || "";
  const data = readJson(ARTICLES_FILE);
  const article = data.articles.find((a) => a.id === articleId);
  if (!article) {
    return NextResponse.json({ errorCode: "ARTICLE_NOT_FOUND" }, { status: 404 });
  }

  const assets = Array.isArray(article.visualAssets) ? article.visualAssets : [];
  const requiredAssets = assets.filter(isRequired);
  const requiredLocalReady =
    requiredAssets.length > 0 && requiredAssets.every((a) => Boolean(resolveLocalAssetFile(a.localSrc)));
  const publicReadyCount = requiredAssets.filter((a) => isPublicImageUrl(a.publicUrl)).length;

  return NextResponse.json({
    articleId,
    cloudinaryConfigured: isCloudinaryConfigured(),
    requiredLocalReady,
    requiredCount: requiredAssets.length,
    publicReadyCount,
    hasStoredPostReference: Boolean(latestSucceededJob(articleId, article.blogId)),
    articlePublished: article.status === "published",
    articleStatus: article.status,
  });
}

export async function POST(request) {
  if (!isLocalOrigin(request)) {
    return NextResponse.json({ errorCode: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const articleId = body.articleId;
  if (!articleId) {
    return NextResponse.json({ errorCode: "ARTICLE_ID_REQUIRED" }, { status: 400 });
  }

  // Absent mode == legacy "sync". Any other value is rejected outright so a
  // typo can never silently fall through to the Blogger update path.
  const mode = body.mode === undefined ? "sync" : body.mode;
  if (!VALID_MODES.has(mode)) {
    return NextResponse.json({ articleId, errorCode: "UNKNOWN_MODE" }, { status: 400 });
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ articleId, errorCode: "CLOUDINARY_CONFIG_MISSING" }, { status: 400 });
  }

  const articlesData = readJson(ARTICLES_FILE);
  const article = articlesData.articles.find((a) => a.id === articleId);
  if (!article) {
    return NextResponse.json({ articleId, errorCode: "ARTICLE_NOT_FOUND" }, { status: 404 });
  }

  const assets = Array.isArray(article.visualAssets) ? article.visualAssets : [];
  if (assets.length === 0) {
    return NextResponse.json({ articleId, errorCode: "NO_VISUAL_ASSETS" }, { status: 400 });
  }

  // prepare only runs on drafts. Published articles use "sync" (which also
  // patches Blogger); routing a published article through prepare — or a draft
  // through sync — is rejected rather than guessed.
  if (mode === "prepare" && article.status !== "written") {
    return NextResponse.json({ articleId, mode, errorCode: "INVALID_STATUS_FOR_PREPARE" }, { status: 400 });
  }

  // prepare + already fully prepared: every required asset already carries a
  // public https URL, so there is nothing to upload. Idempotent no-op, no
  // Cloudinary call, existing publicUrls untouched.
  if (mode === "prepare") {
    const requiredReady = assets.filter(isRequired);
    const allReady = requiredReady.length > 0 && requiredReady.every((a) => isPublicImageUrl(a.publicUrl));
    if (allReady) {
      const results = assets.map((a) => ({
        key: a.key,
        status: isPublicImageUrl(a.publicUrl) ? "ready" : "pending",
        publicUrl: isPublicImageUrl(a.publicUrl) ? a.publicUrl : undefined,
      }));
      return NextResponse.json({
        articleId,
        mode,
        status: "already_ready",
        requiredCount: requiredReady.length,
        preparedCount: requiredReady.length,
        results,
        bloggerUpdate: { status: "not_applicable" },
      });
    }
  }

  const slug = article.slug || article.id;

  // Preflight: every required asset's localSrc must resolve to a real file
  // inside public/images/articles/ before any Cloudinary call is made.
  const missingRequired = assets.filter(isRequired).filter((a) => !resolveLocalAssetFile(a.localSrc));
  if (missingRequired.length > 0) {
    const results = assets.map((a) => ({
      key: a.key,
      status: missingRequired.some((m) => m.key === a.key) ? "failed" : "skipped",
      errorCode: missingRequired.some((m) => m.key === a.key) ? "ASSET_NOT_FOUND" : undefined,
    }));
    return NextResponse.json(
      { articleId, results, bloggerUpdate: { status: "skipped", errorCode: "PRECONDITION_FAILED" } },
      { status: 400 }
    );
  }

  // Upload pass — one Cloudinary call per asset, fixed public_id/folder so
  // re-running this route always overwrites the same asset (idempotent).
  const results = [];
  for (const asset of assets) {
    const filePath = resolveLocalAssetFile(asset.localSrc);
    if (!filePath) {
      results.push({ key: asset.key, status: "skipped", errorCode: "ASSET_NOT_FOUND" });
      continue;
    }
    try {
      const uploaded = await uploadArticleImage({ slug, key: asset.key, filePath });
      results.push({
        key: asset.key,
        status: "success",
        publicUrl: uploaded.secureUrl,
        width: uploaded.width,
        height: uploaded.height,
      });
    } catch (err) {
      results.push({ key: asset.key, status: "failed", errorCode: err.code || "CLOUDINARY_UPLOAD_FAILED" });
    }
  }

  const requiredKeys = new Set(assets.filter(isRequired).map((a) => a.key));
  const allRequiredSucceeded = [...requiredKeys].every(
    (key) => results.find((r) => r.key === key)?.status === "success"
  );

  if (!allRequiredSucceeded) {
    // Partial failure: never touch stored publicUrl, never touch Blogger.
    // Re-running the same button later is safe and will retry only what's needed.
    return NextResponse.json(
      { articleId, results, bloggerUpdate: { status: "skipped", errorCode: "UPLOAD_INCOMPLETE" } },
      { status: 502 }
    );
  }

  // Save publicUrl — only now that every required upload succeeded.
  const nextVisualAssets = assets.map((a) => {
    const r = results.find((x) => x.key === a.key);
    return r && r.status === "success" ? { ...a, publicUrl: r.publicUrl } : a;
  });
  const articleIndex = articlesData.articles.findIndex((a) => a.id === articleId);
  articlesData.articles[articleIndex].visualAssets = nextVisualAssets;
  articlesData.articles[articleIndex].updatedAt = new Date().toISOString();
  writeJson(ARTICLES_FILE, articlesData);
  const updatedArticle = articlesData.articles[articleIndex];

  // prepare stops here: publicUrls are saved, status stays "written", and the
  // Blogger update path below is never entered. No publishedUrl/postId is read
  // or created, and no publishing job is touched.
  if (mode === "prepare") {
    const requiredCount = assets.filter(isRequired).length;
    return NextResponse.json({
      articleId,
      mode,
      status: "prepared",
      requiredCount,
      preparedCount: requiredCount,
      results,
      bloggerUpdate: { status: "not_applicable" },
    });
  }

  // Blogger update is best-effort and strictly opt-in on verified identity —
  // failing to identify/patch the post never undoes the publicUrl save above.
  const blogsData = readJson("blogs.json");
  const blog = blogsData.items.find((b) => b.id === updatedArticle.blogId);
  if (!blog || !blog.bloggerBlogId) {
    return NextResponse.json({ articleId, results, bloggerUpdate: { status: "skipped", errorCode: "BLOGGER_BLOG_NOT_LINKED" } });
  }
  const tokenRecord = getTokenByBlogId(blog.id);
  if (!tokenRecord) {
    return NextResponse.json({ articleId, results, bloggerUpdate: { status: "skipped", errorCode: "BLOGGER_TOKEN_NOT_FOUND" } });
  }

  const decrypted = decryptToken(tokenRecord);
  const tokenState = { accessToken: decrypted.accessToken, refreshToken: decrypted.refreshToken, scope: tokenRecord.scope };

  let verifiedPost = null;
  let verifiedJob = null;
  const candidateJob = latestSucceededJob(articleId, blog.id);
  if (candidateJob) {
    try {
      const post = await withTokenRefresh(blog, tokenState, (at) =>
        bloggerProvider.getPost(blog.bloggerBlogId, candidateJob.externalId, at)
      );
      if (post && post.title === updatedArticle.title && post.url === updatedArticle.publishedUrl) {
        verifiedPost = post;
        verifiedJob = candidateJob;
      }
    } catch {
      verifiedPost = null;
    }
  }

  if (!verifiedPost && updatedArticle.publishedUrl) {
    try {
      const urlPath = new URL(updatedArticle.publishedUrl).pathname;
      const post = await withTokenRefresh(blog, tokenState, (at) =>
        bloggerProvider.getPostByPath(blog.bloggerBlogId, urlPath, at)
      );
      if (post && post.title === updatedArticle.title && post.url === updatedArticle.publishedUrl) {
        verifiedPost = post;
      }
    } catch {
      verifiedPost = null;
    }
  }

  if (!verifiedPost) {
    // Never guess. No posts.insert, no posts.patch against an unverified id.
    return NextResponse.json({
      articleId,
      results,
      bloggerUpdate: { status: "skipped", errorCode: "BLOGGER_POST_ID_NOT_VERIFIED" },
    });
  }

  try {
    const html = buildBloggerHtml(updatedArticle);
    const patchResult = await withTokenRefresh(blog, tokenState, (at) =>
      bloggerProvider.updatePost(blog.bloggerBlogId, verifiedPost.id, { html }, { accessToken: at })
    );
    if (verifiedJob) {
      markJobImageSync(verifiedJob.id, { status: "success", message: "Cloudinary 이미지 반영 완료" });
    }
    return NextResponse.json({
      articleId,
      results,
      bloggerUpdate: { status: "updated", postId: verifiedPost.id, publishedUrl: patchResult.publishedUrl || updatedArticle.publishedUrl },
    });
  } catch (err) {
    if (verifiedJob) {
      markJobImageSync(verifiedJob.id, { status: "failed", message: err.message || "Blogger 업데이트 실패" });
    }
    return NextResponse.json(
      { articleId, results, bloggerUpdate: { status: "failed", errorCode: err.code || "BLOGGER_UPDATE_FAILED" } },
      { status: 502 }
    );
  }
}
