"use client";

import { useEffect, useMemo, useState } from "react";
import { naverEditorTarget } from "@/lib/atlas/korea-product-pipeline";

async function api(options = {}) {
  const res = await fetch("/api/atlas/korea-drafts", { cache: "no-store", ...options });
  return res.json().catch(() => ({}));
}

const STATE_LABEL = {
  draft: "작성 중",
  ready_for_review: "검수 대기",
  approved: "발행 승인",
  publishing: "발행 중",
  published: "발행 완료",
  failed: "오류",
};

export default function KoreaPublisherPage() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const data = await api();
    const next = data.items || [];
    setItems(next);
    if (!selectedId && next[0]) setSelectedId(next[0].id);
  }

  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId],
  );

  async function patch(action, patch = {}) {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    const data = await api({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, action, patch }),
    });
    if (data.status === "ok") {
      setMessage(action === "approve" ? "발행 승인되었습니다. 실제 발행은 아직 하지 않았습니다." : "저장되었습니다.");
      await load();
    } else {
      setMessage(data.error || (data.issues || []).join(", ") || "처리하지 못했습니다.");
    }
    setBusy(false);
  }

  function updateLocal(key, value) {
    setItems((prev) => prev.map((item) => (item.id === selected.id ? { ...item, [key]: value } : item)));
  }

  if (!selected) {
    return <main className="p-8 text-zinc-200">국내용 글을 불러오는 중입니다.</main>;
  }

  const targetUrl = naverEditorTarget(selected);
  const imageReady = selected.images?.filter((img) => img.src).length || 0;

  return (
    <main className="mx-auto max-w-6xl p-6 text-zinc-100">
      <div className="mb-6">
        <div className="text-sm text-amber-300">ATLAS KOREA</div>
        <h1 className="text-3xl font-bold">국내용 제품 블로그 운영판</h1>
        <p className="mt-2 text-zinc-400">좋은 제품은 숨기지 않고 직접 추천합니다. 최종 승인 전에는 실제 발행하지 않습니다.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`w-full rounded-xl border p-4 text-left ${item.id === selected.id ? "border-amber-400 bg-zinc-900" : "border-zinc-800 bg-zinc-950"}`}
            >
              <div className="text-xs text-zinc-500">{STATE_LABEL[item.state] || item.state}</div>
              <div className="mt-1 font-semibold">{item.title || item.productName || item.id}</div>
              <div className="mt-2 text-xs text-zinc-500">{item.contentType === "existing_post_update" ? `기존글 ${item.logNo}` : "신규 제품글"}</div>
            </button>
          ))}
        </aside>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-zinc-500">{selected.blogId} · {selected.character === "miji" ? "미지" : "수호"}</div>
              <h2 className="text-2xl font-bold">{selected.title}</h2>
            </div>
            <span className="rounded-full border border-zinc-700 px-3 py-1 text-sm">{STATE_LABEL[selected.state] || selected.state}</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">제목
              <input className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3" value={selected.title} onChange={(e) => updateLocal("title", e.target.value)} />
            </label>
            <label className="text-sm">제품명
              <input className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3" value={selected.productName || ""} onChange={(e) => updateLocal("productName", e.target.value)} />
            </label>
            <label className="text-sm md:col-span-2">쿠팡 파트너스 링크
              <input className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3" value={selected.affiliateUrl || ""} onChange={(e) => updateLocal("affiliateUrl", e.target.value)} placeholder="실제 제휴 링크를 넣으면 본문 CTA와 함께 관리" />
            </label>
            <label className="text-sm md:col-span-2">본문
              <textarea className="mt-1 min-h-72 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3" value={selected.bodyText || ""} onChange={(e) => updateLocal("bodyText", e.target.value)} placeholder="국내용 직접 추천형 본문" />
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-zinc-800 p-4">
            <div className="font-semibold">본문 이미지</div>
            <div className="mt-3 space-y-2">
              {(selected.images || []).map((img) => (
                <div key={img.id} className="rounded-lg bg-zinc-900 p-3 text-sm">
                  <div className="font-medium">{img.alt}</div>
                  <div className="mt-1 text-zinc-500">배치: {img.placement || "미정"}</div>
                  <input
                    className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 p-2"
                    value={img.src || ""}
                    onChange={(e) => {
                      const images = selected.images.map((row) => row.id === img.id ? { ...row, src: e.target.value } : row);
                      updateLocal("images", images);
                    }}
                    placeholder="업로드된 이미지 URL 또는 로컬 연결 경로"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-zinc-500">연결 이미지 {imageReady}/{selected.images?.length || 0}</div>
          </div>

          <div className="mt-5 rounded-xl border border-zinc-800 p-4 text-sm">
            <div className="font-semibold">네이버 대상</div>
            <div className="mt-1 break-all text-zinc-400">{targetUrl}</div>
            <div className="mt-2 text-xs text-amber-300">이 주소는 편집 대상 계산용입니다. 승인 버튼은 네이버 발행 버튼을 누르지 않습니다.</div>
          </div>

          {message ? <div className="mt-4 rounded-lg bg-zinc-900 p-3 text-sm">{message}</div> : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button disabled={busy} onClick={() => patch("save", selected)} className="rounded-lg bg-zinc-800 px-4 py-3 font-semibold">저장</button>
            <button disabled={busy} onClick={() => patch("review", selected)} className="rounded-lg bg-sky-700 px-4 py-3 font-semibold">검수 대기로 보내기</button>
            <button disabled={busy || selected.state !== "ready_for_review"} onClick={() => patch("approve", selected)} className="rounded-lg bg-amber-600 px-4 py-3 font-semibold disabled:opacity-40">최종 발행 승인</button>
          </div>
        </section>
      </div>
    </main>
  );
}
