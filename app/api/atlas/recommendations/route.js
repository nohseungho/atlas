import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { buildRecommendations, assertProductionEligible } from "@/lib/atlas/recommendation-engine";
import { countActiveAffiliate } from "@/lib/atlas/affiliate-status";
import {
  saveRecommendationBatch,
  getLatestBatch,
  createPipelineJob,
} from "@/lib/atlas/repositories/pipeline-repository";

export const dynamic = "force-dynamic";

// Live trend provider readiness (server-only env check, no secret echoed).
// Absent → editorial fallback, never a fabricated trend.
function trendLive() {
  return typeof process !== "undefined" && !!process.env?.ATLAS_TREND_API_KEY;
}

function generate() {
  const keywords = readJson("keywords.json").keywords || [];
  const articles = readJson("articles.json").articles || [];
  const categories = readJson("categories.json").items || [];
  return buildRecommendations({
    keywords,
    articles,
    categories,
    affiliateActiveCount: countActiveAffiliate(articles),
    liveData: trendLive(),
  });
}

// GET — latest batch or generate. ?fresh=1 forces regeneration.
export async function GET(request) {
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  let batch = fresh ? null : getLatestBatch();
  if (!batch) batch = saveRecommendationBatch(generate());
  return NextResponse.json(batch);
}

// POST — select a candidate → create a pipeline job. The scope Hard Gate is
// re-applied server-side so an off-scope payload cannot reach article
// generation even if the UI is bypassed.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const recommendation = body?.recommendation || null;
  const linkedArticleId = String(body?.linkedArticleId || "");
  const articles = readJson("articles.json").articles || [];

  if (!recommendation && !linkedArticleId) {
    return NextResponse.json({ error: "recommendation 또는 linkedArticleId가 필요합니다." }, { status: 400 });
  }

  // Linking an existing in-scope MASTER (art_002~006) is always allowed.
  if (recommendation && !linkedArticleId) {
    const gate = assertProductionEligible(recommendation, articles);
    if (!gate.ok) {
      return NextResponse.json({ ok: false, blocked: true, reason: gate.reason }, { status: 422 });
    }
  }

  const job = createPipelineJob({
    topic: recommendation?.title || recommendation?.topic,
    type: recommendation?.type,
    linkedArticleId,
    recommendation,
  });
  return NextResponse.json({ ok: true, job }, { status: 201 });
}
