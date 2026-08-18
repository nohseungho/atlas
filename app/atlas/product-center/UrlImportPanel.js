/* eslint-disable @next/next/no-img-element */
"use client";

// ─── Product Center · 상품 URL로 가져오기 ──────────────────────────────────
// URL 1개 → 서버가 공개 상품 페이지를 한 번 읽고, JSON-LD Product/Offer(우선)와
// Open Graph로 확인된 값만 돌려준다. 확인 못 한 값은 REVIEW로 남고 이 화면은
// 그것을 추측으로 채우지 않는다.
//
// 사용자 검수가 필요한 세 가지는 자동으로 넘어가지 않는다:
//   · 가격·판매 상태 → 폼에 채운 뒤 사용자가 저장 버튼을 눌러야 등록된다
//   · 이미지 사용 권한 → 확인 체크 전에는 IndexedDB에 저장하지 않는다
//   · 제휴 링크 → 자동 생성하지 않는다 (항상 "제휴 링크 대기")

import { useState } from "react";
import { canonicalizeProductUrl, vendorFromUrl } from "@/lib/atlas/product-import/url-guard";
import { modelKey } from "@/lib/atlas/product-import/product-extract";
import { addImageFromDataUrl } from "@/app/atlas/lib/image-store";
import { formatAmount } from "@/lib/atlas/photo-card/product-model";

function fileNameFromUrl(url, index) {
  try {
    const name = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
    return /\.(jpe?g|png|webp)$/i.test(name) ? name : `product-image-${index + 1}.jpg`;
  } catch {
    return `product-image-${index + 1}.jpg`;
  }
}

/** 이미 등록된 상품 중 같은 canonical URL 또는 같은 판매처+모델번호를 찾는다. */
export function findDuplicate(products, { canonicalUrl, vendor, sku }) {
  const key = canonicalizeProductUrl(canonicalUrl);
  const model = modelKey({ vendor, sku });
  return (
    (products || []).find((p) => {
      if (key && canonicalizeProductUrl(p.productUrl) === key) return true;
      return Boolean(model) && modelKey({ vendor: p.vendor, sku: p.sku }) === model;
    }) || null
  );
}

export default function UrlImportPanel({ products, targetId, onApply, onEditExisting, onImagesSaved }) {
  const [url, setUrl] = useState("");
  const [vendorOverride, setVendorOverride] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [picked, setPicked] = useState([]);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  const duplicate = result
    ? findDuplicate(products, {
        canonicalUrl: result.canonicalUrl || result.draft.productUrl,
        vendor: result.draft.vendor,
        sku: result.draft.sku,
      })
    : null;

  async function analyze() {
    setBusy("analyze");
    setError("");
    setStatus("");
    setResult(null);
    setPicked([]);
    // 새 상품을 분석할 때마다 이미지 사용 확인은 처음부터 다시 받는다.
    setRightsConfirmed(false);
    try {
      const res = await fetch("/api/atlas/product-import", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === "ok") {
        setResult(data);
        setStatus(
          data.source?.usedJsonLd
            ? "JSON-LD Product/Offer에서 읽었습니다. REVIEW 항목은 직접 확인하세요."
            : "JSON-LD가 없어 Open Graph/meta로만 채웠습니다. REVIEW 항목이 많을 수 있습니다.",
        );
      } else {
        setError(data.message || `가져오지 못했습니다 (${data.errorCode || res.status}).`);
      }
    } catch (err) {
      setError(`서버에 연결하지 못했습니다: ${String(err?.message || err)}`);
    }
    setBusy("");
  }

  function applyToForm() {
    if (!result || duplicate) return;
    const draft = { ...result.draft };
    const vendor = vendorOverride.trim();
    if (vendor) draft.vendor = vendor;
    else if (!draft.vendor) draft.vendor = vendorFromUrl(draft.productUrl);
    onApply(draft, result);
    setStatus("폼에 채웠습니다. 가격·판매 상태를 확인한 뒤 저장하세요. 저장 전에는 등록되지 않습니다.");
  }

  async function saveSelectedImages() {
    if (!result || !rightsConfirmed || picked.length === 0) return;
    setBusy("images");
    setError("");
    let saved = 0;
    const failures = [];
    for (const index of picked) {
      const imageUrl = result.imageCandidates[index];
      try {
        const res = await fetch("/api/atlas/product-import", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "image", url: imageUrl }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.status !== "ok") throw new Error(data.message || data.errorCode || `HTTP ${res.status}`);
        await addImageFromDataUrl(targetId, {
          dataUrl: data.dataUrl,
          contentType: data.contentType,
          name: fileNameFromUrl(imageUrl, index),
          sourceUrl: data.sourceUrl || imageUrl,
        });
        saved += 1;
      } catch (err) {
        failures.push(`${imageUrl}: ${String(err?.message || err)}`);
      }
    }
    if (failures.length) setError(failures.join("\n"));
    if (saved) {
      setStatus(`이미지 ${saved}장을 저장했습니다. 아래 "상품 이미지"에서 확인하세요.`);
      setPicked([]);
      await onImagesSaved?.();
    }
    setBusy("");
  }

  const draft = result?.draft;

  return (
    <div className="rounded-xl border border-sky-900 bg-zinc-900 p-5">
      <h2 className="text-lg font-semibold text-sky-200">상품 URL로 가져오기</h2>
      <p className="mt-1 text-xs text-zinc-500">
        상품 페이지 주소 1개를 넣으면 공개된 상품 정보만 읽어옵니다. 완전 자동 등록이 아닙니다 — 가격·판매
        상태·이미지 사용 권한·제휴 링크는 사용자가 확인해야 하고, 저장 버튼을 눌러야 등록됩니다.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim() && !busy) analyze();
          }}
          placeholder="https://판매처.com/products/…"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
        <button
          type="button"
          onClick={analyze}
          disabled={!url.trim() || Boolean(busy)}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
        >
          {busy === "analyze" ? "읽는 중…" : "URL 분석"}
        </button>
      </div>
      <label className="mt-2 block text-xs text-zinc-500">
        판매처 (비우면 도메인·페이지에서 자동 감지)
        <input
          value={vendorOverride}
          onChange={(e) => setVendorOverride(e.target.value)}
          placeholder={url.trim() ? vendorFromUrl(url) || "자동 감지" : "자동 감지"}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
        />
      </label>

      {error ? (
        <p className="mt-3 whitespace-pre-wrap rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
      {status ? <p className="mt-3 text-xs text-emerald-400">{status}</p> : null}

      {draft ? (
        <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
          {duplicate ? (
            <div className="rounded-md border border-amber-900 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
              이미 등록된 상품입니다 ({duplicate.id}). 새로 만들지 않고 기존 상품을 이어서 편집하세요.
              <button
                type="button"
                onClick={() => onEditExisting(duplicate)}
                className="ml-2 rounded bg-zinc-800 px-2 py-0.5 text-zinc-100 hover:bg-zinc-700"
              >
                {duplicate.name} 이어서 편집
              </button>
            </div>
          ) : null}

          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            <Row label="상품명" value={draft.name} />
            <Row label="판매처" value={vendorOverride.trim() || draft.vendor} />
            <Row label="카테고리 후보" value={draft.category} />
            <Row
              label="현재가"
              value={draft.currentPrice === null ? "" : formatAmount(draft.currentPrice, draft.currency || "USD")}
            />
            <Row label="정상가" value={draft.listPrice === null ? "" : String(draft.listPrice)} />
            <Row label="배송비" value={draft.shippingFee === null ? "" : String(draft.shippingFee)} />
            <Row label="판매 상태" value={draft.availability} />
            <Row label="모델번호" value={draft.sku} />
            <Row label="가격 근거" value={draft.priceSource} />
            <Row label="가격 확인 시각" value={draft.priceCheckedAt} />
            <Row label="상품 URL(정규화)" value={draft.productUrl} wide />
            <Row label="제휴 링크" value="" pending="제휴 링크 대기 · 자동 생성하지 않습니다" wide />
          </dl>

          {draft.features.length ? (
            <ul className="text-xs text-zinc-400">
              {draft.features.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
          ) : null}

          {result.review?.length ? (
            <div className="flex flex-wrap gap-1">
              {result.review.map((r) => (
                <span key={r} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300">
                  REVIEW · {r}
                </span>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={applyToForm}
            disabled={Boolean(duplicate)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            폼에 채우기
          </button>

          {/* ── 이미지 후보 · 사용 확인 전에는 저장하지 않는다 ───────────── */}
          <div className="border-t border-zinc-800 pt-3">
            <p className="text-xs text-zinc-400">
              대표 이미지 후보 ({result.imageCandidates.length}) · 출처 {draft.imageSource || "미확인"}
            </p>
            {result.imageCandidates.length ? (
              <>
                <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {result.imageCandidates.map((src, i) => (
                    <li key={src} className="rounded border border-zinc-800 p-1">
                      <label className="block cursor-pointer">
                        <img src={src} alt={`이미지 후보 ${i + 1}`} className="h-20 w-full rounded object-contain" />
                        <span className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400">
                          <input
                            type="checkbox"
                            checked={picked.includes(i)}
                            onChange={() =>
                              setPicked((prev) => (prev.includes(i) ? prev.filter((v) => v !== i) : [...prev, i]))
                            }
                          />
                          #{i + 1}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <label className="mt-3 flex items-start gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={rightsConfirmed}
                    onChange={(e) => setRightsConfirmed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    이 이미지를 사용할 권한이 있음을 확인했습니다. (확인 전에는 저장하지 않습니다. 이 체크는
                    자동으로 켜지지 않으며, 상품의 “이미지 사용 확인함”도 따로 체크해야 합니다.)
                  </span>
                </label>
                <button
                  type="button"
                  onClick={saveSelectedImages}
                  disabled={!rightsConfirmed || picked.length === 0 || Boolean(busy)}
                  className="mt-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-40"
                >
                  {busy === "images" ? "저장 중…" : `선택 이미지 저장 (${picked.length})`}
                </button>
              </>
            ) : (
              <p className="mt-2 text-xs text-amber-400">이미지 후보를 찾지 못했습니다. 직접 업로드하세요.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, pending, wide }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="inline text-zinc-500">{label}: </dt>
      <dd className="inline break-all text-zinc-200">
        {value ? (
          value
        ) : (
          <span className="text-amber-400">{pending || "REVIEW · 확인 필요"}</span>
        )}
      </dd>
    </div>
  );
}
