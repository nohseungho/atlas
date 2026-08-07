import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { markdownToHtml } from "@/lib/html-exporter";
import {
  buildArticleFromMaster,
  findUnusedKeywords,
  nextArticleId,
  suggestSlug,
  validateMasterPackage,
} from "@/lib/atlas/article-factory";

const FILE = "articles.json";

// GET — what the Factory screen needs to open: unused keywords, the next id,
// and the slugs/keywords already taken (so the UI can warn before submitting).
export async function GET() {
  const articlesData = readJson(FILE);
  const keywordsData = readJson("keywords.json");
  const articles = articlesData.articles || [];
  const keywords = keywordsData.keywords || [];

  const unused = findUnusedKeywords(keywords, articles);

  return NextResponse.json({
    nextId: nextArticleId(articles),
    unusedKeywords: unused.map((k) => ({ ...k, suggestedSlug: suggestSlug(k.keyword) })),
    takenSlugs: articles.map((a) => a.slug).filter(Boolean),
    takenKeywords: articles.map((a) => a.keyword).filter(Boolean),
  });
}

// POST — validate a MASTER package and, unless dryRun, persist it.
// Nothing is written when validation fails, so a bad paste cannot corrupt
// articles.json or touch the already-published art_002/art_003.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱에 실패했습니다." }, { status: 400 });
  }

  const master = body?.master;
  const dryRun = Boolean(body?.dryRun);
  const status = body?.status === "draft" ? "draft" : "written";

  const data = readJson(FILE);
  const articles = data.articles || [];

  const result = validateMasterPackage(master, { articles, mode: "production" });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, saved: false, errors: result.errors, warnings: result.warnings },
      { status: 422 },
    );
  }

  const id = nextArticleId(articles);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      saved: false,
      id,
      warnings: result.warnings,
      preview: buildArticleFromMaster(master, { id, status }),
    });
  }

  const now = new Date().toISOString();
  const article = {
    ...buildArticleFromMaster(master, { id, status }),
    createdAt: now,
    updatedAt: now,
  };
  article.bodyHtml = markdownToHtml(article.bodyMarkdown);

  data.articles.push(article);
  writeJson(FILE, data);

  // Link the keyword only when the package named one, and only forward from
  // "idea"/"selected" — never downgrade an already-published keyword.
  const keywordId = article.keywordId;
  if (keywordId) {
    const keywordsData = readJson("keywords.json");
    const keyword = keywordsData.keywords.find((k) => k.id === keywordId);
    if (keyword && keyword.status !== "published") {
      keyword.status = "written";
      keyword.updatedAt = now;
      writeJson("keywords.json", keywordsData);
    }
  }

  return NextResponse.json(
    { ok: true, saved: true, id, article, warnings: result.warnings },
    { status: 201 },
  );
}
