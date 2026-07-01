import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import {
  getTokenByBlogId,
  decryptToken,
  upsertTokenForBlog,
} from "@/lib/atlas/repositories/token-repository";
import {
  createPublishJob,
  updatePublishJobStatus,
} from "@/lib/atlas/repositories/publishing-repository";
import { buildBloggerHtml } from "@/lib/html-exporter";

export async function POST(request) {
  const body = await request.json();
  const { articleId, blogId } = body;

  if (!articleId || !blogId) {
    return NextResponse.json({ error: "articleId and blogId are required" }, { status: 400 });
  }

  // blog 확인 및 tokenRef 검증
  const blogsData = readJson("blogs.json");
  const blog = blogsData.items.find((b) => b.id === blogId);
  if (!blog) {
    return NextResponse.json({ error: "blog not found" }, { status: 404 });
  }
  if (!blog.tokenRef) {
    return NextResponse.json(
      { error: "연결된 Blogger 계정이 없습니다. Blog Manager에서 연결 후 시도하세요." },
      { status: 403 }
    );
  }

  // article 확인
  const articlesData = readJson("articles.json");
  const article = articlesData.articles.find((a) => a.id === articleId);
  if (!article) {
    return NextResponse.json({ error: "article not found" }, { status: 404 });
  }

  // 중복 발행 차단: 이미 published이거나 publishedUrl이 있으면 거부
  if (article.status === "published" || article.publishedUrl) {
    return NextResponse.json(
      { error: "이미 발행된 글입니다. 중복 발행이 차단되었습니다.", status: "duplicate" },
      { status: 409 }
    );
  }

  // token 확인
  const tokenRecord = getTokenByBlogId(blogId);
  if (!tokenRecord) {
    return NextResponse.json({ error: "token record not found for this blog" }, { status: 400 });
  }

  // publish job 생성 → running
  const job = createPublishJob({ articleId, channelId: blogId, provider: "blogger" });
  updatePublishJobStatus(job.id, {
    status: "running",
    incrementAttempt: true,
    message: "자동 발행 시작",
  });

  try {
    let { accessToken, refreshToken } = decryptToken(tokenRecord);

    // bloggerBlogId가 없으면 Blogger API로 조회 후 저장
    let { bloggerBlogId } = blog;
    if (!bloggerBlogId) {
      try {
        bloggerBlogId = await bloggerProvider.fetchFirstBlogId(accessToken);
      } catch (fetchErr) {
        if (fetchErr.code === "TOKEN_EXPIRED" && refreshToken) {
          const refreshed = await bloggerProvider.refreshAccessToken(refreshToken);
          accessToken = refreshed.accessToken;
          upsertTokenForBlog({
            blogId,
            provider: "blogger",
            accessToken,
            refreshToken,
            scope: tokenRecord.scope,
            expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
          });
          bloggerBlogId = await bloggerProvider.fetchFirstBlogId(accessToken);
        } else {
          throw fetchErr;
        }
      }
      blog.bloggerBlogId = bloggerBlogId;
      writeJson("blogs.json", blogsData);
    }

    const content = {
      bloggerBlogId,
      title: article.title || "",
      html: buildBloggerHtml(article),
      labels: article.tags || [],
    };

    // 발행 시도. 401 발생 시 refresh 후 1회 재시도
    let result;
    try {
      result = await bloggerProvider.publish(job, content, { accessToken, refreshToken });
    } catch (publishErr) {
      if (publishErr.code === "TOKEN_EXPIRED" && refreshToken) {
        const refreshed = await bloggerProvider.refreshAccessToken(refreshToken);
        accessToken = refreshed.accessToken;
        upsertTokenForBlog({
          blogId,
          provider: "blogger",
          accessToken,
          refreshToken,
          scope: tokenRecord.scope,
          expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        });
        result = await bloggerProvider.publish(job, content, { accessToken, refreshToken });
      } else {
        throw publishErr;
      }
    }

    // 성공 처리
    updatePublishJobStatus(job.id, {
      status: "succeeded",
      publishedUrl: result.publishedUrl,
      externalId: result.externalId,
      message: "Blogger 자동 발행 성공",
    });

    const articleIndex = articlesData.articles.findIndex((a) => a.id === articleId);
    if (articleIndex !== -1) {
      articlesData.articles[articleIndex].status = "published";
      articlesData.articles[articleIndex].publishedUrl = result.publishedUrl;
      articlesData.articles[articleIndex].blogId = blogId;
      articlesData.articles[articleIndex].updatedAt = new Date().toISOString();
      writeJson("articles.json", articlesData);
    }

    return NextResponse.json({
      jobId: job.id,
      status: "succeeded",
      publishedUrl: result.publishedUrl,
      externalId: result.externalId,
    });
  } catch (err) {
    console.error("[publish route] 발행 실패");
    console.error("[publish route] err.message:", err.message);
    console.error("[publish route] err.code:", err.code);
    console.error("[publish route] err.httpStatus:", err.httpStatus);
    console.error("[publish route] err.googleErrorCode:", err.googleErrorCode);
    console.error("[publish route] err.googleErrors:", JSON.stringify(err.googleErrors));

    const isAuthError =
      err.code === "TOKEN_EXPIRED" ||
      err.code === "REFRESH_INVALID" ||
      /invalid_grant|token.*expired|unauthorized/i.test(err.message || "");

    const jobStatus = isAuthError ? "auth_required" : "failed";

    updatePublishJobStatus(job.id, {
      status: jobStatus,
      lastError: err.message,
      message: isAuthError ? "인증 만료 또는 재연결 필요" : `발행 실패: ${err.message}`,
    });

    return NextResponse.json(
      {
        jobId: job.id,
        status: jobStatus,
        error: err.message,
        httpStatus: err.httpStatus,
        googleErrorCode: err.googleErrorCode,
        googleErrors: err.googleErrors,
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
