// ─── Research Provider (ATLAS Automation Core V1) ────────────────────────────
// Gathers real, reachable authoritative sources. Default path uses OpenAI web
// search (single OPENAI_API_KEY covers research + writing + imaging); Tavily
// (TAVILY_API_KEY) remains supported. Readiness is env-only (no secret echoed).
// With no provider it returns BLOCKED and gatherSources() never fabricates a
// source or disguises model knowledge as a search result.
const MAX_RESULTS = 8;
const MAX_SEARCH_CALLS = 3;
const REQUEST_TIMEOUT_MS = 60000;
const SNIPPET_MAX = 600;

function env(name) {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

export function researchProviderReadiness() {
  const openai = !!env("OPENAI_API_KEY");
  const tavily = !!env("TAVILY_API_KEY");
  const provider = openai ? "openai" : tavily ? "tavily" : null;
  return {
    ready: !!provider,
    researchReady: !!provider,
    provider,
    status: provider ? "READY" : "NEEDS_CONFIGURATION",
    envNeeded: provider ? [] : ["OPENAI_API_KEY (또는 TAVILY_API_KEY)"],
    message: provider
      ? `출처 조사 제공자(${provider}) 연결됨`
      : "신뢰할 수 있는 출처를 자동으로 조사할 검색 제공자(OPENAI_API_KEY)가 연결되지 않았습니다.",
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
  const base = [recommendation?.title, recommendation?.searchIntent].filter(Boolean).join(" ").trim();
  return base || String(recommendation?.keyword || "").trim();
}

// Keep only reachable, unique, URL-bearing sources. No URL → never a verified
// source, and we never invent one.
function normalizeSources(rows, query, provider) {
  const seen = new Set();
  const sources = [];
  const retrievedAt = new Date().toISOString();
  for (const r of rows || []) {
    const url = typeof r?.url === "string" ? r.url.trim() : "";
    if (!/^https?:\/\/\S+$/i.test(url)) continue;
    const dedupeKey = url.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    sources.push({
      query,
      title: String(r.title || url).slice(0, 300),
      url,
      snippet: String(r.snippet || r.content || "").slice(0, SNIPPET_MAX),
      retrievedAt,
      provider,
    });
    if (sources.length >= MAX_RESULTS) break;
  }
  return sources;
}

// ── OpenAI web search (Responses API, web_search tool) ──
async function openaiSearch(apiKey, query) {
  const model = env("ATLAS_RESEARCH_MODEL") || "gpt-4o";
  const res = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      tools: [{ type: "web_search" }],
      input: `Find ${MAX_RESULTS} current, authoritative sources (prefer official / .gov / .org) for: ${query}. Cite the pages.`,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, retryable: res.status === 429 || res.status >= 500, reason: err?.error?.message || `OpenAI ${res.status}` };
  }
  const data = await res.json();
  // Extract url_citation annotations from the response output (defensive).
  const rows = [];
  for (const item of data.output || []) {
    for (const c of item.content || []) {
      for (const ann of c.annotations || []) {
        if (ann.type === "url_citation" && ann.url) rows.push({ url: ann.url, title: ann.title || "", snippet: "" });
      }
    }
  }
  return { ok: true, rows };
}

// ── Tavily search ──
async function tavilySearch(apiKey, query) {
  const res = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: "advanced", max_results: MAX_RESULTS, include_answer: false, include_raw_content: false }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, retryable: res.status === 429 || res.status >= 500, reason: typeof err?.error === "string" ? err.error : `Tavily ${res.status}` };
  }
  const data = await res.json();
  return { ok: true, rows: Array.isArray(data.results) ? data.results : [] };
}

// Returns { ok, provider, query, sources } on success, a BLOCKED result when no
// provider is configured, or PROVIDER_ERROR on failure / empty results. Never
// fabricates URLs and never reports success with an empty source set.
export async function gatherSources(recommendation) {
  const r = researchProviderReadiness();
  if (!r.ready) {
    return { ok: false, blocked: "BLOCKED_RESEARCH_PROVIDER", envNeeded: r.envNeeded, message: r.message, sources: [] };
  }
  const query = buildQuery(recommendation);
  if (!query) {
    return { ok: false, status: "PROVIDER_ERROR", message: "검색할 주제(query)가 없습니다.", provider: r.provider, sources: [] };
  }

  const apiKey = r.provider === "openai" ? env("OPENAI_API_KEY") : env("TAVILY_API_KEY");
  const search = r.provider === "openai" ? openaiSearch : tavilySearch;

  let calls = 0;
  let last = null;
  for (let attempt = 0; attempt < 2 && calls < MAX_SEARCH_CALLS; attempt++) {
    calls++;
    try {
      last = await search(apiKey, query);
      if (last.ok) {
        const sources = normalizeSources(last.rows, query, r.provider);
        if (!sources.length) {
          return { ok: false, status: "PROVIDER_ERROR", message: "유효한 출처를 찾지 못했습니다.", provider: r.provider, sources: [] };
        }
        return { ok: true, provider: r.provider, query, sources };
      }
      if (!last.retryable) break;
    } catch (e) {
      last = { ok: false, reason: `요청 실패: ${e.message}` };
      break;
    }
  }
  return { ok: false, status: "PROVIDER_ERROR", message: last?.reason || "검색 제공자 응답 실패", provider: r.provider, sources: [] };
}
