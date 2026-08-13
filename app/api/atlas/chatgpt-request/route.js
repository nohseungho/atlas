// CHATGPT_HANDOFF — export a secret-free request file (atlas-request-{jobId}.json)
// for a chosen Money Hunter candidate, or for a weekly R2 recommendation card,
// on Blog 01. No generation API is called.
import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { buildHandoffRequest, buildRecommendationCandidate, automationMode } from "@/lib/atlas/chatgpt-handoff";
import { nicheMatches } from "@/lib/atlas/money-hunter-select";
import { assertProductionEligible } from "@/lib/atlas/recommendation-engine";
import { handoffRequestKey } from "@/lib/atlas/job-identity";
import { listProductionJobs, createProductionJob, updateProductionJob } from "@/lib/atlas/repositories/production-job-repository";

export const runtime = "nodejs";

const PERSONA = "US Tourist";
const TEMPLATE = "guide";

function findHandoffJob(blogId, moneyHunterId) {
  return (
    listProductionJobs().find((j) => j.blogId === blogId && j.moneyHunterId === moneyHunterId && j.status !== "FAILED") || null
  );
}

function markHandoff(jobId, { blogId, moneyHunterId }) {
  return updateProductionJob(jobId, (j) => {
    j.blogId = blogId;
    j.moneyHunterId = moneyHunterId;
    j.mode = "CHATGPT_HANDOFF";
    j.status = "WAITING_FOR_CHATGPT_PACKAGE";
    j.step = "CHATGPT_REQUEST_READY";
  });
}

// One job per (blogId + candidate), for both paths.
//   • an existing request for this candidate → that job, untouched
//   • otherwise a NEW job whose identity is the request itself, so it never
//     adopts an unrelated job that merely shares a topic. That adoption is what
//     returned the July research-blocked pjob_001 for a fresh Trip Cancellation
//     request instead of a new number.
// The key is read and written in one synchronous pass, so clicks racing each
// other still resolve to a single job.
function claimHandoffJob({ blogId, candidateId, recommendation }) {
  const existing = findHandoffJob(blogId, candidateId);
  if (existing) return { job: existing, duplicate: true };

  const { job, duplicate } = createProductionJob({
    recommendation,
    idempotencyKey: handoffRequestKey({ blogId, candidateId }),
  });
  return duplicate
    ? { job, duplicate: true }
    : { job: markHandoff(job.id, { blogId, moneyHunterId: candidateId }), duplicate: false };
}

// Money Hunter path: the candidate comes from keywords.json.
function jobForKeyword(blogId, moneyHunterId, keywords) {
  const kw = keywords.find((k) => k.id === moneyHunterId);
  if (!kw) return { error: NextResponse.json({ status: "error", errorCode: "CANDIDATE_NOT_FOUND" }, { status: 404 }) };

  // Blog 01 niche separation — never mix K-Beauty into the travel blog.
  if (!nicheMatches(blogId, { category: kw.category, keyword: kw.keyword })) {
    return { error: NextResponse.json({ status: "error", errorCode: "NICHE_MISMATCH", message: `이 후보는 ${blogId} niche와 맞지 않습니다.` }, { status: 400 }) };
  }

  const { job, duplicate } = claimHandoffJob({
    blogId,
    candidateId: kw.id,
    recommendation: { title: kw.keyword, searchIntent: kw.intent },
  });
  return {
    job,
    duplicate,
    candidate: { id: kw.id, keyword: kw.keyword, moneyScore: kw.moneyScore, category: kw.category },
  };
}

// R2 path: the recommendation card has no keywords.json id, so the candidate id
// is derived from the topic (buildRecommendationCandidate).
function jobForRecommendation(blogId, recommendation, articles) {
  // Same Hard Gate the automatic pipeline uses — a manual request cannot smuggle
  // an off-scope topic past it. It runs first so an off-scope card reports the
  // real reason instead of "주제를 읽지 못했습니다".
  const gate = assertProductionEligible(recommendation, articles);
  if (!gate.ok) {
    return { error: NextResponse.json({ status: "error", errorCode: "OUT_OF_SCOPE", message: gate.reason }, { status: 422 }) };
  }

  const candidate = buildRecommendationCandidate(recommendation);
  if (!candidate) {
    return { error: NextResponse.json({ status: "error", errorCode: "RECOMMENDATION_TOPIC_REQUIRED", message: "추천 후보의 주제(영문)를 읽지 못했습니다." }, { status: 400 }) };
  }

  const { job, duplicate } = claimHandoffJob({ blogId, candidateId: candidate.id, recommendation });
  return { job, duplicate, candidate };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const blogId = body.blogId || "blog_001";
  const moneyHunterId = body.moneyHunterId || body.keywordId;
  const recommendation = body.recommendation;
  if (!moneyHunterId && !recommendation) {
    return NextResponse.json({ status: "error", errorCode: "MONEY_HUNTER_ID_REQUIRED" }, { status: 400 });
  }

  const keywords = readJson("keywords.json").keywords || [];
  const existingArticles = readJson("articles.json").articles || [];

  const resolved = moneyHunterId
    ? jobForKeyword(blogId, moneyHunterId, keywords)
    : jobForRecommendation(blogId, recommendation, existingArticles);
  if (resolved.error) return resolved.error;
  const { job, candidate, duplicate } = resolved;

  const blog = (readJson("blogs.json").items || []).find((b) => b.id === blogId) || { id: blogId, name: blogId };
  const usedIds = new Set(listProductionJobs().filter((j) => j.moneyHunterId).map((j) => j.moneyHunterId));
  const unusedCandidates = keywords.filter(
    (k) => nicheMatches(blogId, { category: k.category, keyword: k.keyword }) && !usedIds.has(k.id)
  );

  const req = buildHandoffRequest({
    jobId: job.id,
    blog,
    candidate,
    existingArticles,
    unusedCandidates,
    persona: PERSONA,
    template: TEMPLATE,
  });

  return NextResponse.json({
    status: "ok",
    mode: automationMode(),
    jobId: job.id,
    duplicate,
    filename: `atlas-request-${job.id}.json`,
    request: req,
  });
}
