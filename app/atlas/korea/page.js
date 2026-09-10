"use client";

import { useEffect, useMemo, useState } from "react";
import { naverEditorTarget } from "@/lib/atlas/korea-product-pipeline";

async function draftsApi(options = {}) {
  const res = await fetch("/api/atlas/korea-drafts", { cache: "no-store", ...options });
  return res.json().catch(() => ({}));
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
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
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [doctor, setDoctor] = useState(null);

  async function load() {
    const data = await draftsApi();
    const next = data.items || [];
    setItems(next);
    if (!selectedId && next[0]) setSelectedId(next[0].id);
  }

  async function checkDoctor() {
    try {
      const res = await fetch("/api/atlas/korea-doctor", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setDoctor(data);
      return data;
    } catch (error) {
      const data = { ok: false, error: String(error?.message || error) };
      setDoctor(data);
      return data;
    }
  }

  useEffect(() => {
    load();
    checkDoctor();
  }, []);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId],
  );

  async function patch(action, patch = {}) {
    if (!selected) return null;
    const res = await fetch("/api/atlas/korea-drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, action, patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== "ok") throw new Error(data.error || (data.issues || []).join(", ") || "처리하지 못했습니다.");
    await load();
    return data.draft;
  }

  function updateLocal(key, value) {
    setItems((prev) => prev.map((item) => (item.id === selected.id ? { ...item, [key]: value } : item)));
  }

  async function save() {
    setBusy("save");
    setMessage("");
    try {
      await patch("save", selected);
      setMessage("저장했습니다.");
    } catch (e) { setMessage(e.message); }
    setBusy("");
  }

  async function ensureAutomationReady() {
    const health = await checkDoctor();
    if (!health?.ok) {
      const details = health?.issues?.join(", ") || health?.error || "네이버 자동화 환경 점검 실패";
      throw new Error(`자동화 준비가 필요합니다: ${details}`);
    }
  }

  async function autoBuildAndStage() {
    if (!selected) return;
    setBusy("auto");
    setMessage("ATLAS가 국내용 글을 자동 준비하고 네이버 편집기에 반영 중입니다.");
    try {
      await ensureAutomationReady();
      await patch("save", selected);
      const generated = await postJson("/api/atlas/korea-generate", { id: selected.id });
      if (!generated.ok && generated.data.status !== "skipped") throw new Error(generated.data.error || "자동 본문 제작 실패");
      const staged = await postJson("/api/atlas/korea-publish", { id: selected.id, mode: "stage" });
      if (!staged.ok) throw new Error(staged.data.error || "네이버 자동 반영 실패");
      if (staged.data.status === "login_required") {
        setMessage("ATLAS 전용 Edge가 열렸습니다. 네이버 로그인은 최초 1회만 필요하며 이후 세션을 재사용합니다.");
      } else {
        setMessage("자동 제작·네이버 반영 완료. 실제 발행은 최종 승인 전이라 멈춰 있습니다.");
      }
      await load();
    } catch (e) {
      setMessage(e.message);
      await load();
    }
    setBusy("");
  }

  async function approveAndPublish() {
    if (!selected) return;
    setBusy("publish");
    setMessage("최종 승인 처리 후 네이버에 실제 발행 중입니다.");
    try {
      await ensureAutomationReady();
      if (selected.state !== "ready_for_review") await patch("review", selected);
      await patch("approve", selected);
      const published = await postJson("/api/atlas/korea-publish", { id: selected.id, mode: "publish" });
      if (!published.ok) throw new Error(published.data.error || "네이버 발행 실패");
      if (published.data.status === "login_required") {
        setMessage("최초 네이버 로그인 필요. 로그인 후 같은 발행 버튼을 다시 누르면 승인 상태를 유지한 채 이어서 발행합니다.");
      } else {
        setMessage("네이버 발행 완료.");
      }
      await load();
    } catch (e) {
      setMessage(e.message);
      await load();
    }
    setBusy("");
  }

  if (!selected) return <main className="p-8 text-zinc-200">국내용 글을 불러오는 중입니다.</main>;

  const targetUrl = naverEditorTarget(selected);
  const imageReady = selected.images?.filter((img) => img.src).length || 0;
  const imageTotal = selected.images?.length || 0;
  const stageBlocked = imageTotal > 0 && imageReady !== imageTotal;
  const automationReady = Boolean(doctor?.ok);

  return (
    <main className="mx-auto max-w-6xl p-6 text-zinc-100">
      <div className="mb-6">
        <div className="text-sm text-amber-300">ATLAS KOREA · NAVER AUTOMATION</div>
        <h1 className="text-3xl font-bold">국내용 제품 블로그 자동 운영판</h1>
        <p className="mt-2 text-zinc-400">제품 선정 → 추천형 본문 → 이미지 → 제휴 링크 → 네이버 편집기 반영까지 자동. 실제 공개는 최종 승인 뒤에만 실행합니다.</p>
      </div>

      <div className={`mb-6 rounded-xl border p-4 ${automationReady ? "border-emerald-800 bg-emerald-950/20" : "border-amber-800 bg-amber-950/20"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">네이버 자동화 상태: {doctor === null ? "점검 중" : automationReady ? "준비 완료" : "점검 필요"}</div>
            <div className="mt-1 text-sm text-zinc-400">
              {doctor?.browserPath ? `브라우저: ${doctor.browserPath}` : doctor?.issues?.join(" · ") || doctor?.error || "Edge와 전용 로그인 프로필을 확인합니다."}
            </div>
          </div>
          <button disabled={Boolean(busy)} onClick={checkDoctor} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold disabled:opacity-40">다시 점검</button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {items.map((item) => (
            <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-4 text-left ${item.id === selected.id ? "border-amber-400 bg-zinc-900" : "border-zinc-800 bg-zinc-950"}`}>
              <div className="text-xs text-zinc-500">{STATE_LABEL[item.state] || item.state} · {item.automationStatus || "대기"}</div>
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
            <label className="text-sm">제목<input className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3" value={selected.title} onChange={(e) => updateLocal("title", e.target.value)} /></label>
            <label className="text-sm">제품명<input className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3" value={selected.productName || ""} onChange={(e) => updateLocal("productName", e.target.value)} /></label>
            <label className="text-sm md:col-span-2">쿠팡 파트너스 링크<input className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3" value={selected.affiliateUrl || ""} onChange={(e) => updateLocal("affiliateUrl", e.target.value)} placeholder="실제 제휴 링크만 입력" /></label>
            <label className="text-sm md:col-span-2">본문<textarea className="mt-1 min-h-72 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3" value={selected.bodyText || ""} onChange={(e) => updateLocal("bodyText", e.target.value)} placeholder={selected.updateMode === "images_only" ? "기존 네이버 본문 보존 모드" : "ATLAS 자동 생성 본문"} /></label>
          </div>

          <div className="mt-5 rounded-xl border border-zinc-800 p-4">
            <div className="font-semibold">본문 이미지 자동 연결</div>
            <div className="mt-3 space-y-2">
              {(selected.images || []).map((img) => (
                <div key={img.id} className="rounded-lg bg-zinc-900 p-3 text-sm">
                  <div className="font-medium">{img.alt}</div>
                  <div className="mt-1 text-zinc-500">배치: {img.placement || "미정"}</div>
                  <input className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 p-2" value={img.src || ""} onChange={(e) => {
                    const images = selected.images.map((row) => row.id === img.id ? { ...row, src: e.target.value } : row);
                    updateLocal("images", images);
                  }} placeholder="로컬 이미지 파일 경로" />
                </div>
              ))}
            </div>
            <div className={`mt-3 text-xs ${stageBlocked ? "text-amber-300" : "text-zinc-500"}`}>연결 이미지 {imageReady}/{imageTotal}{stageBlocked ? " · 이미지가 모두 연결되어야 네이버 자동 반영합니다." : ""}</div>
          </div>

          <div className="mt-5 rounded-xl border border-zinc-800 p-4 text-sm">
            <div className="font-semibold">네이버 자동화 대상</div>
            <div className="mt-1 break-all text-zinc-400">{targetUrl}</div>
            <div className="mt-2 text-xs text-zinc-500">ATLAS 전용 Edge 프로필을 사용하므로 로그인 세션을 재사용합니다. 비밀번호는 ATLAS 데이터에 저장하지 않습니다.</div>
          </div>

          {message ? <div className="mt-4 rounded-lg bg-zinc-900 p-3 text-sm">{message}</div> : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button disabled={Boolean(busy)} onClick={save} className="rounded-lg bg-zinc-800 px-4 py-3 font-semibold disabled:opacity-40">저장</button>
            <button disabled={Boolean(busy) || stageBlocked || !automationReady} onClick={autoBuildAndStage} className="rounded-lg bg-sky-700 px-4 py-3 font-semibold disabled:opacity-40">자동 제작 → 네이버 반영</button>
            <button disabled={Boolean(busy) || stageBlocked || !automationReady || selected.state === "published"} onClick={approveAndPublish} className="rounded-lg bg-amber-600 px-4 py-3 font-semibold disabled:opacity-40">최종 승인 → 네이버 발행</button>
          </div>
        </section>
      </div>
    </main>
  );
}
