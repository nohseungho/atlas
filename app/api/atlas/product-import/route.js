// ─── Product Import · 상품 URL 1개 → 확인된 값만 담은 초안 ─────────────────
// 공개 상품 페이지를 서버에서 한 번 읽어 JSON-LD Product/Offer와 Open Graph에서
// 확인 가능한 값만 뽑는다. 브라우저 자동화도, 차단 우회도 하지 않는다.
// 차단된 사이트는 차단된 그대로 보고한다. 비밀키는 이 경로에 존재하지 않는다.
//
// POST { url }                      → 상품 초안 + REVIEW 목록 + 이미지 후보
// POST { action:"image", url }      → 사용자가 확인한 이미지 1장만 dataURL로 회수
import { NextResponse } from "next/server";
import { assertFetchableUrl, canonicalizeProductUrl } from "@/lib/atlas/product-import/url-guard";
import { extractProductDraft, modelKey } from "@/lib/atlas/product-import/product-extract";

export const runtime = "nodejs";

const TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const HTML_TYPES = ["text/html", "application/xhtml+xml"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// 상품 페이지는 사람이 보는 페이지다. 정체를 숨기지 않고 ATLAS로 밝힌다.
const USER_AGENT = "Mozilla/5.0 (compatible; ATLAS-ProductImport/1.0; +https://github.com/atlas)";

function bad(message, { code = "IMPORT_FAILED", status = 400, extra = {} } = {}) {
  return NextResponse.json({ status: "error", errorCode: code, message, ...extra }, { status });
}

/**
 * 리다이렉트를 손으로 따라가며 매 홉마다 SSRF 관문을 다시 통과시킨다.
 * 공개 도메인이 내부망으로 튕기는 경로를 막는 유일한 방법이다.
 */
async function safeFetch(startUrl, { accept }) {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const checked = assertFetchableUrl(current);
    if (!checked.ok) return { ok: false, error: checked.error, code: "URL_BLOCKED" };

    let res;
    try {
      res = await fetch(checked.url.toString(), {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "en-US,en;q=0.8,ko;q=0.6" },
      });
    } catch (err) {
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      return {
        ok: false,
        code: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        error: timedOut ? `${TIMEOUT_MS / 1000}초 안에 응답이 없었습니다.` : `페이지를 불러오지 못했습니다 (${String(err?.message || err)}).`,
      };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, code: "BAD_REDIRECT", error: "리다이렉트 주소가 없습니다." };
      current = new URL(location, checked.url).toString();
      continue;
    }
    if (res.status === 403 || res.status === 401 || res.status === 429) {
      return {
        ok: false,
        code: "BLOCKED_BY_SITE",
        error: `판매처가 자동 조회를 거부했습니다 (HTTP ${res.status}). 우회하지 않습니다 — JSON 붙여넣기나 수동 등록을 사용하세요.`,
      };
    }
    if (!res.ok) return { ok: false, code: "HTTP_ERROR", error: `상품 페이지 응답이 정상이 아닙니다 (HTTP ${res.status}).` };
    return { ok: true, res, finalUrl: checked.url.toString() };
  }
  return { ok: false, code: "TOO_MANY_REDIRECTS", error: "리다이렉트가 너무 많습니다." };
}

/** 응답 본문을 상한까지만 읽는다. Content-Length를 믿지 않고 실제로 센다. */
async function readCapped(res, maxBytes) {
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared && declared > maxBytes) return { ok: false, error: `응답이 너무 큽니다 (${declared} bytes).` };

  const reader = res.body?.getReader();
  if (!reader) return { ok: false, error: "응답 본문을 읽지 못했습니다." };
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, error: `응답이 상한(${Math.round(maxBytes / 1024 / 1024)}MB)을 넘어 중단했습니다.` };
    }
    chunks.push(value);
  }
  return { ok: true, bytes: Buffer.concat(chunks.map((c) => Buffer.from(c))) };
}

function contentTypeOf(res) {
  return String(res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
}

async function importImage(url) {
  const fetched = await safeFetch(url, { accept: "image/jpeg,image/png,image/webp,image/*;q=0.8" });
  if (!fetched.ok) return bad(fetched.error, { code: fetched.code, status: 422 });

  const type = contentTypeOf(fetched.res);
  if (!IMAGE_TYPES.includes(type)) {
    return bad(`이미지 형식이 아닙니다 (${type || "알 수 없음"}). JPG·PNG·WebP만 저장합니다.`, { code: "BAD_CONTENT_TYPE", status: 415 });
  }
  const body = await readCapped(fetched.res, MAX_IMAGE_BYTES);
  if (!body.ok) return bad(body.error, { code: "RESPONSE_TOO_LARGE", status: 413 });

  return NextResponse.json({
    status: "ok",
    contentType: type,
    bytes: body.bytes.length,
    sourceUrl: fetched.finalUrl,
    dataUrl: `data:${type};base64,${body.bytes.toString("base64")}`,
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const url = String(body.url || "").trim();
  if (!url) return bad("상품 URL을 입력하세요.", { code: "URL_REQUIRED" });

  const guard = assertFetchableUrl(url);
  if (!guard.ok) return bad(guard.error, { code: "URL_BLOCKED" });

  if (body.action === "image") return importImage(url);

  const fetched = await safeFetch(url, { accept: "text/html,application/xhtml+xml;q=0.9" });
  if (!fetched.ok) return bad(fetched.error, { code: fetched.code, status: 422 });

  const type = contentTypeOf(fetched.res);
  if (!HTML_TYPES.includes(type)) {
    return bad(`상품 페이지(HTML)가 아닙니다 (${type || "알 수 없음"}).`, { code: "BAD_CONTENT_TYPE", status: 415 });
  }
  const read = await readCapped(fetched.res, MAX_HTML_BYTES);
  if (!read.ok) return bad(read.error, { code: "RESPONSE_TOO_LARGE", status: 413 });

  const html = read.bytes.toString("utf8");
  const result = extractProductDraft({ html, url: fetched.finalUrl, fetchedAt: new Date().toISOString() });

  if (!result.draft.name) {
    return bad("이 페이지에서는 상품명을 확인하지 못했습니다. JSON 붙여넣기나 수동 등록을 사용하세요.", {
      code: "NO_PRODUCT_DATA",
      status: 422,
      extra: { review: result.review, source: result.source },
    });
  }

  return NextResponse.json({
    status: "ok",
    draft: result.draft,
    review: result.review,
    evidence: result.evidence,
    imageCandidates: result.imageCandidates,
    source: result.source,
    canonicalUrl: canonicalizeProductUrl(fetched.finalUrl) || result.source.canonicalUrl,
    modelKey: modelKey({ vendor: result.draft.vendor, sku: result.draft.sku }),
  });
}
