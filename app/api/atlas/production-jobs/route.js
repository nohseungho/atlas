import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { assertProductionEligible } from "@/lib/atlas/recommendation-engine";
import { runProductionJob, canApprovePublish, STEP_LABEL, isResumable } from "@/lib/atlas/production-pipeline";
import {
  createProductionJob,
  getProductionJob,
  listProductionJobs,
} from "@/lib/atlas/repositories/production-job-repository";

export const dynamic = "force-dynamic";

// Attach user-friendly Korean labels; never expose stack traces / secrets.
function decorate(job) {
  if (!job) return job;
  return {
    ...job,
    statusLabel: STEP_LABEL[job.status] || job.status,
    stepLabel: STEP_LABEL[job.step] || job.step,
    resumable: isResumable(job),
    approve: canApprovePublish(job),
  };
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const job = getProductionJob(id);
    if (!job) return NextResponse.json({ error: "job을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ job: decorate(job) });
  }
  return NextResponse.json({ jobs: listProductionJobs().map(decorate) });
}

// POST:
//   (no action) create  { recommendation }         → fast QUEUED job (idempotent)
//   action "run"        { jobId }                   → advance runner to completion/blocked
//   action "retry"      { jobId }                   → resume from the blocked/failed step
//   action "approvePublish" { jobId }               → human final publish (gated; no auto-publish)
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = body?.action || "create";
  const articles = readJson("articles.json").articles || [];

  if (action === "create") {
    const recommendation = body?.recommendation;
    // Server-side Hard Gate — a bypassed/tampered payload cannot enter the pipeline.
    const gate = assertProductionEligible(recommendation, articles);
    if (!gate.ok) {
      return NextResponse.json({ ok: false, blocked: true, reason: gate.reason }, { status: 422 });
    }
    const { job, duplicate } = createProductionJob({ recommendation });
    return NextResponse.json({ ok: true, duplicate, job: decorate(job) }, { status: duplicate ? 200 : 201 });
  }

  const jobId = body?.jobId;
  const existing = getProductionJob(jobId);
  if (!existing) return NextResponse.json({ error: "job을 찾을 수 없습니다." }, { status: 404 });

  if (action === "run" || action === "retry") {
    if (!isResumable(existing)) {
      return NextResponse.json({ ok: true, job: decorate(existing), note: "이미 완료된 Job — 중복 실행하지 않습니다." });
    }
    const job = await runProductionJob(jobId);
    return NextResponse.json({ ok: true, job: decorate(job) });
  }

  if (action === "approvePublish") {
    const gate = canApprovePublish(existing);
    if (!gate.ok) {
      // No auto-publish and no fake success — publishing stays blocked until the
      // full pipeline (draft + images + Blogger draft) is genuinely complete.
      return NextResponse.json({ ok: false, blocked: true, reasons: gate.reasons }, { status: 409 });
    }
    // A genuine publish would run here via the existing /api/publish flow. It is
    // only reachable once a real Blogger draft exists — never in a mocked state.
    return NextResponse.json({ ok: false, blocked: true, reasons: ["실제 Blogger 발행 연동은 Blogger 재인증 후 활성화됩니다."] }, { status: 409 });
  }

  return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 });
}
