// Prepare immutable hosted copies of reviewed draft images. Never update live posts.
import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { assertNewPost, contentVersion } from "@/lib/atlas/publish-transaction";
import { fileDigest, faceProofPassed } from "@/lib/atlas/face-proof";
import { globalReviewPacket } from "@/lib/atlas/operate/publish-approval-store";
import { requestOriginAllowed } from "@/lib/atlas/request-origin";
import {
  isCloudinaryConfigured,
  resolveLocalAssetFile,
  uploadArticleImage,
} from "@/lib/atlas/providers/cloudinary-provider";
import { isPublicImageUrl } from "@/lib/atlas/revenue-layout-engine";
import { faceMatchIssues } from "@/lib/atlas/face-match";

// Only reviewed, unpublished drafts may prepare hosted images.

export const runtime = "nodejs";

const ARTICLES_FILE = "articles.json";

// Only same-machine requests from the Publisher's own fixed dev port are
// trusted — mirrors the OFFICIAL_REDIRECT_URI convention already used for
// Blogger OAuth in this codebase.
function isLocalOrigin(request) {
  return ["localhost:3002", "127.0.0.1:3002"].includes(request.headers.get("host")) && requestOriginAllowed(request);
}

function isRequired(asset) {
  return asset.required !== false;
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
  const publicReadyCount = requiredAssets.filter((a) => isPublicImageUrl(a.publicUrl) && a.publicImageHash === fileDigest(resolveLocalAssetFile(a.localSrc))).length;

  return NextResponse.json({
    articleId,
    cloudinaryConfigured: isCloudinaryConfigured(),
    requiredLocalReady,
    requiredCount: requiredAssets.length,
    publicReadyCount,
    hasStoredPostReference: Boolean(article.bloggerPostId),
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
  if (mode !== "prepare") {
    return NextResponse.json({ articleId, errorCode: "EXISTING_POST_PROTECTED", error: "기존 공개 글의 이미지는 이 경로에서 수정하지 않습니다." }, { status: 409 });
  }
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ articleId, errorCode: "CLOUDINARY_CONFIG_MISSING" }, { status: 400 });
  }

  const articlesData = readJson(ARTICLES_FILE);
  const article = articlesData.articles.find((a) => a.id === articleId);
  if (!article) {
    return NextResponse.json({ articleId, errorCode: "ARTICLE_NOT_FOUND" }, { status: 404 });
  }

  try { assertNewPost(article); } catch (error) { return NextResponse.json({ errorCode: error.code, error: error.message }, { status: 409 }); }
  const review = globalReviewPacket(article);
  if (!review.finalReviewReady || review.blocking.length) return NextResponse.json({ errorCode: "FINAL_IMAGE_REVIEW_REQUIRED", error: "최종 글·이미지 검증 이후 공개 이미지를 연결하세요." }, { status: 409 });
  const assets = Array.isArray(article.visualAssets) ? article.visualAssets : [];
  if (assets.length === 0) {
    return NextResponse.json({ articleId, errorCode: "NO_VISUAL_ASSETS" }, { status: 400 });
  }

  // 미지 얼굴 일치 검수를 통과하지 못한 이미지는 공개 업로드도, 공개 글 교체(sync)도 하지 않는다.
  // (art_024 얼굴 불일치 사고 이후 필수 게이트)
  const faceIssues = [...faceMatchIssues(assets.filter(isRequired)), ...assets.filter(isRequired).filter((asset) => !faceProofPassed(asset.faceMatch, resolveLocalAssetFile(asset.localSrc))).map((asset) => `${asset.key}: 이미지 얼굴 검수 기록 불일치`)];
  if (faceIssues.length) {
    return NextResponse.json({ articleId, mode, errorCode: "GLOBAL_CHARACTER_FACE_MISMATCH", issues: faceIssues }, { status: 409 });
  }
  if (article.status !== "written") return NextResponse.json({ errorCode: "INVALID_STATUS_FOR_PREPARE" }, { status: 400 });
  const initialVersion = contentVersion(article);

  // prepare + already fully prepared: every required asset already carries a
  // public https URL, so there is nothing to upload. Idempotent no-op, no
  // Cloudinary call, existing publicUrls untouched.
  if (mode === "prepare") {
    const requiredReady = assets.filter(isRequired);
    const allReady = requiredReady.length > 0 && requiredReady.every((a) => isPublicImageUrl(a.publicUrl) && a.publicImageHash === fileDigest(resolveLocalAssetFile(a.localSrc)));
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

  // Content-addressed IDs preserve earlier hosted images, including live posts.
  const results = [];
  for (const asset of assets) {
    const filePath = resolveLocalAssetFile(asset.localSrc);
    if (!filePath) {
      results.push({ key: asset.key, status: "skipped", errorCode: "ASSET_NOT_FOUND" });
      continue;
    }
    try {
      const imageHash = fileDigest(filePath);
      const uploaded = await uploadArticleImage({ slug, key: `${asset.key}-${imageHash.slice(0, 16)}`, filePath });
      results.push({
        key: asset.key,
        status: "success",
        publicUrl: uploaded.secureUrl,
        publicImageHash: imageHash,
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
    return r && r.status === "success" ? { ...a, publicUrl: r.publicUrl, publicImageHash: r.publicImageHash } : a;
  });
  const latestData = readJson(ARTICLES_FILE);
  const articleIndex = latestData.articles.findIndex((item) => item.id === articleId);
  const current = latestData.articles[articleIndex];
  if (!current || contentVersion(current) !== initialVersion || results.some((result) => result.status === "success" && result.publicImageHash !== fileDigest(resolveLocalAssetFile(assets.find((asset) => asset.key === result.key)?.localSrc)))) {
    return NextResponse.json({ errorCode: "REVIEW_CHANGED_DURING_UPLOAD", error: "이미지 연결 중 글이나 파일이 바뀌었습니다. 다시 검수하세요." }, { status: 409 });
  }
  assertNewPost(current);
  latestData.articles[articleIndex] = { ...current, visualAssets: nextVisualAssets, updatedAt: new Date().toISOString() };
  writeJson(ARTICLES_FILE, latestData);

  // Save draft delivery metadata only; no Blogger update or publish job.
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

}
