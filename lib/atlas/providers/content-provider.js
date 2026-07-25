// ─── Content Provider (ATLAS R3.1) ───────────────────────────────────────────
// Generates the English MASTER article from a recommendation + verified sources
// by calling a REAL provider API. Readiness is an env-only check (no secret
// echoed). When no key is configured it returns a BLOCKED result and NEVER a
// fabricated article — that honesty is a hard requirement of this sprint.
//
// Connection-ready today: Anthropic (default, claude-opus-4-8) and OpenAI. The
// moment the user sets one key the WRITING step runs with zero code changes.
// A local Claude Code / ChatGPT subscription is NOT an API key and is not used.

function env(name) {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

// Writing readiness ONLY. This module speaks for the WRITING step; the research
// step has its own gate in research-provider.js. researchReady here is reported
// for display only — it must NEVER be used to lift a BLOCKED_RESEARCH_PROVIDER.
export function contentProviderReadiness() {
  const anthropic = !!env("ANTHROPIC_API_KEY");
  const openai = !!env("OPENAI_API_KEY") || !!env("ATLAS_AI_API_KEY");
  const research = !!env("ATLAS_SEARCH_API_KEY") || !!env("SERPAPI_KEY") || !!env("BING_SEARCH_KEY") || !!env("TAVILY_API_KEY");
  const writingReady = anthropic || openai;

  const missing = [];
  if (!writingReady) missing.push("AI 생성 키 (ANTHROPIC_API_KEY 또는 OPENAI_API_KEY / ATLAS_AI_API_KEY)");

  return {
    // `ready` reflects WRITING readiness only (kept for existing callers).
    ready: writingReady,
    writingReady,
    researchReady: research,
    provider: writingReady ? (anthropic ? "anthropic" : "openai") : null,
    ai: writingReady ? "READY" : "NEEDS_CONFIGURATION",
    research: research ? "READY" : "NEEDS_CONFIGURATION",
    missing,
    status: writingReady ? "READY" : "NEEDS_CONFIGURATION",
    message: writingReady
      ? "AI 원고 생성 제공자 연결됨"
      : "영문 원고를 생성할 AI 제공자가 연결되지 않았습니다.",
  };
}

async function fetchWithTimeout(url, options, ms = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// The single prompt used for both providers. Requests strict JSON matching the
// article schema the Factory/QA already validate. Sources must be the verified
// ones passed in — the model may not invent URLs.
function buildPrompt(recommendation, sources) {
  const sourceList = (sources || [])
    .map((s, i) => `${i + 1}. ${s.title} — ${s.url}`)
    .join("\n");
  return `You are an expert insurance-and-travel editor writing for ATLAS, a site for overseas English-speaking readers.

Write a single original article and return it as a STRICT JSON object (no markdown fence, no prose outside the JSON).

Topic: ${recommendation?.title}
Search intent: ${recommendation?.searchIntent}
ATLAS content axis: ${recommendation?.contentAxis?.id || recommendation?.axis}

Hard rules:
- Natural US English, 1700-2100 words in bodyMarkdown, using "## " H2 headings.
- Cover: how coverage works, reasons commonly covered, situations commonly excluded, difference between standard trip cancellation and Cancel For Any Reason (CFAR) incl. conditions/limits, a pre-purchase checklist.
- State that coverage varies by insurer and policy; never claim all situations are covered; no medical/legal/financial certainty; no invented premiums, payout rates, statistics, or search volumes; no fear marketing; no pressure to buy; do not recommend a specific insurer as best without basis.
- Only use these verified sources (do not invent URLs):
${sourceList || "(none provided)"}
- Affiliate is NOT approved: no affiliate URLs, no product cards, no buy CTA. The closing CTA must be non-sales (encourage reading the policy wording and preparing).

Return JSON with exactly these keys:
{"title","slug","keyword","hookTitle","searchIntent","excerpt","metaDescription","category","tags"(array),"template":"review","outline"(array),"quickAnswer","comparisonCriteria"(>=2 array),"keyTakeaways"(>=3 array),"comparisonHeaders"(>=2 array),"comparisonTable"(>=2 rows, each an array matching header count),"sources"(array of {title,url}),"trust":{"methodology": "..."},"relatedArticles"(array of article ids),"bodyMarkdown","faq"(exactly 5 array of {question,answer}),"koreanReview","visualAssets"(exactly 5, each {key,placement,alt,prompt,width:1600,height:900,fit:"cover",required:true})}`;
}

function parseJson(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

async function callAnthropic(prompt) {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env("ATLAS_ANTHROPIC_MODEL") || "claude-opus-4-8",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, retryable: res.status === 429 || res.status >= 500, reason: err?.error?.message || `Anthropic ${res.status}` };
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return { ok: true, draft: parseJson(text) };
}

async function callOpenAI(prompt) {
  const key = env("OPENAI_API_KEY") || env("ATLAS_AI_API_KEY");
  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env("ATLAS_OPENAI_MODEL") || "gpt-4o",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, retryable: res.status === 429 || res.status >= 500, reason: err?.error?.message || `OpenAI ${res.status}` };
  }
  const data = await res.json();
  return { ok: true, draft: parseJson(data.choices?.[0]?.message?.content) };
}

// Calls the real provider. Returns { ok, draft } or a blocked/failed result.
// One retry on a retryable (429/5xx) error; never an infinite loop.
export async function generateDraftFromRecommendation(recommendation, sources = []) {
  const readiness = contentProviderReadiness();
  if (!readiness.ready) {
    return { ok: false, status: "NEEDS_CONFIGURATION", draft: null, reason: readiness.message, missing: readiness.missing };
  }
  const prompt = buildPrompt(recommendation, sources);
  const call = readiness.provider === "anthropic" ? callAnthropic : callOpenAI;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await call(prompt);
      if (result.ok) return { ok: true, draft: normalizeDraft(result.draft, recommendation, sources) };
      if (!result.retryable) return { ok: false, status: "PROVIDER_ERROR", draft: null, reason: result.reason };
    } catch (e) {
      if (attempt === 1) return { ok: false, status: "PROVIDER_ERROR", draft: null, reason: `요청 실패: ${e.message}` };
    }
  }
  return { ok: false, status: "PROVIDER_ERROR", draft: null, reason: "제공자 응답 실패(재시도 후)" };
}

// Force the affiliate-off shape and fill schema defaults the QA gate expects.
function normalizeDraft(draft, recommendation, sources) {
  return {
    ...draft,
    language: "en",
    keyword: draft.keyword || recommendation?.title,
    hookTitle: draft.hookTitle || draft.title,
    searchIntent: draft.searchIntent || recommendation?.searchIntent || "informational",
    sources: (draft.sources && draft.sources.length ? draft.sources : sources) || [],
    heroImage: null,
    affiliatePlan: {
      providerId: "", providerName: "", network: "", status: "pending", url: "",
      disclosure: "", cta: { topLabel: "", decisionLabel: "" }, productSlots: [],
    },
    qualityChecklist: draft.qualityChecklist || { hasDisclaimer: true },
  };
}
