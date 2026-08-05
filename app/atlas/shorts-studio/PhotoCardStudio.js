/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { KEYS, readList, readMap, writeMap } from "@/app/atlas/lib/storage";
import { listImages, loadImageElement } from "@/app/atlas/lib/image-store";
import {
  applyOverrides,
  buildCaptionText,
  buildCards,
  buildPackageJson,
} from "@/lib/atlas/photo-card/copy-engine";
import { getPreset, PRESETS } from "@/lib/atlas/photo-card/presets";
import {
  canvasToPngBlob,
  DEFAULT_IMAGE_SETTINGS,
  renderCardToCanvas,
} from "@/lib/atlas/photo-card/renderer";
import { buildZip } from "@/lib/atlas/photo-card/zip";
import { fileBase, linkStatusLabel, PLATFORMS } from "@/lib/atlas/photo-card/product-model";

const DEFAULT_STATE = {
  presetId: "clean",
  platform: "instagram",
  imageSettings: { ...DEFAULT_IMAGE_SETTINGS },
  cardImageIndex: [0, 0, 0, 0, 0, 0],
  overrides: {},
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Blob URL을 바로 해제하면 일부 브라우저에서 저장이 취소되므로 한 틱 뒤에 정리한다.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function PhotoCardStudio() {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [images, setImages] = useState([]);
  const [elements, setElements] = useState([]);
  const [state, setState] = useState(DEFAULT_STATE);
  const [warnings, setWarnings] = useState([]);
  const [status, setStatus] = useState("");
  const [openCard, setOpenCard] = useState("");
  const [busy, setBusy] = useState(false);
  const canvasRefs = useRef([]);

  // 초기 로드: localStorage의 상품 목록 + URL의 productId
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const list = readList(KEYS.products);
      const requested = new URLSearchParams(window.location.search).get("productId");
      setProducts(list);
      setProductId(list.find((p) => p.id === requested)?.id || list[0]?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 상품이 바뀌면 저장된 작업 상태와 이미지를 다시 읽는다(새로고침 후에도 유지).
  useEffect(() => {
    if (!productId) return undefined;
    let cancelled = false;

    (async () => {
      const saved = readMap(KEYS.photoCards)[productId];
      let rows = [];
      try {
        rows = await listImages(productId);
      } catch {
        rows = [];
      }
      const loaded = await Promise.all(
        rows.map((row) => loadImageElement(row.dataUrl).catch(() => null)),
      );
      if (cancelled) return;
      setState(
        saved
          ? {
              ...DEFAULT_STATE,
              ...saved,
              imageSettings: { ...DEFAULT_IMAGE_SETTINGS, ...(saved.imageSettings || {}) },
              cardImageIndex: saved.cardImageIndex || DEFAULT_STATE.cardImageIndex,
              overrides: saved.overrides || {},
            }
          : DEFAULT_STATE,
      );
      setImages(rows);
      setElements(loaded);
    })();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  const product = useMemo(
    () => products.find((p) => p.id === productId) || null,
    [products, productId],
  );

  const cards = useMemo(() => {
    if (!product) return [];
    return applyOverrides(buildCards(product), state.overrides);
  }, [product, state.overrides]);

  const preset = getPreset(state.presetId);

  const persistState = useCallback(
    (next) => {
      setState(next);
      if (!productId) return;
      const map = readMap(KEYS.photoCards);
      map[productId] = { ...next, updatedAt: new Date().toISOString() };
      writeMap(KEYS.photoCards, map);
    },
    [productId],
  );

  function patchState(patch) {
    persistState({ ...state, ...patch });
  }

  function patchImageSettings(patch) {
    persistState({ ...state, imageSettings: { ...state.imageSettings, ...patch } });
  }

  function patchOverride(slug, field, value) {
    persistState({
      ...state,
      overrides: {
        ...state.overrides,
        [slug]: { ...(state.overrides[slug] || {}), [field]: value },
      },
    });
  }

  function resetCard(slug) {
    const next = { ...state.overrides };
    delete next[slug];
    persistState({ ...state, overrides: next });
  }

  // 미리보기 = 실제 다운로드 캔버스. 같은 캔버스에서 toBlob 하므로 결과가 100% 일치한다.
  useEffect(() => {
    if (!product || cards.length === 0) return;
    const collected = [];
    cards.forEach((card, index) => {
      const canvas = canvasRefs.current[index];
      if (!canvas) return;
      const imageIndex = state.cardImageIndex[index] ?? 0;
      const image = elements[imageIndex] || elements[0] || null;
      const result = renderCardToCanvas(canvas, {
        card,
        preset,
        image,
        imageSettings: state.imageSettings,
      });
      result.warnings.forEach((w) => collected.push(`${card.slug} · ${w}`));
    });
    setWarnings([...new Set(collected)]);
  }, [product, cards, preset, elements, state.cardImageIndex, state.imageSettings]);

  const base = product
    ? fileBase({ productName: product.name, platform: state.platform })
    : "atlas_card";

  async function handleDownloadOne(index) {
    const canvas = canvasRefs.current[index];
    if (!canvas) return;
    const blob = await canvasToPngBlob(canvas);
    downloadBlob(blob, `${base}_${cards[index].slug}.png`);
    setStatus(`${cards[index].slug}.png 다운로드`);
  }

  async function handleDownloadZip() {
    if (!product) return;
    setBusy(true);
    setStatus("");
    try {
      const files = [];
      for (let i = 0; i < cards.length; i += 1) {
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;
        const blob = await canvasToPngBlob(canvas);
        files.push({ name: `${cards[i].slug}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      const meta = { platform: state.platform, preset: preset.id };
      files.push({ name: "caption.txt", data: buildCaptionText(product, cards, meta) });
      files.push({
        name: "product.json",
        data: JSON.stringify(buildPackageJson(product, cards, meta), null, 2),
      });
      const zip = buildZip(files);
      downloadBlob(new Blob([zip], { type: "application/zip" }), `${base}.zip`);
      setStatus(`ZIP 다운로드 완료 (PNG ${cards.length}장 + caption.txt + product.json)`);
    } catch (err) {
      setStatus(`ZIP 생성 실패: ${err.message}`);
    }
    setBusy(false);
  }

  function handleDownloadText() {
    if (!product) return;
    const text = buildCaptionText(product, cards, {
      platform: state.platform,
      preset: preset.id,
    });
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${base}.txt`);
    setStatus("게시글 문구 TXT 다운로드");
  }

  if (!products.length) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        Product Center에 등록된 상품이 없습니다.{" "}
        <Link href="/atlas/product-center" className="text-emerald-400 hover:underline">
          Product Center에서 상품 후보 등록 →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 상품 · 프리셋 · 플랫폼 ─────────────────────────────── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="text-zinc-400">상품 (Product Center)</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-zinc-400">플랫폼 (파일명에 포함)</span>
            <select
              value={state.platform}
              onChange={(e) => patchState({ platform: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm">
            <span className="text-zinc-400">상태</span>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span
                className={`rounded px-2 py-1 ${
                  product && linkStatusLabel(product) === "판매 연결됨"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-zinc-700 text-zinc-300"
                }`}
              >
                {product ? linkStatusLabel(product) : "상품 미선택"}
              </span>
              <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-400">이미지 {images.length}장</span>
              <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-400">출력 1080×1920 PNG</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <span className="text-sm text-zinc-400">디자인 프리셋</span>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => patchState({ presetId: p.id, imageSettings: { ...state.imageSettings, fit: p.defaultFit } })}
                className={`rounded-lg border p-3 text-left text-sm transition ${
                  state.presetId === p.id
                    ? "border-emerald-500 bg-emerald-950/30 text-emerald-200"
                    : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                <span className="font-semibold">{p.label}</span>
                <span className="mt-1 block text-xs text-zinc-500">{p.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── 이미지 규격화 조정 ──────────────────────────────── */}
        <div className="mt-5 grid gap-4 border-t border-zinc-800 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="text-zinc-400">이미지 맞춤</span>
            <select
              value={state.imageSettings.fit}
              onChange={(e) => patchImageSettings({ fit: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              <option value="contain">contain (제품 전체 표시)</option>
              <option value="cover">cover (영역 가득 채움)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-zinc-400">확대·축소 {state.imageSettings.scale.toFixed(2)}×</span>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.02"
              value={state.imageSettings.scale}
              onChange={(e) => patchImageSettings({ scale: Number(e.target.value) })}
              className="mt-3 w-full"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-400">초점 X {state.imageSettings.focusX.toFixed(2)}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state.imageSettings.focusX}
              onChange={(e) => patchImageSettings({ focusX: Number(e.target.value) })}
              className="mt-3 w-full"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-400">초점 Y {state.imageSettings.focusY.toFixed(2)}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state.imageSettings.focusY}
              onChange={(e) => patchImageSettings({ focusY: Number(e.target.value) })}
              className="mt-3 w-full"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-400">빈 공간 배경</span>
            <select
              value={state.imageSettings.background}
              onChange={(e) => patchImageSettings({ background: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              <option value="blur">이미지 기반 블러</option>
              <option value="color">선택 색상</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-zinc-400">배경 색상</span>
            <input
              type="color"
              value={state.imageSettings.backgroundColor}
              onChange={(e) => patchImageSettings({ backgroundColor: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950"
            />
          </label>
          <div className="text-sm sm:col-span-2">
            <span className="text-zinc-400">이미지 원본</span>
            {images.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {images.map((image, i) => (
                  <li key={image.id} className="w-16 text-center">
                    <img
                      src={image.dataUrl}
                      alt={image.name}
                      className="h-16 w-16 rounded border border-zinc-800 object-contain"
                    />
                    <span className="text-[10px] text-zinc-500">#{i + 1}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-amber-400">
                이미지가 없습니다.{" "}
                <Link
                  href={`/atlas/product-center`}
                  className="text-emerald-400 hover:underline"
                >
                  Product Center에서 업로드
                </Link>
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={busy || !product}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {busy ? "패키지 만드는 중…" : "전체 ZIP 다운로드"}
          </button>
          <button
            type="button"
            onClick={handleDownloadText}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            게시글 문구 TXT
          </button>
          <span className="text-xs text-zinc-500">파일명: {base}_01-cover.png</span>
          {status ? <span className="text-xs text-emerald-400">{status}</span> : null}
        </div>
      </section>

      {warnings.length ? (
        <ul className="space-y-1 rounded-md border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          {warnings.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      ) : null}

      {/* ── 미리보기 · 카드별 편집 ─────────────────────────────── */}
      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, index) => (
          <article key={card.slug} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">
                {card.slug} · {card.label}
              </span>
              <button
                type="button"
                onClick={() => setOpenCard(openCard === card.slug ? "" : card.slug)}
                className="text-xs text-emerald-400 hover:underline"
              >
                {openCard === card.slug ? "닫기" : "문구 수정"}
              </button>
            </div>

            <canvas
              ref={(el) => {
                canvasRefs.current[index] = el;
              }}
              className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950"
              style={{ aspectRatio: "1080 / 1920" }}
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-zinc-500">
                이미지
                <select
                  value={state.cardImageIndex[index] ?? 0}
                  onChange={(e) => {
                    const next = [...state.cardImageIndex];
                    next[index] = Number(e.target.value);
                    patchState({ cardImageIndex: next });
                  }}
                  className="ml-1 rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 text-zinc-200"
                >
                  {(images.length ? images : [{ id: "none", name: "없음" }]).map((image, i) => (
                    <option key={image.id} value={i}>
                      #{i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => handleDownloadOne(index)}
                className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-emerald-600 hover:text-emerald-300"
              >
                PNG 다운로드
              </button>
            </div>

            {openCard === card.slug ? (
              <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
                <EditField
                  label="배지"
                  value={card.badge}
                  onChange={(v) => patchOverride(card.slug, "badge", v)}
                />
                <EditField
                  label="헤드라인"
                  value={card.headline}
                  onChange={(v) => patchOverride(card.slug, "headline", v)}
                  textarea
                />
                <EditField
                  label="서브"
                  value={card.sub}
                  onChange={(v) => patchOverride(card.slug, "sub", v)}
                />
                <EditField
                  label="불릿 (줄바꿈 구분)"
                  value={card.bullets.join("\n")}
                  onChange={(v) => patchOverride(card.slug, "bulletsText", v)}
                  textarea
                  rows={4}
                />
                <EditField
                  label="각주"
                  value={card.footnote}
                  onChange={(v) => patchOverride(card.slug, "footnote", v)}
                  textarea
                />
                <button
                  type="button"
                  onClick={() => resetCard(card.slug)}
                  className="text-[11px] text-zinc-400 hover:underline"
                >
                  기본 문구로 되돌리기
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}

function EditField({ label, value, onChange, textarea, rows = 2 }) {
  return (
    <label className="block text-[11px]">
      <span className="text-zinc-500">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
        />
      )}
    </label>
  );
}
