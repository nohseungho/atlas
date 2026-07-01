import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { generateArticleFromKeyword } from "@/lib/article-writer";

export async function POST(request) {
  const body = await request.json();

  if (!body.keywordId) {
    return NextResponse.json({ error: "keywordId is required" }, { status: 400 });
  }

  const keywordsData = readJson("keywords.json");
  const keyword = keywordsData.keywords.find((item) => item.id === body.keywordId);

  if (!keyword) {
    return NextResponse.json({ error: "keyword not found" }, { status: 404 });
  }

  const articlesData = readJson("articles.json");
  const now = new Date().toISOString();

  const maxNum = articlesData.articles.reduce((max, item) => {
    const match = /^art_(\d+)$/.exec(item.id || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const draft = generateArticleFromKeyword(keyword);
  const article = {
    id: `art_${String(maxNum + 1).padStart(3, "0")}`,
    ...draft,
    createdAt: now,
    updatedAt: now,
  };

  articlesData.articles.push(article);
  writeJson("articles.json", articlesData);

  keyword.status = "written";
  keyword.updatedAt = now;
  writeJson("keywords.json", keywordsData);

  return NextResponse.json(article, { status: 201 });
}
