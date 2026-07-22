import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { buildRecommendations } from "@/lib/atlas/recommendation-engine";
import { countActiveAffiliate } from "@/lib/atlas/affiliate-status";
import {
  saveRecommendationBatch,
  getLatestBatch,
  createPipelineJob,
} from "@/lib/atlas/repositories/pipeline-repository";

export const dynamic = "force-dynamic";

function generate() {
  const keywords = readJson("keywords.json").keywords || [];
  const articles = readJson("articles.json").articles || [];
  const categories = readJson("categories.json").items || [];
  return buildRecommendations({
    keywords,
    articles,
    categories,
    affiliateActiveCount: countActiveAffiliate(articles),
  });
}

// GET — return the latest batch, or generate one. ?fresh=1 forces regeneration.
export async function GET(request) {
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  let batch = fresh ? null : getLatestBatch();
  if (!batch) batch = saveRecommendationBatch(generate());
  return NextResponse.json(batch);
}

// POST — select a candidate topic → create a pipeline job at the recommendation
// stage. If linkedArticleId is supplied (an existing Factory MASTER), the job
// starts at QA instead of machine generation.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const recommendation = body?.recommendation || null;
  const linkedArticleId = String(body?.linkedArticleId || "");

  if (!recommendation && !linkedArticleId) {
    return NextResponse.json({ error: "recommendation 또는 linkedArticleId가 필요합니다." }, { status: 400 });
  }

  const job = createPipelineJob({
    topic: recommendation?.topic,
    type: recommendation?.type,
    linkedArticleId,
    recommendation,
  });
  return NextResponse.json({ ok: true, job }, { status: 201 });
}
