// ─── Content Provider Readiness (ATLAS R2) ───────────────────────────────────
// The sprint requires an automated draft pipeline, but ALSO forbids fabricating
// generated content when no real AI/search provider is configured. This module
// is the single honest gate: it reports readiness from env vars only, and its
// generate() refuses to invent body text when the provider is not wired.
//
// No secrets live here. Only presence-of-env checks (server-side). Values are
// never echoed back to the client, logs, or git.

function present(name) {
  return typeof process !== "undefined" && !!process.env?.[name];
}

// Support a couple of common env names without committing to a vendor.
export function contentProviderReadiness() {
  const aiKey =
    present("OPENAI_API_KEY") ||
    present("ANTHROPIC_API_KEY") ||
    present("ATLAS_AI_API_KEY");
  const searchKey =
    present("ATLAS_SEARCH_API_KEY") ||
    present("SERPAPI_KEY") ||
    present("BING_SEARCH_KEY");

  const missing = [];
  if (!aiKey) missing.push("AI 생성 키 (OPENAI_API_KEY / ANTHROPIC_API_KEY / ATLAS_AI_API_KEY)");
  if (!searchKey) missing.push("공식 자료 조사용 검색 키 (ATLAS_SEARCH_API_KEY 등)");

  const ready = aiKey && searchKey;
  return {
    ready,
    ai: aiKey ? "READY" : "NEEDS_CONFIGURATION",
    research: searchKey ? "READY" : "NEEDS_CONFIGURATION",
    missing,
    status: ready ? "READY" : "NEEDS_CONFIGURATION",
    message: ready
      ? "AI·검색 제공자 연동됨"
      : "AI/검색 제공자 미연동 — 자동 원고 본문 생성은 차단됩니다. 현재는 사람이 작성한 MASTER(Factory)만 원고로 인정합니다.",
  };
}

// The generation adapter. Until a real provider is wired this ALWAYS returns a
// blocked result and never returns invented body text — that is the point.
export async function generateDraftFromRecommendation() {
  const readiness = contentProviderReadiness();
  if (!readiness.ready) {
    return {
      ok: false,
      status: "NEEDS_CONFIGURATION",
      draft: null,
      reason: readiness.message,
      missing: readiness.missing,
    };
  }
  // A real implementation would call the AI + research providers here. We do not
  // ship a mock that pretends to succeed, so this path is intentionally unbuilt.
  return {
    ok: false,
    status: "NOT_IMPLEMENTED",
    draft: null,
    reason:
      "제공자 키는 감지되었으나 실제 생성 어댑터는 이 스프린트에서 구현하지 않았습니다. Mock 성공을 반환하지 않습니다.",
  };
}
