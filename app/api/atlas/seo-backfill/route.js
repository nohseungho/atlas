// §9 — bring the 8 already-public posts up to the SEO standard.
//
// Two actions:
//   plan     (default) read-only; shows exactly what would change per post.
//   execute  requires confirm:true; backs up articles.json first, then applies
//            each item with posts.patch — meta description, labels, and the
//            appended Related ATLAS Guides block. Never posts.insert, never
//            deletes, never touches title / URL / publish date / images.
//
// A post whose stored data drifted since planning is skipped, not force-pushed.
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { readJson, writeJson } from "@/lib/data-store";
import { buildBackfillPlan, verifyBackfillItem } from "@/lib/atlas/seo-backfill";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import { createBloggerSession, isAuthError, RECONNECT_CODE } from "@/lib/atlas/blogger-sync";

export const runtime = "nodejs";

const DEFAULT_BLOG = "blog_001";
const BACKUP_DIR = path.join(process.cwd(), "data", "atlas", "backups");

function backupArticles() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(BACKUP_DIR, `articles-${stamp}.json`);
  fs.copyFileSync(path.join(process.cwd(), "data", "atlas", "articles.json"), file);
  return path.relative(process.cwd(), file);
}

export async function GET() {
  const articles = readJson("articles.json").articles || [];
  const plan = buildBackfillPlan({ articles });
  return NextResponse.json({ status: "ok", action: "plan", ...plan });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action || "plan";
  const blogId = body.blogId || DEFAULT_BLOG;
  const articles = readJson("articles.json").articles || [];
  const plan = buildBackfillPlan({ articles, articleIds: body.articleIds || null });

  if (action !== "execute") {
    return NextResponse.json({ status: "ok", action: "plan", ...plan });
  }

  // Executing edits live, indexed posts. It never runs implicitly.
  if (body.confirm !== true) {
    return NextResponse.json(
      { status: "confirmation_required", errorCode: "CONFIRM_REQUIRED", message: "라이브 게시글을 수정합니다. confirm:true가 필요합니다.", ...plan },
      { status: 400 },
    );
  }
  if (!plan.items.length) {
    return NextResponse.json({ status: "noop", message: "적용할 항목이 없습니다.", ...plan });
  }

  const session = createBloggerSession(blogId);
  if (!session) {
    return NextResponse.json(
      { status: "auth_required", errorCode: RECONNECT_CODE, message: "Blogger 재연결이 필요합니다. 라이브 글은 변경되지 않았습니다." },
      { status: 401 },
    );
  }

  // Backup BEFORE the first remote write, so a partial run is always recoverable.
  const backupFile = backupArticles();

  const applied = [];
  const failed = [];
  const skipped = [...plan.skipped];

  for (const item of plan.items) {
    const data = readJson("articles.json");
    const article = data.articles.find((a) => a.id === item.articleId);

    const verify = verifyBackfillItem(item, article);
    if (!verify.ok) {
      skipped.push({ articleId: item.articleId, title: item.title, reason: verify.issues.join(" / ") });
      continue;
    }

    try {
      // posts.patch only. `title` is deliberately absent from the payload, so
      // Blogger keeps the existing title, slug, URL and publish date.
      await session.run((accessToken) =>
        bloggerProvider.updatePost(
          session.bloggerBlogId,
          article.bloggerPostId,
          { html: item.bodyHtml, labels: item.labels, metaDescription: item.metaDescription },
          { accessToken },
        ),
      );

      article.bodyHtml = item.bodyHtml;
      article.metaDescription = item.metaDescription;
      article.seoLabels = item.labels;
      article.internalLinks = item.internalLinks;
      article.seoBackfilledAt = new Date().toISOString();
      article.updatedAt = article.seoBackfilledAt;
      writeJson("articles.json", data);

      applied.push({
        articleId: item.articleId,
        title: item.title,
        publishedUrl: item.publishedUrl,
        changes: item.changes,
        warnings: item.warnings,
      });
    } catch (err) {
      if (isAuthError(err)) {
        return NextResponse.json(
          {
            status: "auth_required", errorCode: RECONNECT_CODE,
            message: "작업 중 Blogger 인증이 만료되었습니다. 적용된 항목까지는 저장되었습니다.",
            backupFile, applied, failed, skipped,
          },
          { status: 401 },
        );
      }
      failed.push({ articleId: item.articleId, title: item.title, error: String(err.message || "").slice(0, 200) });
    }
  }

  return NextResponse.json({
    status: failed.length ? "partial" : "ok",
    action: "execute",
    backupFile,
    appliedCount: applied.length,
    applied,
    failed,
    skipped,
    guarantees: plan.guarantees,
    note: "posts.patch만 사용했습니다. 제목·공개 URL·발행일·이미지·기존 본문 문장은 변경되지 않았습니다.",
  });
}
