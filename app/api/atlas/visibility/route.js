// 공개 글 비공개 전환(초안으로 되돌리기) — 품질 불량 공개 글 정리용 단일 목적 라우트.
//
// 사용자가 이 글을 비공개로 돌리라고 승인한 기록(visibilityHold.action=revert_to_draft,
// userApprovedAt)이 있어야만 실행한다. 후보 표시(unpublish_candidate)만 된 글은 건드리지 않는다.
// 본문·이미지는 지우지 않고 Blogger posts.revert로 공개만 내린다. 삭제·재발행·본문 수정 없음.
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { readJson, writeJson } from "@/lib/data-store";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import { createBloggerSession, isAuthError, RECONNECT_CODE } from "@/lib/atlas/blogger-sync";

export const runtime = "nodejs";

const ARTICLES = "articles.json";
const HOLDS = "visibility-holds.json";

// ATLAS 기록이 없는 외부 공개 글. 비공개 승인은 visibility-holds.json에 postId로 기록된다.
function externalRecord(postId) {
  const post = (readJson("publisher-state.json").externalPosts || []).find((p) => p.id === postId);
  if (!post) return null;
  let holds = {};
  try {
    holds = readJson(HOLDS);
  } catch {
    holds = {};
  }
  return { id: `external-${postId}`, external: true, title: post.title, bloggerPostId: postId, publishedUrl: post.url, blogId: "blog_001", visualAssets: [], visibilityHold: holds[postId] || {} };
}

// Blogger 본문(ADMIN 보기)과 ATLAS 기록을 data/atlas/backups/ 에 남긴다.
async function backupPost(session, article) {
  const post = await session.run((at) => bloggerProvider.getPostAdmin(session.bloggerBlogId, article.bloggerPostId, at));
  if (!post) throw new Error("Blogger에서 글을 찾지 못해 백업하지 못했습니다.");
  const dir = path.join(process.cwd(), "data", "atlas", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${article.id}-${article.bloggerPostId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const record = {
    backedUpAt: new Date().toISOString(),
    articleId: article.id,
    bloggerBlogId: session.bloggerBlogId,
    bloggerPostId: article.bloggerPostId,
    publishedUrl: article.publishedUrl,
    blogger: post,
    images: (article.visualAssets || []).map((v) => ({ key: v.key, localSrc: v.localSrc, publicUrl: v.publicUrl })),
    article,
  };
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}

function isLocalOrigin(request) {
  return (request.headers.get("host") || "") === "localhost:3002";
}

export async function POST(request) {
  if (!isLocalOrigin(request)) return NextResponse.json({ errorCode: "FORBIDDEN_ORIGIN" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const articleId = String(body.articleId || "");
  if (!["revert_to_draft", "backup"].includes(body.action)) return NextResponse.json({ errorCode: "UNKNOWN_ACTION" }, { status: 400 });

  // ATLAS 기록이 있는 글은 articles.json, 없는 외부 글(Blogger에만 있는 글)은
  // publisher-state.externalPosts + visibility-holds.json 승인 기록으로 다룬다.
  const externalPostId = String(body.externalPostId || "");
  const data = readJson(ARTICLES);
  const article = externalPostId ? externalRecord(externalPostId) : (data.articles || []).find((a) => a.id === articleId);
  if (!article) return NextResponse.json({ errorCode: "ARTICLE_NOT_FOUND" }, { status: 404 });

  // backup: 읽기 전용. Blogger의 현재 본문·상태와 ATLAS 기록(이미지 URL·postId)을 파일로 남긴다.
  if (body.action === "backup") {
    const session = createBloggerSession(article.blogId || "blog_001");
    if (!session) return NextResponse.json({ articleId, errorCode: RECONNECT_CODE }, { status: 401 });
    try {
      const file = await backupPost(session, article);
      return NextResponse.json({ articleId, status: "backed_up", file });
    } catch (err) {
      return NextResponse.json({ articleId, errorCode: "BACKUP_FAILED", error: String(err?.message || err) }, { status: 502 });
    }
  }

  const hold = article.visibilityHold || {};
  if (hold.action !== "revert_to_draft" || !hold.userApprovedAt) {
    return NextResponse.json(
      { articleId, errorCode: "USER_UNPUBLISH_APPROVAL_REQUIRED", error: "사용자가 비공개 전환을 승인한 글만 되돌립니다." },
      { status: 409 },
    );
  }
  if (!article.bloggerPostId) return NextResponse.json({ articleId, errorCode: "NO_POST_ID" }, { status: 409 });

  const session = createBloggerSession(article.blogId || "blog_001");
  if (!session) return NextResponse.json({ articleId, errorCode: RECONNECT_CODE }, { status: 401 });

  try {
    // 되돌리기 전에 반드시 백업한다. 백업이 실패하면 공개 상태를 건드리지 않는다.
    const backupFile = await backupPost(session, article);
    const reverted = await session.run((at) => bloggerProvider.revertPost(session.bloggerBlogId, article.bloggerPostId, at));
    // 공개 URL이 더 이상 열리지 않는지 확인한다.
    let publicStatus = 0;
    try {
      publicStatus = (await fetch(article.publishedUrl, { redirect: "manual" })).status;
    } catch {
      publicStatus = -1;
    }
    const now = new Date().toISOString();
    const result = { ...hold, status: "reverted_to_draft", revertedAt: now, publicUrlStatusAfter: publicStatus, backupFile };
    if (article.external) {
      const holds = readJson(HOLDS);
      holds[article.bloggerPostId] = { ...holds[article.bloggerPostId], ...result, bloggerStatus: reverted.status || "DRAFT" };
      writeJson(HOLDS, holds);
    } else {
      const fresh = readJson(ARTICLES);
      const target = fresh.articles.find((a) => a.id === articleId);
      // status/publishState는 그대로 둔다: bloggerPostId가 남아 있어 중복 발행 방지가 계속 유지된다.
      target.bloggerStatus = reverted.status || "DRAFT";
      target.visibilityHold = result;
      writeJson(ARTICLES, fresh);
    }
    return NextResponse.json({ articleId: article.id, status: "reverted_to_draft", bloggerStatus: reverted.status || "DRAFT", publicUrlStatusAfter: publicStatus });
  } catch (err) {
    return NextResponse.json(
      { articleId, errorCode: isAuthError(err) ? RECONNECT_CODE : "BLOGGER_REVERT_FAILED", error: String(err?.message || err) },
      { status: isAuthError(err) ? 401 : 502 },
    );
  }
}
