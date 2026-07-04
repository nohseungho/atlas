"use client";

import { useEffect, useState } from "react";
import { KEYS, newId, readList, writeList } from "@/app/atlas/lib/storage";

const CATEGORY_SUGGESTIONS = [
  "Outdoor Safety",
  "Mystery",
  "History",
  "Nature",
];

const emptyForm = {
  name: "",
  category: "",
  affiliateLink: "[Affiliate Link Placeholder]",
  imageNote: "",
  note: "",
};

export default function ProductCenterPage() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    setProducts(readList(KEYS.products));
  }, []);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    if (!form.name.trim()) return;

    let next;
    if (editingId) {
      next = products.map((p) =>
        p.id === editingId ? { ...p, ...form, updatedAt: new Date().toISOString() } : p
      );
    } else {
      const product = {
        id: newId("product"),
        ...form,
        updatedAt: new Date().toISOString(),
      };
      next = [product, ...products];
    }
    setProducts(next);
    writeList(KEYS.products, next);
    setForm(emptyForm);
    setEditingId(null);
  }

  function handleEdit(product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      category: product.category,
      affiliateLink: product.affiliateLink,
      imageNote: product.imageNote,
      note: product.note,
    });
  }

  function handleDelete(id) {
    const next = products.filter((p) => p.id !== id);
    setProducts(next);
    writeList(KEYS.products, next);
    if (editingId === id) {
      setForm(emptyForm);
      setEditingId(null);
    }
  }

  function handleCancelEdit() {
    setForm(emptyForm);
    setEditingId(null);
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold">Product Center</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Affiliate 상품 마스터 DB. 상품을 판매하는 화면이 아니라, 하나의
            상품을 여러 블로그·여러 쇼츠에서 재사용할 수 있도록 등록해두는
            곳입니다.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">
              {editingId ? "상품 수정" : "새 상품 등록"}
            </h2>
            <div className="mt-4 space-y-3">
              <Field
                label="상품명"
                value={form.name}
                onChange={(v) => updateField("name", v)}
                placeholder="예: 헤드랜턴"
              />
              <Field
                label="카테고리"
                value={form.category}
                onChange={(v) => updateField("category", v)}
                placeholder="예: Outdoor Safety"
                listId="category-suggestions"
              />
              <datalist id="category-suggestions">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <Field
                label="Affiliate Link"
                value={form.affiliateLink}
                onChange={(v) => updateField("affiliateLink", v)}
              />
              <Field
                label="이미지 노트"
                value={form.imageNote}
                onChange={(v) => updateField("imageNote", v)}
                placeholder="상품 이미지/프롬프트 관련 메모"
              />
              <Field
                label="메모"
                value={form.note}
                onChange={(v) => updateField("note", v)}
                textarea
              />
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleSave}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                {editingId ? "수정 저장" : "상품 등록"}
              </button>
              {editingId && (
                <button
                  onClick={handleCancelEdit}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
                >
                  취소
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">
              등록된 상품 ({products.length})
            </h2>
            <ul className="mt-4 space-y-3">
              {products.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-zinc-800 p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-zinc-100">{p.name}</p>
                      <p className="text-xs text-zinc-500">
                        {p.category || "미분류"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {p.affiliateLink}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => handleEdit(p)}
                        className="text-xs text-emerald-400 hover:underline"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-xs text-red-400 hover:underline"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              {products.length === 0 && (
                <li className="text-sm text-zinc-500">
                  등록된 상품이 없습니다.
                </li>
              )}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, textarea, placeholder, listId }) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-400">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
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
