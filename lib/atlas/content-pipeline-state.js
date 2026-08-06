// ─── ATLAS Content Pipeline State (V1) ───────────────────────────────────────
// One state machine for the whole content lifecycle, replacing the three
// disconnected status vocabularies ATLAS used before (keywords.status,
// productionJob.status, article.publishState). Those keep working as-is; this
// module is the single authority on "where is this piece of content now".
//
// Pure — no IO, no @/ imports — so every transition rule is unit-testable.
// Persistence lives in content-pipeline-repository.js.
//
//   IDEA → SELECTED → BRIEF_READY → DRAFT_READY → QA_PASSED
//        → APPROVED → SCHEDULED → PUBLISHED
//
// AWAITING_IMAGE is a hold beside DRAFT_READY (§7: never invent an image URL).
// FAILED records the stage it failed at so a retry resumes there instead of
// restarting the pipeline. PUBLISHED is terminal — that is what makes a
// duplicate publish structurally impossible, not just guarded.

export const STATE = {
  IDEA: "IDEA",
  SELECTED: "SELECTED",
  BRIEF_READY: "BRIEF_READY",
  DRAFT_READY: "DRAFT_READY",
  AWAITING_IMAGE: "AWAITING_IMAGE",
  QA_PASSED: "QA_PASSED",
  APPROVED: "APPROVED",
  SCHEDULED: "SCHEDULED",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
};

// The happy path, in order. Used for progress display and for resolving which
// stage a FAILED job should resume at.
export const MAIN_SEQUENCE = [
  STATE.IDEA,
  STATE.SELECTED,
  STATE.BRIEF_READY,
  STATE.DRAFT_READY,
  STATE.QA_PASSED,
  STATE.APPROVED,
  STATE.SCHEDULED,
  STATE.PUBLISHED,
];

export const STATE_LABEL = {
  IDEA: "아이디어",
  SELECTED: "키워드 선택됨",
  BRIEF_READY: "브리프 생성됨",
  DRAFT_READY: "초안 등록됨",
  AWAITING_IMAGE: "이미지 대기",
  QA_PASSED: "검수 통과",
  APPROVED: "승인됨",
  SCHEDULED: "예약됨",
  PUBLISHED: "발행 완료",
  FAILED: "실패",
};

// PUBLISHED has no outgoing edge on purpose: once a post is public, ATLAS can
// never walk it back into a state that would publish it a second time.
const ALLOWED = {
  IDEA: [STATE.SELECTED, STATE.FAILED],
  SELECTED: [STATE.BRIEF_READY, STATE.IDEA, STATE.FAILED],
  BRIEF_READY: [STATE.DRAFT_READY, STATE.AWAITING_IMAGE, STATE.FAILED],
  DRAFT_READY: [STATE.QA_PASSED, STATE.AWAITING_IMAGE, STATE.FAILED],
  AWAITING_IMAGE: [STATE.DRAFT_READY, STATE.QA_PASSED, STATE.FAILED],
  QA_PASSED: [STATE.APPROVED, STATE.DRAFT_READY, STATE.FAILED],
  APPROVED: [STATE.SCHEDULED, STATE.QA_PASSED, STATE.FAILED],
  SCHEDULED: [STATE.PUBLISHED, STATE.APPROVED, STATE.FAILED],
  PUBLISHED: [],
  FAILED: [STATE.SELECTED, STATE.BRIEF_READY, STATE.DRAFT_READY, STATE.AWAITING_IMAGE, STATE.QA_PASSED, STATE.APPROVED, STATE.SCHEDULED],
};

export const TERMINAL_STATES = new Set([STATE.PUBLISHED]);

export function isKnownState(state) {
  return Object.prototype.hasOwnProperty.call(ALLOWED, String(state || ""));
}

export function isTerminal(state) {
  return TERMINAL_STATES.has(String(state || ""));
}

export function allowedNext(state) {
  return ALLOWED[String(state || "")] || [];
}

export function canTransition(from, to) {
  if (!isKnownState(from)) return { ok: false, reason: `알 수 없는 현재 상태: ${from}` };
  if (!isKnownState(to)) return { ok: false, reason: `알 수 없는 목표 상태: ${to}` };
  if (from === to) return { ok: false, reason: `이미 ${from} 상태입니다.` };
  if (isTerminal(from)) return { ok: false, reason: `${from}은(는) 최종 상태라 전이할 수 없습니다. (중복 발행 방지)` };
  if (!ALLOWED[from].includes(to)) return { ok: false, reason: `${from} → ${to} 전이는 허용되지 않습니다.` };
  return { ok: true };
}

// Fresh pipeline entry for one keyword. `history` is append-only so the Studio
// can always show why a piece of content is where it is.
export function createEntry({ id, blogId = "blog_001", keywordId = "", keyword = "", now = new Date().toISOString() }) {
  return {
    id,
    blogId,
    keywordId,
    keyword,
    state: STATE.IDEA,
    failedFrom: "",
    failure: null,
    articleId: "",
    jobId: "",
    brief: null,
    scheduledAt: "",
    publishedUrl: "",
    history: [{ state: STATE.IDEA, at: now, note: "파이프라인 등록" }],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Applies a transition to an entry and returns a NEW entry (never mutates).
 * Returns { ok:false, reason } when the transition is not allowed — the caller
 * must not persist anything in that case.
 *
 * Moving to FAILED records `failedFrom`, so `resumeStateOf()` can send a retry
 * back to the exact stage that broke instead of to the top of the pipeline.
 */
export function transition(entry, to, { note = "", reason = "", patch = {}, now = new Date().toISOString() } = {}) {
  const from = entry?.state;
  const check = canTransition(from, to);
  if (!check.ok) return { ok: false, reason: check.reason, entry };

  if (to === STATE.FAILED && !reason) {
    return { ok: false, reason: "FAILED 전이에는 실패 원인이 반드시 필요합니다.", entry };
  }

  const next = {
    ...entry,
    ...patch,
    state: to,
    updatedAt: now,
    history: [...(entry.history || []), { state: to, at: now, note: note || reason || "" }],
  };

  if (to === STATE.FAILED) {
    next.failedFrom = from;
    next.failure = { from, reason, at: now };
  } else {
    next.failedFrom = "";
    next.failure = null;
  }

  return { ok: true, entry: next };
}

// Where a FAILED entry should be retried. A failure at DRAFT_READY resumes at
// DRAFT_READY — never at IDEA, which would re-consume the keyword.
export function resumeStateOf(entry) {
  if (entry?.state !== STATE.FAILED) return entry?.state || STATE.IDEA;
  const from = entry.failedFrom;
  return isKnownState(from) && from !== STATE.FAILED ? from : STATE.SELECTED;
}

// 0..100 along the main path. Off-path states (AWAITING_IMAGE / FAILED) report
// the progress of the stage they are parked beside.
export function progressOf(entry) {
  const state = entry?.state;
  const anchor =
    state === STATE.AWAITING_IMAGE ? STATE.DRAFT_READY : state === STATE.FAILED ? resumeStateOf(entry) : state;
  const idx = MAIN_SEQUENCE.indexOf(anchor);
  if (idx < 0) return { index: 0, total: MAIN_SEQUENCE.length, percent: 0 };
  return {
    index: idx,
    total: MAIN_SEQUENCE.length - 1,
    percent: Math.round((idx / (MAIN_SEQUENCE.length - 1)) * 100),
  };
}

// Guard for "can this entry still produce a NEW public post?". Used to stop a
// second pipeline entry being opened for a keyword that already went live.
export function isLive(entry) {
  return entry?.state === STATE.PUBLISHED || Boolean(entry?.publishedUrl);
}

/**
 * May a corrected package be re-imported onto an EXISTING article?
 *
 * Only a draft that failed content QA qualifies: the job is parked at
 * REVIEW_REQUIRED and the entry never advanced past DRAFT_READY. Everything
 * from QA_PASSED onward keeps the idempotent "already registered" return, so a
 * resend can never rewrite an article a human already approved, scheduled, or
 * published.
 */
export function isRetryEligible({ articleId = "", jobStatus = "", state = "" } = {}) {
  return Boolean(articleId) && jobStatus === "REVIEW_REQUIRED" && state === STATE.DRAFT_READY;
}
