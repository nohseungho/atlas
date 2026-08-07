// ─── Image Generation Provider (ATLAS Automation Core V1) ────────────────────
// Real OpenAI image adapter. Turns each of the article's 5 English image prompts
// into a real image via the OpenAI Images API (native fetch, no new npm package).
// Readiness is env-only (no secret echoed). Without OPENAI_API_KEY it returns a
// BLOCKED result and NEVER a fabricated image — honesty is a hard requirement.
function env(name) {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

export function imageProviderReadiness() {
  const key = !!env("OPENAI_API_KEY") || !!env("ATLAS_IMAGE_API_KEY");
  return {
    ready: key,
    provider: key ? "openai" : null,
    status: key ? "READY" : "NEEDS_CONFIGURATION",
    envNeeded: key ? [] : ["OPENAI_API_KEY"],
    message: key
      ? "이미지 생성 제공자(OpenAI) 연결됨"
      : "이미지를 생성할 provider(OPENAI_API_KEY)가 연결되지 않았습니다.",
  };
}

const IMAGE_ENDPOINT = "https://api.openai.com/v1/images/generations";
const REQUEST_TIMEOUT_MS = 120000;
// gpt-image-1 landscape size closest to 16:9; Cloudinary re-crops to 1600x900.
const GEN_SIZE = "1536x1024";

async function fetchWithTimeout(url, options, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function generateOne(prompt, apiKey, model) {
  const res = await fetchWithTimeout(IMAGE_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, n: 1, size: GEN_SIZE }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return {
      ok: false,
      retryable: res.status === 429 || res.status >= 500,
      reason: err?.error?.message || `OpenAI image ${res.status}`,
    };
  }
  const data = await res.json();
  const item = (data.data || [])[0] || {};
  if (item.b64_json) return { ok: true, b64: item.b64_json };
  if (item.url) return { ok: true, url: item.url };
  return { ok: false, retryable: false, reason: "OpenAI image response had no b64/url" };
}

// visualAssets: the article's fixed 5-slot plan (each with a role `key` and a
// `prompt`). Returns { ok, generated:[{key, b64|url}] } or a blocked/failed
// result. Never fabricates an image; one retry only on a 429/5xx.
export async function generateImages(visualAssets = []) {
  const r = imageProviderReadiness();
  if (!r.ready) {
    return { ok: false, blocked: "BLOCKED_IMAGE_PROVIDER", envNeeded: r.envNeeded, message: r.message, generated: [] };
  }
  if ((visualAssets || []).length !== 5) {
    return { ok: false, fail: true, message: `이미지 슬롯이 5개가 아닙니다 (${(visualAssets || []).length}개).`, generated: [] };
  }

  const apiKey = env("OPENAI_API_KEY") || env("ATLAS_IMAGE_API_KEY");
  const model = env("ATLAS_IMAGE_MODEL") || "gpt-image-1";
  const generated = [];
  for (const asset of visualAssets) {
    const prompt = String(asset.prompt || "").trim();
    if (!prompt) return { ok: false, fail: true, message: `이미지 프롬프트가 비어 있습니다 (${asset.key}).`, generated };
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        last = await generateOne(prompt, apiKey, model);
        if (last.ok || !last.retryable) break;
      } catch (e) {
        last = { ok: false, reason: `요청 실패: ${e.message}` };
        break;
      }
    }
    if (!last?.ok) {
      return { ok: false, fail: true, message: `이미지 생성 실패 (${asset.key}): ${last?.reason || "알 수 없음"}`, generated };
    }
    generated.push({ key: asset.key, b64: last.b64, url: last.url });
  }
  return { ok: true, generated };
}
