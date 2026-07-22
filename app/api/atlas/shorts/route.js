import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { buildShortsDraft } from "@/lib/atlas/shorts-engine";
import { countActiveAffiliate } from "@/lib/atlas/affiliate-status";
import { getJobsByArticleId } from "@/lib/atlas/repositories/publishing-repository";
import { listShortDrafts, saveShortDraft, existingShortIds } from "@/lib/atlas/repositories/shorts-repository";
import { registerCampaigns } from "@/lib/atlas/repositories/tracking-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ drafts: listShortDrafts() });
}

// POST — build a shorts draft from an article. Published articles produce a
// Production draft (campaigns counted); unpublished art_004~006 produce a
// Preview draft that is excluded from Production totals.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const articleId = String(body?.articleId || "");
  const articles = readJson("articles.json").articles || [];
  const article = articles.find((a) => a.id === articleId);
  if (!article) return NextResponse.json({ error: "article을 찾을 수 없습니다." }, { status: 404 });

  const isProduction = article.status === "published";
  const publishedUrl =
    article.publishedUrl ||
    getJobsByArticleId(article.id).find((j) => j.status === "succeeded" && j.publishedUrl)?.publishedUrl ||
    "";

  const draft = buildShortsDraft(article, {
    affiliateActiveCount: countActiveAffiliate(articles),
    bloggerUrl: publishedUrl,
    existingShortIds: existingShortIds(),
    isProduction,
  });

  saveShortDraft(draft);
  // Register campaigns so tracking knows about them (production flag carried).
  registerCampaigns(
    draft.campaigns.map((c) => ({
      campaignId: c.campaignId,
      articleId: draft.articleId,
      shortId: draft.shortId,
      platform: c.platform,
      productId: c.productId,
      bloggerUrl: draft.bloggerUrl,
      isProduction,
    })),
  );

  return NextResponse.json({ ok: true, draft }, { status: 201 });
}
