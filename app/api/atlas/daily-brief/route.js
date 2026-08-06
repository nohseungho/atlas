// "오늘의 글 준비" — one call does keyword selection, duplicate checking, brief
// creation, internal-link selection, and prompt generation (§3).
//
// No generation API is called and none is faked: the response is a prompt the
// user runs in ChatGPT Plus, and the reply comes back through the existing
// /api/atlas/chatgpt-package importer. Idempotent — clicking twice returns the
// same job and the same prompt instead of consuming a second keyword.
import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { prepareDailyBrief, buildContentBrief, buildPromptText } from "@/lib/atlas/daily-brief";
import { STATE, progressOf } from "@/lib/atlas/content-pipeline-state";
import { createEntry } from "@/lib/atlas/content-pipeline-state";
import { createProductionJob, listProductionJobs, updateProductionJob } from "@/lib/atlas/repositories/production-job-repository";
import { advanceThrough, getEntry, listEntries, saveEntry, usedKeywordIds } from "@/lib/atlas/repositories/content-pipeline-repository";

export const runtime = "nodejs";

const DEFAULT_BLOG = "blog_001";

// An entry that is still on its way to publication owns its keyword.
const OPEN_STATES = new Set([STATE.SELECTED, STATE.BRIEF_READY, STATE.DRAFT_READY, STATE.AWAITING_IMAGE, STATE.QA_PASSED, STATE.APPROVED, STATE.SCHEDULED]);

// getEntry (not j.contentEntry) so pre-pipeline jobs are judged by their
// adopted state too, instead of looking finished because they carry no entry.
function openJobFor(blogId) {
  return (
    listProductionJobs().find((j) => (j.blogId || DEFAULT_BLOG) === blogId && OPEN_STATES.has(getEntry(j.id)?.state)) || null
  );
}

// GET — the pipeline board: every entry with its state and progress.
export async function GET() {
  const entries = listEntries();
  return NextResponse.json({
    status: "ok",
    entries,
    counts: entries.reduce((acc, e) => {
      acc[e.state] = (acc[e.state] || 0) + 1;
      return acc;
    }, {}),
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const blogId = body.blogId || DEFAULT_BLOG;

  const articles = readJson("articles.json").articles || [];
  const keywords = readJson("keywords.json").keywords || [];

  // Idempotency: an unfinished article already in flight is returned as-is.
  // Preparing a second one before the first ships would consume two keywords
  // for one day's output.
  if (!body.force) {
    const open = openJobFor(blogId);
    if (open) {
      const entry = getEntry(open.id);
      const keyword = keywords.find((k) => k.id === entry.keywordId) || null;
      const brief = entry.brief || (keyword ? buildContentBrief({ keyword, articles, blogId }) : null);
      return NextResponse.json({
        status: "in_progress",
        message: `이미 준비된 글이 있습니다 (${entry.state}). 완료하거나 취소한 뒤 새로 준비하세요.`,
        jobId: open.id,
        state: entry.state,
        progress: progressOf(entry),
        keyword: keyword ? { id: keyword.id, keyword: keyword.keyword } : null,
        brief,
        promptText: brief ? buildPromptText({ brief, jobId: open.id, existingTitles: articles.filter((a) => a.status === "published").map((a) => a.title) }) : "",
      });
    }
  }

  const prepared = prepareDailyBrief({ keywords, articles, usedKeywordIds: usedKeywordIds(), blogId });
  if (!prepared.ok) {
    return NextResponse.json(
      { status: "blocked", errorCode: "NO_ELIGIBLE_KEYWORD", message: prepared.reason, skipped: prepared.skipped },
      { status: 200 },
    );
  }

  // Reuse the existing production job structure — no parallel job store.
  const { job: created } = createProductionJob({
    recommendation: { title: prepared.keyword.keyword, searchIntent: prepared.keyword.intent || "informational" },
  });
  const job = updateProductionJob(created.id, (j) => {
    j.blogId = blogId;
    j.moneyHunterId = prepared.keyword.id;
    j.mode = "CHATGPT_HANDOFF";
    j.status = "WAITING_FOR_CHATGPT_PACKAGE";
    j.step = "CHATGPT_REQUEST_READY";
  });

  // Seed the entry at IDEA explicitly. Without this the legacy-adoption path
  // reads the job's own WAITING_FOR_CHATGPT_PACKAGE status and adopts the brand
  // new job at BRIEF_READY, which then refuses the SELECTED transition.
  // Adoption is only ever for jobs that predate the pipeline.
  if (!job.contentEntry) {
    saveEntry(job.id, createEntry({
      id: `cp_${job.id}`,
      blogId,
      keywordId: prepared.keyword.id,
      keyword: prepared.keyword.keyword,
    }));
  }

  const moved = advanceThrough(job.id, [STATE.SELECTED, STATE.BRIEF_READY], {
    note: `오늘의 글 준비: ${prepared.keyword.keyword}`,
    patch: { keywordId: prepared.keyword.id, keyword: prepared.keyword.keyword, brief: prepared.brief, jobId: job.id },
  });
  if (!moved.ok) {
    return NextResponse.json({ status: "error", errorCode: "STATE_TRANSITION_REFUSED", message: moved.reason }, { status: 409 });
  }

  // The prompt carries the real jobId so the returned package binds to this job.
  const promptText = buildPromptText({
    brief: prepared.brief,
    jobId: job.id,
    existingTitles: articles.filter((a) => a.status === "published").map((a) => a.title),
  });

  return NextResponse.json({
    status: "ok",
    jobId: job.id,
    state: moved.entry.state,
    progress: progressOf(moved.entry),
    keyword: { id: prepared.keyword.id, keyword: prepared.keyword.keyword, category: prepared.keyword.category || "" },
    brief: prepared.brief,
    promptText,
    internalLinkCount: prepared.internalLinkCount,
    eligibleCount: prepared.eligibleCount,
    nextStep: "프롬프트를 복사해 ChatGPT에서 실행한 뒤, 돌아온 JSON을 '결과 붙여넣기'에 그대로 붙여넣으세요.",
  });
}
