import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { runArticleQa } from "@/lib/atlas/qa-engine";
import { canAdvance, describeStage, articleStatusForStage } from "@/lib/atlas/revenue-pipeline";
import { contentProviderReadiness } from "@/lib/atlas/providers/content-provider";
import {
  listPipelineJobs,
  getPipelineJob,
  updatePipelineJob,
} from "@/lib/atlas/repositories/pipeline-repository";

export const dynamic = "force-dynamic";

function articleFor(job, articles) {
  const id = job.linkedArticleId;
  return id ? articles.find((a) => a.id === id) || null : null;
}

// Attach live QA + stage context to each job so the UI can render status/next.
function decorate(job, articles) {
  const article = articleFor(job, articles);
  const qa = article ? runArticleQa(article, { articles, humanApproved: job.humanApproved }) : null;
  const readiness = contentProviderReadiness();
  const advance = canAdvance(job, {
    article,
    qa,
    providerReadiness: readiness,
    humanApproved: job.humanApproved,
    imagesReady: job.imagesReady,
  });
  return {
    ...job,
    stageInfo: describeStage(job.stage),
    articleStatus: articleStatusForStage(job.stage),
    qa,
    providerReadiness: readiness,
    advance,
  };
}

export async function GET() {
  const articles = readJson("articles.json").articles || [];
  const jobs = listPipelineJobs().map((j) => decorate(j, articles));
  return NextResponse.json({ jobs, providerReadiness: contentProviderReadiness() });
}

// POST actions: { jobId, action }
//   action = "advance" → move to next stage if the gate allows
//   action = "approve" → set humanApproved
//   action = "imagesReady" → mark the 5-image plan ready
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { jobId, action } = body;
  const job = getPipelineJob(jobId);
  if (!job) return NextResponse.json({ error: "job을 찾을 수 없습니다." }, { status: 404 });

  const articles = readJson("articles.json").articles || [];

  if (action === "approve") {
    const updated = updatePipelineJob(jobId, { humanApproved: true }, "사람 최종 승인");
    return NextResponse.json({ ok: true, job: decorate(updated, articles) });
  }
  if (action === "imagesReady") {
    const updated = updatePipelineJob(jobId, { imagesReady: true }, "이미지 계획 준비 완료");
    return NextResponse.json({ ok: true, job: decorate(updated, articles) });
  }
  if (action === "advance") {
    const article = articleFor(job, articles);
    const qa = article ? runArticleQa(article, { articles, humanApproved: job.humanApproved }) : null;
    const gate = canAdvance(job, {
      article,
      qa,
      providerReadiness: contentProviderReadiness(),
      humanApproved: job.humanApproved,
      imagesReady: job.imagesReady,
    });
    if (!gate.ok) {
      return NextResponse.json({ ok: false, blocked: true, reason: gate.reason, status: gate.status || "BLOCKED" }, { status: 200 });
    }
    // NOTE: reaching "published" here only advances the pipeline overlay. The
    // real Blogger publish (and article.status change) stays a human action in
    // the Publisher — this endpoint never performs an external POST.
    const updated = updatePipelineJob(jobId, { stage: gate.to }, gate.note || "");
    return NextResponse.json({ ok: true, job: decorate(updated, articles) });
  }

  return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 });
}
