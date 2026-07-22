// ─── Research Provider (ATLAS R3) ────────────────────────────────────────────
// Gathers real, reachable authoritative sources for an article. Readiness is an
// env-only check (no secret echoed). Until a real search/verification provider
// is wired, gather() refuses to invent sources — it returns a BLOCKED result so
// the pipeline stops honestly rather than fabricating URLs.
function present(name) {
  return typeof process !== "undefined" && !!process.env?.[name];
}

export function researchProviderReadiness() {
  const key =
    present("ATLAS_SEARCH_API_KEY") || present("SERPAPI_KEY") || present("BING_SEARCH_KEY");
  return {
    ready: !!key,
    status: key ? "READY" : "NEEDS_CONFIGURATION",
    envNeeded: key ? [] : ["ATLAS_SEARCH_API_KEY (또는 SERPAPI_KEY / BING_SEARCH_KEY)"],
    message: key
      ? "출처 조사 제공자 연결됨"
      : "신뢰할 수 있는 출처를 자동으로 조사·검증할 검색 제공자가 연결되지 않았습니다.",
  };
}

// Returns { ok, blocked, sources }. Never returns fabricated URLs.
export async function gatherSources() {
  const r = researchProviderReadiness();
  if (!r.ready) {
    return { ok: false, blocked: "BLOCKED_RESEARCH_PROVIDER", envNeeded: r.envNeeded, message: r.message, sources: [] };
  }
  // A real implementation would query the provider and verify each URL is
  // reachable before marking it VERIFIED. We ship no mock success path.
  return { ok: false, blocked: "BLOCKED_RESEARCH_PROVIDER", envNeeded: [], message: "실 검색 어댑터 미구현 — Mock 출처를 반환하지 않습니다.", sources: [] };
}
