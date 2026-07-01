import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";

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
  article.updatedAt = now;
  writeJson(FILE, data);

  if (body.status === "published") {
    const publishingData = readJson("publishing.json");
    const entry = {
      articleId: article.id,
      blogPlatform: body.blogPlatform || "blogger",
      publishedUrl: body.publishedUrl || "",
      publishedAt: now,
      status: "published",
    };
    const existing = publishingData.items.find((item) => item.articleId === article.id);
    if (existing) {
      Object.assign(existing, entry);
    } else {
      publishingData.items.push(entry);
    }
    writeJson("publishing.json", publishingData);

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
