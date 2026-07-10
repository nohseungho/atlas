import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { markdownToHtml } from "@/lib/html-exporter";
import {
  createPublishJob,
  updatePublishJobStatus,
} from "@/lib/atlas/repositories/publishing-repository";

const FILE = "articles.json";

export async function GET() {
  const data = readJson(FILE);
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const data = readJson(FILE);
  const now = new Date().toISOString();

  const maxNum = data.articles.reduce((max, item) => {
    const match = /^art_(\d+)$/.exec(item.id || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const article = {
    id: `art_${String(maxNum + 1).padStart(3, "0")}`,
    ...body,
    createdAt: now,
    updatedAt: now,
  };

  data.articles.push(article);
  writeJson(FILE, data);

  return NextResponse.json(article, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json();

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data = readJson(FILE);
  const article = data.articles.find((item) => item.id === body.id);

  if (!article) {
    return NextResponse.json({ error: "article not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (body.status) article.status = body.status;
  if (typeof body.publishedUrl === "string") article.publishedUrl = body.publishedUrl;
  if (typeof body.blogId === "string") article.blogId = body.blogId;
  if (typeof body.title === "string") article.title = body.title;
  if (typeof body.hookTitle === "string") article.hookTitle = body.hookTitle;
  if (typeof body.koreanReview === "string") article.koreanReview = body.koreanReview;
  if (typeof body.bodyMarkdown === "string") {
    article.bodyMarkdown = body.bodyMarkdown;
    article.bodyHtml = markdownToHtml(body.bodyMarkdown);
  }
  article.updatedAt = now;
  writeJson(FILE, data);

  if (body.status === "published") {
    // article : PublishJob = 1 : N. 매 발행 처리마다 새 job을 만든다(채널별로 여러 개 가능).
    // 실제 Blogger API 호출은 아직 없으므로, Publisher의 수동 발행 완료를
    // "성공한 job"으로 즉시 기록한다.
    const job = createPublishJob({
      articleId: article.id,
      channelId: body.blogId || article.blogId || "",
      provider: body.blogPlatform || "blogger",
    });
    updatePublishJobStatus(job.id, {
      status: "succeeded",
      publishedUrl: body.publishedUrl || "",
      incrementAttempt: true,
      message: "Publisher 수동 발행 완료 처리",
    });

    const keywordsData = readJson("keywords.json");
    const keyword = keywordsData.keywords.find((item) => item.id === article.keywordId);
    if (keyword) {
      keyword.status = "published";
      keyword.updatedAt = now;
      writeJson("keywords.json", keywordsData);
    }
  }

  return NextResponse.json(article);
}
