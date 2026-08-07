// ─── Revenue Pipeline State Machine (ATLAS R2) ───────────────────────────────
// The article automation lifecycle the sprint asks for:
//   recommendation → research → draft → qa → ready_for_review
//                 → user_approved → image_ready → published
//
// This overlays the EXISTING article status system (written / published) without
// migrating or breaking it: a pipeline job carries its own `stage`, and only the
// final publish step maps to article.status = "published".
//
// Honest gating: the research/draft transitions are blocked with a real reason
// when no AI/search provider is configured, instead of fabricating content.

export const STAGES = [
  "recommendation",
  "research",
  "draft",
  "qa",
  "ready_for_review",
  "user_approved",
  "image_ready",
  "published",
];

export function stageIndex(stage) {
  return STAGES.indexOf(stage);
}

export function nextStage(stage) {
  const i = stageIndex(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

// Map a pipeline stage to the existing article.status vocabulary, so nothing
// downstream (Publisher, Factory) needs to learn new states.
export function articleStatusForStage(stage) {
  return stage === "published" ? "published" : "written";
}

// Can this job move from its current stage to the next one?
// context: { article, qa, providerReadiness, humanApproved, imagesReady }
export function canAdvance(job, context = {}) {
  const stage = job?.stage;
  const to = nextStage(stage);
  if (!to) return { ok: false, to: null, reason: "이미 마지막 단계(published)입니다." };

  const { article, qa, providerReadiness, humanApproved, imagesReady } = context;

  switch (stage) {
    case "recommendation":
      // Entering research is always allowed; whether research can COMPLETE is
      // gated at the next hop.
      return { ok: true, to };

    case "research":
    case "draft": {
      // These require a real provider OR a pre-authored MASTER article already
      // linked to the job (the Factory path skips machine generation entirely).
      if (job.linkedArticleId && article) return { ok: true, to, note: "Factory MASTER 원고 연결됨 — 기계 생성 건너뜀" };
      if (providerReadiness?.ready) return { ok: true, to };
      return {
        ok: false,
        to,
        reason: providerReadiness?.message || "AI/검색 제공자 미연동으로 자동 원고 생성이 차단되었습니다.",
        status: "NEEDS_CONFIGURATION",
      };
    }

    case "qa": {
      if (!article) return { ok: false, to, reason: "QA할 원고가 연결되지 않았습니다." };
      if (!qa) return { ok: false, to, reason: "QA 결과가 없습니다. 먼저 QA를 실행하세요." };
      if (!qa.pass) return { ok: false, to, reason: `QA 실패 ${qa.failCount}건 — 통과 후 진행할 수 있습니다.` };
      return { ok: true, to };
    }

    case "ready_for_review":
      // The human approval gate. No auto-advance.
      if (humanApproved === true) return { ok: true, to };
      return { ok: false, to, reason: "사람의 최종 승인이 필요합니다.", status: "AWAITING_HUMAN" };

    case "user_approved":
      // Image readiness. Real Cloudinary upload is a separate manual step; here
      // we only require the validated 5-image plan.
      if (imagesReady === true) return { ok: true, to };
      return { ok: false, to, reason: "이미지 계획(5장)이 준비되어야 합니다.", status: "AWAITING_IMAGES" };

    case "image_ready":
      // Publishing is a human action; the actual Blogger POST is NOT performed
      // by this code path.
      if (humanApproved === true) return { ok: true, to, note: "실제 Blogger 발행은 Publisher에서 수동 실행" };
      return { ok: false, to, reason: "발행은 사람 승인 후 Publisher에서 수동으로 실행합니다.", status: "AWAITING_HUMAN" };

    default:
      return { ok: false, to, reason: `알 수 없는 단계: ${stage}` };
  }
}

// A Korean, user-facing description of where a job stands and what happens next.
export function describeStage(stage) {
  const map = {
    recommendation: { label: "추천 선택됨", next: "공식 자료 조사" },
    research: { label: "자료 조사", next: "원고 초안 생성" },
    draft: { label: "원고 초안", next: "자동 QA" },
    qa: { label: "자동 QA", next: "사람 검수 대기" },
    ready_for_review: { label: "검수 대기", next: "사람 최종 승인" },
    user_approved: { label: "승인됨", next: "이미지 준비" },
    image_ready: { label: "이미지 준비 완료", next: "발행(수동)" },
    published: { label: "발행됨", next: "쇼핑 쇼츠 초안 생성" },
  };
  return map[stage] || { label: stage, next: "-" };
}
