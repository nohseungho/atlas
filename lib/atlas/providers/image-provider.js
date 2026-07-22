// ─── Image Generation Provider (ATLAS R3) ────────────────────────────────────
// Turns the 5 English image prompts into real image files. Readiness is env-only.
// Without a real generator, generate() returns BLOCKED — it never fabricates
// image URLs and never reports GENERATING_IMAGES as succeeded on empty output.
// (Cloudinary upload is a SEPARATE step handled by cloudinary-provider.)
function present(name) {
  return typeof process !== "undefined" && !!process.env?.[name];
}

export function imageProviderReadiness() {
  const key =
    present("ATLAS_IMAGE_API_KEY") ||
    present("OPENAI_API_KEY") ||
    present("STABILITY_API_KEY") ||
    present("REPLICATE_API_TOKEN");
  return {
    ready: !!key,
    status: key ? "READY" : "NEEDS_CONFIGURATION",
    envNeeded: key ? [] : ["ATLAS_IMAGE_API_KEY (또는 OPENAI_API_KEY / STABILITY_API_KEY / REPLICATE_API_TOKEN)"],
    message: key ? "이미지 생성 제공자 연결됨" : "이미지를 생성할 provider가 연결되지 않았습니다.",
  };
}

// visualAssets: the 5 prompt/slot plan already on the article. Returns
// { ok, blocked, generated:[{key, localPath|buffer}] }. Never fake URLs.
export async function generateImages(visualAssets = []) {
  const r = imageProviderReadiness();
  if (!r.ready) {
    return { ok: false, blocked: "BLOCKED_IMAGE_PROVIDER", envNeeded: r.envNeeded, message: r.message, generated: [] };
  }
  if ((visualAssets || []).length !== 5) {
    return { ok: false, fail: true, message: `이미지 슬롯이 5개가 아닙니다 (${(visualAssets || []).length}개).`, generated: [] };
  }
  return { ok: false, blocked: "BLOCKED_IMAGE_PROVIDER", envNeeded: [], message: "실 이미지 생성 어댑터 미구현 — 가짜 이미지 URL을 반환하지 않습니다.", generated: [] };
}
