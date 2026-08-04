// CHATGPT_HANDOFF — export a secret-free request file (atlas-request-{jobId}.json)
// for a chosen Money Hunter candidate on Blog 01. No generation API is called.
import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { buildHandoffRequest, automationMode } from "@/lib/atlas/chatgpt-handoff";
import { nicheMatches } from "@/lib/atlas/money-hunter-select";
import { listProductionJobs, createProductionJob, updateProductionJob } from "@/lib/atlas/repositories/production-job-repository";

export const runtime = "nodejs";

const PERSONA = "US Tourist";
const TEMPLATE = "guide";

function findHandoffJob(blogId, moneyHunterId) {
  return (
    listProductionJobs().find((j) => j.blogId === blogId && j.moneyHunterId === moneyHunterId && j.status !== "FAILED") || null
  );
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const blogId = body.blogId || "blog_001";
  const moneyHunterId = body.moneyHunterId || body.keywordId;
  if (!moneyHunterId) return NextResponse.json({ status: "error", errorCode: "MONEY_HUNTER_ID_REQUIRED" }, { status: 400 });

  const keywords = readJson("keywords.json").keywords || [];
  const kw = keywords.find((k) => k.id === moneyHunterId);
  if (!kw) return NextResponse.json({ status: "error", errorCode: "CANDIDATE_NOT_FOUND" }, { status: 404 });

  // Blog 01 niche separation — never mix K-Beauty into the travel blog.
  if (!nicheMatches(blogId, { category: kw.category, keyword: kw.keyword })) {
    return NextResponse.json({ status: "error", errorCode: "NICHE_MISMATCH", message: `이 후보는 ${blogId} niche와 맞지 않습니다.` }, { status: 400 });
  }

  const blog = (readJson("blogs.json").items || []).find((b) => b.id === blogId) || { id: blogId, name: blogId };
  const existingArticles = readJson("articles.json").articles || [];
  const usedIds = new Set(listProductionJobs().filter((j) => j.moneyHunterId).map((j) => j.moneyHunterId));
  const unusedCandidates = keywords.filter(
    (k) => nicheMatches(blogId, { category: k.category, keyword: k.keyword }) && !usedIds.has(k.id)
  );

  // Idempotent: one job per (blogId + moneyHunterId).
  let job = findHandoffJob(blogId, moneyHunterId);
  if (!job) {
    const { job: created } = createProductionJob({ recommendation: { title: kw.keyword, searchIntent: kw.intent } });
    job = updateProductionJob(created.id, (j) => {
      j.blogId = blogId;
      j.moneyHunterId = moneyHunterId;
      j.mode = "CHATGPT_HANDOFF";
      j.status = "WAITING_FOR_CHATGPT_PACKAGE";
      j.step = "CHATGPT_REQUEST_READY";
    });
  } else {
    job = updateProductionJob(job.id, (j) => {
      if (!j.mode) j.mode = "CHATGPT_HANDOFF";
      if (["QUEUED", "CHATGPT_REQUEST_READY"].includes(j.status)) j.status = "WAITING_FOR_CHATGPT_PACKAGE";
    });
  }

  const req = buildHandoffRequest({
    jobId: job.id,
    blog,
    candidate: { id: kw.id, keyword: kw.keyword, moneyScore: kw.moneyScore, category: kw.category },
    existingArticles,
    unusedCandidates,
    persona: PERSONA,
    template: TEMPLATE,
  });

  return NextResponse.json({
    status: "ok",
    mode: automationMode(),
    jobId: job.id,
    filename: `atlas-request-${job.id}.json`,
    request: req,
  });
}
