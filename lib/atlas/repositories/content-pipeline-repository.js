// Persistence for the content pipeline state. Deliberately NOT a new data file:
// the entry rides on the existing production job in production-jobs.json, so a
// refresh or a server restart restores it with everything else the job carries.
//
// Every write goes through `advance()`, which refuses an illegal transition
// before touching disk — an invalid state can never be persisted, which is what
// makes "PUBLISHED is terminal" an actual duplicate-publish guard.
import { readJson } from "@/lib/data-store";
import { createEntry, transition, STATE, resumeStateOf, progressOf } from "@/lib/atlas/content-pipeline-state";
import { getProductionJob, listProductionJobs, updateProductionJob } from "@/lib/atlas/repositories/production-job-repository";

// Jobs created before this pipeline existed carry no entry. Rather than
// guessing their history, they are adopted at the stage their existing fields
// prove they reached — never further.
function deriveLegacyState(job) {
  if (job?.articleId) {
    const article = (readJson("articles.json").articles || []).find((a) => a.id === job.articleId);
    if (article?.publishedUrl) return STATE.PUBLISHED;
    if (article) return STATE.DRAFT_READY;
  }
  if (job?.status === "WAITING_FOR_CHATGPT_PACKAGE") return STATE.BRIEF_READY;
  if (job?.moneyHunterId) return STATE.SELECTED;
  return STATE.IDEA;
}

export function getEntry(jobId) {
  const job = getProductionJob(jobId);
  if (!job) return null;
  if (job.contentEntry) return job.contentEntry;

  const now = new Date().toISOString();
  const legacy = deriveLegacyState(job);
  return {
    ...createEntry({
      id: `cp_${job.id}`,
      blogId: job.blogId || "blog_001",
      keywordId: job.moneyHunterId || "",
      keyword: job.topic || "",
      now: job.createdAt || now,
    }),
    state: legacy,
    articleId: job.articleId || "",
    jobId: job.id,
    adopted: legacy !== STATE.IDEA ? "기존 job에서 승계됨" : "",
  };
}

// Writes the entry as-is. Used only to seed a job with its first entry.
export function saveEntry(jobId, entry) {
  updateProductionJob(jobId, (j) => {
    j.contentEntry = entry;
  });
  return entry;
}

/**
 * Guarded transition + persist. Returns { ok:false, reason } and writes nothing
 * when the transition is illegal.
 */
export function advance(jobId, to, { note = "", reason = "", patch = {} } = {}) {
  const current = getEntry(jobId);
  if (!current) return { ok: false, reason: `job을 찾을 수 없습니다: ${jobId}` };

  const result = transition(current, to, { note, reason, patch });
  if (!result.ok) return { ok: false, reason: result.reason, entry: current };

  saveEntry(jobId, result.entry);
  return { ok: true, entry: result.entry };
}

// Walks several stages in one call, stopping at the first illegal step. Used by
// "오늘의 글 준비", which legitimately moves IDEA → SELECTED → BRIEF_READY as a
// single user action.
export function advanceThrough(jobId, states, { patch = {}, note = "" } = {}) {
  let last = null;
  for (const to of states) {
    const step = advance(jobId, to, { note, patch: to === states[states.length - 1] ? patch : {} });
    if (!step.ok) {
      // Already at or past this stage (a repeat click) is not an error.
      if (getEntry(jobId)?.state === to) { last = { ok: true, entry: getEntry(jobId) }; continue; }
      return step;
    }
    last = step;
  }
  return last || { ok: false, reason: "전이할 상태가 없습니다." };
}

export function listEntries() {
  return listProductionJobs()
    .map((j) => {
      const entry = getEntry(j.id);
      return entry ? { ...entry, jobId: j.id, progress: progressOf(entry), resumeState: resumeStateOf(entry) } : null;
    })
    .filter(Boolean);
}

// Every keyword id the pipeline has already consumed — the "미사용 키워드" filter
// for 오늘의 글 준비. A FAILED entry releases its keyword so a dead job does not
// permanently burn a topic.
export function usedKeywordIds() {
  const ids = new Set();
  for (const job of listProductionJobs()) {
    const entry = job.contentEntry;
    if (entry?.state === STATE.FAILED) continue;
    const id = entry?.keywordId || job.moneyHunterId;
    if (id) ids.add(id);
  }
  return [...ids];
}
