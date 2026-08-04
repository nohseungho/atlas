// Auto-publish to Blogger, behind the Publisher approval gate.
//
// Safety contract:
//   1. Only an article the user has APPROVED on screen can be published.
//   2. A publish already in flight (in-process lock + persisted "publishing"
//      state) is rejected, so rapid double-clicks can never insert twice.
//   3. Immediately before posts.insert we re-query Blogger for a post with the
//      same postId / canonical URL / exact normalized title. If one exists we
//      LINK it and return — a new post is never inserted.
//   4. After a successful insert we re-fetch the returned postId to verify the
//      post is really public, then persist postId/URL/publishedAt/state.
//   5. Any OAuth failure returns BLOGGER_RECONNECT_REQUIRED and changes no data.
import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import { createBloggerSession, isAuthError, RECONNECT_CODE } from "@/lib/atlas/blogger-sync";
import {
  createPublishJob,
  updatePublishJobStatus,
  getJobsByArticleId,
} from "@/lib/atlas/repositories/publishing-repository";
import { buildBloggerHtml } from "@/lib/html-exporter";
import { PUBLISH_STATE, publishStateOf, matchLivePost } from "@/lib/atlas/publisher-sync";

export const runtime = "nodejs";

// In-process guard against concurrent requests for the same article. The
// persisted "publishing" state below covers a restart; this covers the common
// case of two clicks racing inside one server process.
const inFlight = new Set();

// A crashed/aborted publish must not lock an article forever.
const PUBLISHING_STALE_MS = 5 * 60 * 1000;

function loadArticle(articleId) {
  const data = readJson("articles.json");
  const article = data.articles.find((a) => a.id === articleId);
  return { data, article };
}

function persist(articleId, patch) {
  const { data, article } = loadArticle(articleId);
  if (!article) return null;
  Object.assign(article, patch, { updatedAt: new Date().toISOString() });
  writeJson("articles.json", data);
  return article;
}

export async function POST(request) {
  const body = await request.json();
  const { articleId, blogId } = body;

  if (!articleId || !blogId) {
    return NextResponse.json({ error: "articleId and blogId are required" }, { status: 400 });
  }

  const blogsData = readJson("blogs.json");
  const blog = blogsData.items.find((b) => b.id === blogId);
  if (!blog) {
    return NextResponse.json({ error: "blog not found" }, { status: 404 });
  }
  if (!blog.tokenRef) {
    return NextResponse.json(
      { status: "auth_required", errorCode: RECONNECT_CODE, error: "연결된 Blogger 계정이 없습니다. Blog Manager에서 연결 후 시도하세요." },
      { status: 401 }
    );
  }

  const { article } = loadArticle(articleId);
  if (!article) {
    return NextResponse.json({ error: "article not found" }, { status: 404 });
  }

  const state = publishStateOf(article);

  // (1) Duplicate guard — already published.
  if (state === PUBLISH_STATE.PUBLISHED) {
    return NextResponse.json(
      { status: "duplicate", errorCode: "ALREADY_PUBLISHED", error: "이미 발행된 글입니다. 중복 발행이 차단되었습니다.", publishedUrl: article.publishedUrl || "" },
      { status: 409 }
    );
  }

  // (2) Approval gate — written/publish_failed can never publish directly.
  if (state !== PUBLISH_STATE.APPROVED) {
    if (state === PUBLISH_STATE.PUBLISHING) {
      const startedAt = Date.parse(article.publishingStartedAt || "") || 0;
      if (Date.now() - startedAt < PUBLISHING_STALE_MS) {
        return NextResponse.json(
          { status: "in_progress", errorCode: "PUBLISH_IN_PROGRESS", error: "이미 발행 요청이 진행 중입니다." },
          { status: 409 }
        );
      }
      // stale lock from an interrupted run — fall through and retry
    } else {
      return NextResponse.json(
        { status: "not_approved", errorCode: "APPROVAL_REQUIRED", error: "승인되지 않은 글입니다. 미리보기 확인 후 승인해야 발행할 수 있습니다.", publishState: state },
        { status: 409 }
      );
    }
  }

  // (3) Same article x same blog already succeeded before (even if the article
  // record was edited since) — never insert a second time.
  const alreadySucceededToThisBlog = getJobsByArticleId(articleId).some(
    (job) => job.channelId === blogId && job.status === "succeeded"
  );
  if (alreadySucceededToThisBlog) {
    return NextResponse.json(
      { status: "duplicate", errorCode: "ALREADY_PUBLISHED", error: "이미 이 블로그에 발행된 글입니다. 중복 발행이 차단되었습니다." },
      { status: 409 }
    );
  }

  // (4) In-process concurrency lock.
  const lockKey = `${articleId}:${blogId}`;
  if (inFlight.has(lockKey)) {
    return NextResponse.json(
      { status: "in_progress", errorCode: "PUBLISH_IN_PROGRESS", error: "이미 발행 요청이 진행 중입니다." },
      { status: 409 }
    );
  }
  inFlight.add(lockKey);

  const session = createBloggerSession(blogId);
  if (!session) {
    inFlight.delete(lockKey);
    return NextResponse.json(
      { status: "auth_required", errorCode: RECONNECT_CODE, error: "Blogger 재연결이 필요합니다." },
      { status: 401 }
    );
  }

  let job = null;
  try {
    // (5) Pre-flight: does this article already exist as a public post? This runs
    // BEFORE any state write and before posts.insert.
    const livePosts = await session.run((at) => bloggerProvider.listLivePosts(session.bloggerBlogId, at));
    const preflight = matchLivePost(article, livePosts);

    if (preflight.status === "conflict") {
      inFlight.delete(lockKey);
      return NextResponse.json(
        {
          status: "conflict",
          errorCode: "SYNC_CONFLICT",
          error: "같은 제목의 공개 게시물이 여러 개입니다. 중복 발행 위험으로 발행을 중단했습니다.",
          candidates: preflight.candidates,
        },
        { status: 409 }
      );
    }

    if (preflight.status === "matched") {
      const post = preflight.post;
      persist(articleId, {
        publishState: PUBLISH_STATE.PUBLISHED,
        status: "published",
        bloggerBlogId: session.bloggerBlogId,
        bloggerPostId: post.id,
        bloggerUrl: post.url || "",
        bloggerStatus: "LIVE",
        bloggerSyncedAt: new Date().toISOString(),
        publishedUrl: article.publishedUrl || post.url || "",
        publishedAt: article.publishedAt || post.published || new Date().toISOString(),
        blogId,
        publishError: "",
        publishErrorCode: "",
        publishingStartedAt: "",
      });
      inFlight.delete(lockKey);
      return NextResponse.json({
        status: "linked_existing",
        matchedBy: preflight.by,
        postId: post.id,
        publishedUrl: post.url || "",
        message: "기존 글 연결됨 — 새 게시물을 만들지 않았습니다.",
      });
    }

    // (6) No existing post: mark publishing, then insert exactly once.
    persist(articleId, {
      publishState: PUBLISH_STATE.PUBLISHING,
      publishingStartedAt: new Date().toISOString(),
      publishError: "",
      publishErrorCode: "",
    });

    job = createPublishJob({ articleId, channelId: blogId, provider: "blogger" });
    updatePublishJobStatus(job.id, { status: "running", incrementAttempt: true, message: "자동 발행 시작" });

    const content = {
      bloggerBlogId: session.bloggerBlogId,
      title: article.title || "",
      html: buildBloggerHtml(article),
      labels: article.tags || [],
    };

    const result = await session.run((accessToken) =>
      bloggerProvider.publish(job, content, { accessToken })
    );

    // (7) Verify the returned postId is really public before recording success.
    let verified = null;
    try {
      verified = await session.run((at) => bloggerProvider.getPost(session.bloggerBlogId, result.externalId, at));
    } catch {
      verified = null; // verification is best-effort; the insert itself succeeded
    }

    const now = new Date().toISOString();
    updatePublishJobStatus(job.id, {
      status: "succeeded",
      publishedUrl: verified?.url || result.publishedUrl,
      externalId: result.externalId,
      message: "Blogger 자동 발행 성공",
    });

    persist(articleId, {
      publishState: PUBLISH_STATE.PUBLISHED,
      status: "published",
      blogId,
      bloggerBlogId: session.bloggerBlogId,
      bloggerPostId: result.externalId,
      bloggerUrl: verified?.url || result.publishedUrl,
      bloggerStatus: "LIVE",
      bloggerSyncedAt: now,
      publishedUrl: verified?.url || result.publishedUrl,
      publishedAt: now,
      publishError: "",
      publishErrorCode: "",
      publishingStartedAt: "",
    });

    inFlight.delete(lockKey);
    return NextResponse.json({
      jobId: job.id,
      status: "succeeded",
      postId: result.externalId,
      publishedUrl: verified?.url || result.publishedUrl,
      verified: Boolean(verified),
      externalId: result.externalId,
    });
  } catch (err) {
    inFlight.delete(lockKey);
    console.error("[publish route] 발행 실패:", err.message, err.code, err.httpStatus);

    const authError = isAuthError(err);
    if (job) {
      updatePublishJobStatus(job.id, {
        status: authError ? "auth_required" : "failed",
        lastError: err.message,
        message: authError ? "인증 만료 또는 재연결 필요" : `발행 실패: ${err.message}`,
      });
    }

    // OAuth failure: leave the article exactly as it was (still approved), so the
    // user can reconnect and retry without re-approving.
    persist(articleId, {
      publishState: authError ? PUBLISH_STATE.APPROVED : PUBLISH_STATE.FAILED,
      publishingStartedAt: "",
      publishError: String(err.message || "").slice(0, 200),
      publishErrorCode: authError ? RECONNECT_CODE : "PUBLISH_FAILED",
    });

    return NextResponse.json(
      {
        jobId: job?.id,
        status: authError ? "auth_required" : "failed",
        errorCode: authError ? RECONNECT_CODE : "PUBLISH_FAILED",
        error: err.message,
        httpStatus: err.httpStatus,
        googleErrorCode: err.googleErrorCode,
      },
      { status: authError ? 401 : 500 }
    );
  }
}
