// ─── Research Provider (ATLAS R3.2) ──────────────────────────────────────────
// Gathers real, reachable authoritative sources via a REAL provider (Tavily,
// env TAVILY_API_KEY). Readiness is an env-only check (no secret echoed). With
// no key it returns NEEDS_CONFIGURATION and gatherSources() returns a BLOCKED
// result — never a fabricated source, never AI knowledge disguised as search.
//
// Legacy env names (ATLAS_SEARCH_API_KEY / SERPAPI_KEY / BING_SEARCH_KEY) are
// intentionally NOT honored here: no adapter exists for them, so they must
// never flip readiness to true. Research readiness is fully independent from
// the writing provider — the two gates are never mixed.

const MAX_RESULTS = 8; // hard cap on sources handed to the writer
const MAX_SEARCH_CALLS = 3; // hard cap on provider calls per job (defensive)
const REQUEST_TIMEOUT_MS = 30000;
const SNIPPET_MAX = 600; // never reproduce full article text

function env(name) {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

export function researchProviderReadiness() {
  const tavily = !!env("TAVILY_API_KEY");
  return {
    ready: tavily,
    researchReady: tavily,
    provider: tavily ? "tavily" : null,
    status: tavily ? "READY" : "NEEDS_CONFIGURATION",
    envNeeded: tavily ? [] : ["TAVILY_API_KEY"],
    message: tavily
      ? "출처 조사 제공자(Tavily) 연결됨"
      : "신뢰할 수 있는 출처를 자동으로 조사·검증할 검색 제공자(TAVILY_API_KEY)가 연결되지 않았습니다.",
  };
}

async function fetchWithTimeout(url, options, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildQuery(recommendation) {
  const base = [recommendation?.title, recommendation?.searchIntent]
    .filter(Boolean)
    .join(" ")
    .trim();
  return base || String(recommendation?.keyword || "").trim();
}

// Keep only reachable, unique, URL-bearing sources. A result without a real
// http(s) URL is never treated as a verified source — and we never invent one.
function normalizeSources(results, query, provider) {
  const seen = new Set();
  const sources = [];
  const retrievedAt = new Date().toISOString();
  for (const r of results || []) {
    const url = typeof r?.url === "string" ? r.url.trim() : "";
    if (!/^https?:\/\/\S+$/i.test(url)) continue; // URL 없는 결과 제외, 가짜 URL 생성 없음
    const dedupeKey = url.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
    if (seen.has(dedupeKey)) continue; // 중복 제거
    seen.add(dedupeKey);
    sources.push({
      query,
      title: String(r.title || url).slice(0, 300),
      url,
      snippet: String(r.content || r.snippet || "").slice(0, SNIPPET_MAX), // 원문 전체 복제 금지
      retrievedAt,
      provider,
    });
    if (sources.length >= MAX_RESULTS) break; // 결과 개수 상한
  }
  return sources;
}

// One provider call. Returns { ok, results } or { ok:false, retryable, reason }.
// No api key and no raw response body are ever logged.
async function tavilySearch(apiKey, query) {
  const res = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: MAX_RESULTS,
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return {
      ok: false,
      retryable: res.status === 429 || res.status >= 500,
      reason: typeof err?.error === "string" ? err.error : `Tavily ${res.status}`,
    };
  }
  const data = await res.json();
  return { ok: true, results: Array.isArray(data.results) ? data.results : [] };
}

// Returns { ok, provider, query, sources } on success, a BLOCKED result when no
// key is configured, or a PROVIDER_ERROR result on failure. Never fabricates
// URLs and never reports success with an empty/insufficient source set.
export async function gatherSources(recommendation) {
  const r = researchProviderReadiness();
  if (!r.ready) {
    return { ok: false, blocked: "BLOCKED_RESEARCH_PROVIDER", envNeeded: r.envNeeded, message: r.message, sources: [] };
  }

  const apiKey = env("TAVILY_API_KEY");
  const query = buildQuery(recommendation);
  if (!query) {
    return { ok: false, status: "PROVIDER_ERROR", message: "검색할 주제(query)가 없습니다.", provider: r.provider, sources: [] };
  }

  let calls = 0;
  let last = null;
  // Retry ONLY on 429/5xx, at most once. Other errors do not loop.
  for (let attempt = 0; attempt < 2 && calls < MAX_SEARCH_CALLS; attempt++) {
    calls++;
    try {
      last = await tavilySearch(apiKey, query);
      if (last.ok) {
        const sources = normalizeSources(last.results, query, r.provider);
        if (!sources.length) {
          return { ok: false, status: "PROVIDER_ERROR", message: "유효한 출처를 찾지 못했습니다.", provider: r.provider, sources: [] };
        }
        return { ok: true, provider: r.provider, query, sources };
      }
      if (!last.retryable) break;
    } catch (e) {
      last = { ok: false, reason: `요청 실패: ${e.message}` };
      break; // network/timeout errors are not retried here
    }
  }

  return { ok: false, status: "PROVIDER_ERROR", message: last?.reason || "검색 제공자 응답 실패", provider: r.provider, sources: [] };
}
