/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { KEYS, newId, readList, writeList } from "@/app/atlas/lib/storage";
import {
  ACCEPTED_TYPES,
  addImages,
  listImages,
  removeImage,
  removeImagesOfProduct,
} from "@/app/atlas/lib/image-store";
import {
  CURRENCIES,
  formatAmount,
  linkStatusLabel,
  normalizeProductInput,
  parseProductJson,
  resolveDiscount,
  parseAmount,
} from "@/lib/atlas/photo-card/product-model";

const CATEGORY_SUGGESTIONS = ["생활가전", "주방", "캠핑·아웃도어", "홈오피스", "반려동물", "뷰티"];

const emptyForm = {
  name: "",
  category: "",
  vendor: "",
  currency: "KRW",
  currentPrice: "",
  listPrice: "",
  shippingFee: "",
  shippingNote: "",
  productUrl: "",
  affiliateLink: "",
  tagNote: "",
  benefit: "",
  features: "",
  audience: "",
  priceSource: "",
  priceCheckedAt: "",
  caption: "",
  hashtags: "",
  imageSource: "",
  imageRightsConfirmed: false,
  imageNote: "",
  note: "",
};

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocalInput() {
  return toLocalInput(new Date().toISOString());
}

function productToForm(product) {
  return {
    ...emptyForm,
    ...Object.fromEntries(
      Object.keys(emptyForm).map((key) => [key, product[key] ?? emptyForm[key]]),
    ),
    currentPrice: product.currentPrice ?? "",
    listPrice: product.listPrice ?? "",
    shippingFee: product.shippingFee ?? "",
    features: Array.isArray(product.features) ? product.features.join("\n") : product.features || "",
    hashtags: Array.isArray(product.hashtags) ? product.hashtags.join(" ") : product.hashtags || "",
    priceCheckedAt: toLocalInput(product.priceCheckedAt),
    imageRightsConfirmed: Boolean(product.imageRightsConfirmed),
  };
}

function urlKey(value) {
  return String(value || "")
    .trim()
    .replace(/#.*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export default function ProductCenterPage() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [draftId, setDraftId] = useState("");
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [message, setMessage] = useState("");
  const [duplicate, setDuplicate] = useState(null);
  const [jsonText, setJsonText] = useState("");
  const [images, setImages] = useState([]);
  const [imageCounts, setImageCounts] = useState({});
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const targetId = editingId || draftId;

  const refreshCounts = useCallback(async (list) => {
    const counts = {};
    for (const product of list) {
      try {
        counts[product.id] = (await listImages(product.id)).length;
      } catch {
        counts[product.id] = 0;
      }
    }
    setImageCounts(counts);
  }, []);

  useEffect(() => {
    const list = readList(KEYS.products);
    setProducts(list);
    setDraftId(newId("product"));
    refreshCounts(list);
  }, [refreshCounts]);

  const loadImages = useCallback(async (id) => {
    if (!id) return;
    try {
      setImages(await listImages(id));
    } catch (err) {
      setErrors((prev) => [...prev, err.message]);
    }
  }, []);

  useEffect(() => {
    loadImages(targetId);
  }, [targetId, loadImages]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setDraftId(newId("product"));
    setErrors([]);
    setWarnings([]);
    setDuplicate(null);
    setImages([]);
  }

  function persist(next) {
    setProducts(next);
    writeList(KEYS.products, next);
    refreshCounts(next);
  }

  function handleSave() {
    setMessage("");
    setDuplicate(null);
    const previous = products.find((p) => p.id === targetId);
    const result = normalizeProductInput({
      ...form,
      id: targetId,
      createdAt: previous?.createdAt,
    });
    if (!result.ok) {
      setErrors(result.errors);
      setWarnings(result.warnings);
      return;
    }

    // 같은 상품을 두 번 등록하지 않도록 URL/상품명으로 기존 레코드를 찾아준다.
    const dupe = products.find((p) => {
      if (p.id === targetId) return false;
      const sameUrl = urlKey(p.productUrl) && urlKey(p.productUrl) === urlKey(result.product.productUrl);
      const sameName = p.name?.trim() === result.product.name && (p.vendor || "") === result.product.vendor;
      return sameUrl || sameName;
    });
    if (dupe && !editingId) {
      setDuplicate(dupe);
      setErrors([`이미 등록된 상품입니다 (${dupe.id}). 새로 만들지 말고 기존 상품을 이어서 편집하세요.`]);
      return;
    }

    const product = { ...result.product, id: targetId };
    const next = previous
      ? products.map((p) => (p.id === targetId ? { ...p, ...product } : p))
      : [product, ...products];

    persist(next);
    setErrors([]);
    setWarnings(result.warnings);
    setEditingId(targetId);
    setMessage(`저장했습니다: ${product.name} (${targetId})`);
  }

  function handleEdit(product) {
    setEditingId(product.id);
    setForm(productToForm(product));
    setErrors([]);
    setWarnings([]);
    setDuplicate(null);
    setMessage(`${product.name} 편집 중`);
  }

  async function handleDelete(id) {
    persist(products.filter((p) => p.id !== id));
    try {
      await removeImagesOfProduct(id);
    } catch {
      /* 이미지 삭제 실패는 상품 삭제를 막지 않는다 */
    }
    if (targetId === id) resetForm();
  }

  function handleJsonApply() {
    const parsed = parseProductJson(jsonText);
    if (!parsed.ok) {
      setErrors([parsed.error]);
      return;
    }
    const normalized = normalizeProductInput(parsed.value);
    if (!normalized.ok) {
      setErrors(normalized.errors);
      return;
    }
    setForm(productToForm(normalized.product));
    setErrors([]);
    setWarnings(normalized.warnings);
    setMessage("JSON을 폼에 적용했습니다. 확인 후 저장하세요.");
  }

  async function handleFiles(fileList) {
    if (!fileList?.length) return;
    const { saved, errors: fileErrors } = await addImages(targetId, fileList);
    if (fileErrors.length) setErrors(fileErrors);
    if (saved.length) {
      setMessage(`이미지 ${saved.length}장을 추가했습니다.`);
      await loadImages(targetId);
      refreshCounts(products);
    }
  }

  async function handleRemoveImage(id) {
    await removeImage(id);
    await loadImages(targetId);
    refreshCounts(products);
  }

  const discount = resolveDiscount({
    currentPrice: parseAmount(form.currentPrice),
    listPrice: parseAmount(form.listPrice),
  });

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold">Product Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            상품 마스터 DB. 여기 한 번 등록하면 Shorts Studio의 판매카드 제작과 블로그·쇼츠에서
            같은 상품 ID로 재사용합니다. 쇼핑몰 자동 수집은 하지 않으며, 입력된 근거만 표시합니다.
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            상품 정보는 브라우저 localStorage, 이미지는 IndexedDB에 저장됩니다(새로고침 후에도 유지).
          </p>
        </header>

        {message ? (
          <div className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-emerald-300">
            {message}
          </div>
        ) : null}
        {errors.length ? (
          <ul className="space-y-1 rounded-md border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {errors.map((e) => (
              <li key={e}>· {e}</li>
            ))}
            {duplicate ? (
              <li className="pt-2">
                <button
                  type="button"
                  onClick={() => handleEdit(duplicate)}
                  className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
                >
                  {duplicate.name} 이어서 편집
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
        {warnings.length ? (
          <ul className="space-y-1 rounded-md border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
            {warnings.map((w) => (
              <li key={w}>· {w}</li>
            ))}
          </ul>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* ── 등록 폼 ─────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {editingId ? "상품 수정" : "상품 후보 등록"}
                </h2>
                <span className="text-xs text-zinc-600">ID: {targetId}</span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="상품명 *" value={form.name} onChange={(v) => updateField("name", v)} />
                <Field
                  label="카테고리"
                  value={form.category}
                  onChange={(v) => updateField("category", v)}
                  listId="pc-category"
                />
                <datalist id="pc-category">
                  {CATEGORY_SUGGESTIONS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <Field label="판매처" value={form.vendor} onChange={(v) => updateField("vendor", v)} />
                <SelectField
                  label="통화"
                  value={form.currency}
                  onChange={(v) => updateField("currency", v)}
                  options={CURRENCIES}
                />
                <Field
                  label="현재 확인가"
                  value={form.currentPrice}
                  onChange={(v) => updateField("currentPrice", v)}
                  placeholder="예: 12,900"
                />
                <Field
                  label="정상가 (확인된 경우만)"
                  value={form.listPrice}
                  onChange={(v) => updateField("listPrice", v)}
                />
                <Field
                  label="배송비"
                  value={form.shippingFee}
                  onChange={(v) => updateField("shippingFee", v)}
                  placeholder="무료면 0"
                />
                <Field
                  label="배송 메모"
                  value={form.shippingNote}
                  onChange={(v) => updateField("shippingNote", v)}
                  placeholder="예: 로켓배송"
                />
              </div>

              <p className="mt-2 text-xs text-zinc-500">
                할인율:{" "}
                {discount.percent === null ? (
                  <span className="text-zinc-500">{discount.basis}</span>
                ) : (
                  <span className="text-emerald-400">{discount.percent}% ({discount.basis})</span>
                )}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field
                  label="상품 URL"
                  value={form.productUrl}
                  onChange={(v) => updateField("productUrl", v)}
                  placeholder="https://…"
                />
                <Field
                  label="제휴·상품태그 링크 (선택)"
                  value={form.affiliateLink}
                  onChange={(v) => updateField("affiliateLink", v)}
                  placeholder="https://… (없으면 비워두세요)"
                />
                <Field
                  label="상품태그 연결 메모 (선택)"
                  value={form.tagNote}
                  onChange={(v) => updateField("tagNote", v)}
                  placeholder="예: 인스타 상품 태그 연결 완료"
                />
                <Field
                  label="가격·판매근거 출처"
                  value={form.priceSource}
                  onChange={(v) => updateField("priceSource", v)}
                  placeholder="예: 쿠팡 상품 페이지"
                />
                <div>
                  <label className="block text-sm">
                    <span className="text-zinc-400">가격 확인 시각</span>
                    <input
                      type="datetime-local"
                      value={form.priceCheckedAt}
                      onChange={(e) => updateField("priceCheckedAt", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => updateField("priceCheckedAt", nowLocalInput())}
                    className="mt-1 text-xs text-emerald-400 hover:underline"
                  >
                    지금으로 설정
                  </button>
                </div>
                <Field
                  label="추천 대상"
                  value={form.audience}
                  onChange={(v) => updateField("audience", v)}
                  placeholder="예: 사무실에서 오래 앉아 일하는 사람"
                />
              </div>

              <div className="mt-4 space-y-3">
                <Field
                  label="핵심 효용"
                  value={form.benefit}
                  onChange={(v) => updateField("benefit", v)}
                  placeholder="예: 건조한 사무실 책상 위 습도 관리"
                />
                <Field
                  label="주요 특징 3~5개 (줄바꿈으로 구분)"
                  value={form.features}
                  onChange={(v) => updateField("features", v)}
                  textarea
                  rows={5}
                />
                <Field
                  label="게시용 문구"
                  value={form.caption}
                  onChange={(v) => updateField("caption", v)}
                  textarea
                  rows={3}
                />
                <Field
                  label="해시태그"
                  value={form.hashtags}
                  onChange={(v) => updateField("hashtags", v)}
                  placeholder="#가습기 #사무실템"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="이미지 출처"
                    value={form.imageSource}
                    onChange={(v) => updateField("imageSource", v)}
                    placeholder="예: 판매처 제공 이미지"
                  />
                  <label className="flex items-end gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={form.imageRightsConfirmed}
                      onChange={(e) => updateField("imageRightsConfirmed", e.target.checked)}
                      className="mb-2.5"
                    />
                    <span className="mb-2">이미지 사용 확인함</span>
                  </label>
                </div>
                <Field
                  label="이미지 노트"
                  value={form.imageNote}
                  onChange={(v) => updateField("imageNote", v)}
                />
                <Field label="메모" value={form.note} onChange={(v) => updateField("note", v)} textarea />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={handleSave}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  {editingId ? "수정 저장" : "상품 등록"}
                </button>
                <button
                  onClick={resetForm}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
                >
                  새 상품
                </button>
                {editingId ? (
                  <Link
                    href={`/atlas/shorts-studio?mode=photo&productId=${editingId}`}
                    className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-950"
                  >
                    판매카드 제작 →
                  </Link>
                ) : null}
              </div>
            </div>

            {/* ── 이미지 업로드 ──────────────────────────────────── */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">상품 이미지 ({images.length})</h2>
              <p className="mt-1 text-xs text-zinc-500">
                JPG·PNG·WebP · 가로형/세로형/정사각형/투명 배경 모두 사용 가능. 출력은 항상 1080×1920으로
                규격화됩니다.
              </p>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`mt-3 cursor-pointer rounded-lg border-2 border-dashed p-6 text-center text-sm ${
                  dragging ? "border-emerald-500 bg-emerald-950/30 text-emerald-300" : "border-zinc-700 text-zinc-500"
                }`}
              >
                이미지를 여기로 드래그하거나 클릭해서 여러 장 선택하세요.
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_TYPES.join(",")}
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />

              {images.length ? (
                <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {images.map((image) => (
                    <li key={image.id} className="rounded-lg border border-zinc-800 p-2">
                      <img
                        src={image.dataUrl}
                        alt={image.name}
                        className="h-24 w-full rounded bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)] bg-[length:16px_16px] object-contain"
                      />
                      <p className="mt-1 truncate text-[11px] text-zinc-400">{image.name}</p>
                      <p className="text-[11px] text-zinc-600">
                        {image.width}×{image.height}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(image.id)}
                        className="mt-1 text-[11px] text-red-400 hover:underline"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {/* ── JSON · 목록 ────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">JSON 붙여넣기</h2>
              <p className="mt-1 text-xs text-zinc-500">
                ChatGPT 등에서 정리한 상품 정보를 그대로 붙여넣고 폼에 적용합니다.
              </p>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={8}
                placeholder='{"name":"휴대용 미니 가습기","vendor":"쿠팡","currentPrice":"12,900","features":["USB-C 직결","500ml"],"audience":"사무직"}'
                className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100"
              />
              <button
                onClick={handleJsonApply}
                className="mt-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
              >
                폼에 적용
              </button>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">등록된 상품 ({products.length})</h2>
              <ul className="mt-4 space-y-3">
                {products.map((p) => (
                  <li key={p.id} className="rounded-lg border border-zinc-800 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-100">{p.name}</p>
                        <p className="text-xs text-zinc-500">
                          {p.category || "미분류"}
                          {p.vendor ? ` · ${p.vendor}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-zinc-400">
                          {p.currentPrice === null || p.currentPrice === undefined
                            ? "가격 미확인"
                            : `현재 확인가 ${formatAmount(p.currentPrice, p.currency)}`}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                          <span
                            className={`rounded px-1.5 py-0.5 ${
                              linkStatusLabel(p) === "판매 연결됨"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-zinc-700 text-zinc-300"
                            }`}
                          >
                            {linkStatusLabel(p)}
                          </span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">
                            이미지 {imageCounts[p.id] ?? 0}장
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <button onClick={() => handleEdit(p)} className="text-xs text-emerald-400 hover:underline">
                          수정
                        </button>
                        <Link
                          href={`/atlas/shorts-studio?mode=photo&productId=${p.id}`}
                          className="text-xs text-sky-400 hover:underline"
                        >
                          판매카드
                        </Link>
                        <button onClick={() => handleDelete(p.id)} className="text-xs text-red-400 hover:underline">
                          삭제
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
                {products.length === 0 && <li className="text-sm text-zinc-500">등록된 상품이 없습니다.</li>}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, textarea, placeholder, listId, rows = 2 }) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-400">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          list={listId}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
        />
      )}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
