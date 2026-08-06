// "승인 및 예약" — the user's single final action (§8).
//
// One POST runs the content QA gate, records the approval the existing
// /api/publish route independently verifies, and books the next publish slot.
// It never calls Blogger: publishing happens later, from the Publisher, still
// behind the same approval gate. A QA failure returns the exact blockers and
// changes nothing.
import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { runContentQa } from "@/lib/atlas/content-qa";
import { setApproval, getPublisherState, savePublisherState } from "@/lib/atlas/publisher-state";
import { DEFAULT_SCHEDULE, normalizeConfig, validateConfig, nextSlot, formatSlot, isDue } from "@/lib/atlas/publish-schedule";
import { STATE } from "@/lib/atlas/content-pipeline-state";
import { advance, getEntry } from "@/lib/atlas/repositories/content-pipeline-repository";
import { listProductionJobs } from "@/lib/atlas/repositories/production-job-repository";

export const runtime = "nodejs";

function scheduleConfig() {
  return normalizeConfig(getPublisherState().schedule || DEFAULT_SCHEDULE);
}

// Slots that are spoken for: anything already scheduled, plus what is already
// public — so a backfilled publish date still counts against the daily limit.
function takenSlots(articles) {
  return articles
    .filter((a) => a.scheduledAt || a.publishedAt)
    .map((a) => a.scheduledAt || a.publishedAt)
    .filter(Boolean);
}

function jobForArticle(articleId) {
  return listProductionJobs().find((j) => j.articleId === articleId) || null;
}

export async function GET() {
  const articles = readJson("articles.json").articles || [];
  const config = scheduleConfig();
  const scheduled = articles
    .filter((a) => a.scheduledAt && a.status !== "published")
    .map((a) => ({
      articleId: a.id, title: a.title, scheduledAt: a.scheduledAt,
      display: formatSlot(a.scheduledAt, config), due: isDue(a.scheduledAt), publishState: a.publishState || "",
    }))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  return NextResponse.json({
    status: "ok",
    config,
    scheduled,
    nextAvailableSlot: formatSlot(nextSlot({ takenAt: takenSlots(articles), config }), config),
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action || "approve-and-schedule";

  // ── settings ────────────────────────────────────────────────────────────
  if (action === "config") {
    const check = validateConfig(body.config || {});
    if (!check.ok) {
      return NextResponse.json({ status: "error", errorCode: "INVALID_SCHEDULE_CONFIG", issues: check.issues }, { status: 400 });
    }
    const config = normalizeConfig({ ...scheduleConfig(), ...(body.config || {}) });
    savePublisherState({ schedule: config });
    return NextResponse.json({ status: "ok", config });
  }

  // ── approve + schedule ──────────────────────────────────────────────────
  const articleId = body.articleId;
  if (!articleId) return NextResponse.json({ status: "error", errorCode: "ARTICLE_ID_REQUIRED" }, { status: 400 });

  const data = readJson("articles.json");
  const article = data.articles.find((a) => a.id === articleId);
  if (!article) return NextResponse.json({ status: "error", errorCode: "ARTICLE_NOT_FOUND" }, { status: 404 });

  // Already public — approving it again could only lead to a duplicate post.
  if (article.status === "published" || article.publishedUrl) {
    return NextResponse.json(
      { status: "duplicate", errorCode: "ALREADY_PUBLISHED", message: "이미 발행된 글입니다.", publishedUrl: article.publishedUrl || "" },
      { status: 409 },
    );
  }

  const qa = runContentQa(article, { articles: data.articles });
  if (!qa.pass) {
    return NextResponse.json(
      {
        status: "qa_failed",
        errorCode: "CONTENT_QA_FAILED",
        message: "자동 검수를 통과하지 못해 승인·예약이 차단되었습니다.",
        blocking: qa.blocking,
        checks: qa.checks,
      },
      { status: 409 },
    );
  }

  const config = scheduleConfig();
  const scheduledAt = body.scheduledAt || nextSlot({ takenAt: takenSlots(data.articles), config });

  // Approval is recorded server-side so /api/publish can verify it without
  // trusting the browser — the existing gate, reused unchanged.
  const approval = setApproval(articleId, true);
  if (!approval.ok) {
    return NextResponse.json({ status: "error", errorCode: approval.errorCode, publishState: approval.publishState }, { status: 409 });
  }

  const fresh = readJson("articles.json");
  const target = fresh.articles.find((a) => a.id === articleId);
  target.scheduledAt = scheduledAt;
  target.scheduleTimezone = config.timezone;
  target.updatedAt = new Date().toISOString();
  writeJson("articles.json", fresh);

  // Pipeline state, if this article came through the pipeline. A legacy article
  // without a job still schedules — it just has no entry to advance.
  const job = jobForArticle(articleId);
  let state = "";
  if (job) {
    advance(job.id, STATE.APPROVED, { note: "사람 승인" });
    const sched = advance(job.id, STATE.SCHEDULED, { note: `예약 ${scheduledAt}`, patch: { scheduledAt } });
    state = sched.ok ? sched.entry.state : getEntry(job.id)?.state || "";
  }

  return NextResponse.json({
    status: "ok",
    articleId,
    state,
    scheduledAt,
    display: formatSlot(scheduledAt, config),
    config,
    needsHumanReview: qa.needsHumanReview,
    message: `승인 완료 · ${formatSlot(scheduledAt, config)} (${config.timezone}) 발행 예약`,
    nextStep: "예약 시각 이후 Publisher에서 발행을 실행하면 Blogger로 전송됩니다. 자동 전송은 하지 않습니다.",
  });
}
