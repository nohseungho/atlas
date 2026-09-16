"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { KEYS, readList, writeList } from "@/app/atlas/lib/storage";

const channels = [["korea_naver", "국내 Naver", "수호"], ["global_blogger", "해외 Blogger", "미지"]];
const labels = { title: "제목", body: "본문", images: "이미지·사용 권한·캐릭터", disclosure: "제휴 고지", links: "링크·가격 근거" };
const button = "rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-40 disabled:cursor-not-allowed";
const input = "w-full rounded border border-zinc-600 bg-zinc-900 p-2";

function Review({ draft, busy, act }) {
  const [form, setForm] = useState({ title: draft.title, bodyText: draft.bodyText, disclosure: draft.disclosure, productUrl: draft.productUrl, useMaster: !!draft.images.length, imageUrl: draft.images[0]?.src || "" });
  const [checks, setChecks] = useState({});
  const [dirty, setDirty] = useState(false);
  const locked = !["draft", "approved"].includes(draft.state);
  const update = (key, value) => { setForm((p) => ({ ...p, [key]: value })); setDirty(true); setChecks({}); };
  function shorts() {
    const p = draft.product;
    const product = draft.shorts.product;
    writeList(KEYS.products, [...readList(KEYS.products).filter((row) => row.id !== p.id), product]);
    window.location.assign(`/atlas/shorts-studio?productId=${encodeURIComponent(p.id)}`);
  }
  return <section className="mt-4 space-y-3 rounded-xl border border-zinc-700 p-4">
    <h3 className="font-semibold">원고 최종 점검 · {draft.character === "suho" ? "수호" : "미지"}</h3>
    <p className="text-sm">상태: {draft.state}</p>
    {draft.publishedUrl && <a className="text-emerald-300 underline" href={draft.publishedUrl} target="_blank" rel="noreferrer">발행 결과 보기</a>}
    {draft.error && <p role="alert" className="text-amber-300">{draft.error}</p>}
    <fieldset disabled={locked || busy} className="space-y-3">
      {[["title", "제목"], ["bodyText", "본문"], ["disclosure", "제휴 고지"], ["productUrl", "출처/상품 링크"]].map(([key, label]) => <label key={key} className="block text-sm">{label}{key === "bodyText" ? <textarea rows={10} className={input} value={form[key]} onChange={(e) => update(key, e.target.value)} /> : <input className={input} value={form[key]} onChange={(e) => update(key, e.target.value)} />}</label>)}
      <Image src={`/${draft.masterAssetPath.replace(/^public\//, "")}`} alt={`${draft.character} 캐릭터 기준`} width={100} height={100} className="h-24 w-24 object-contain" />
      {draft.channelId === "korea_naver" ? <label className="block"><input type="checkbox" checked={form.useMaster} onChange={(e) => update("useMaster", e.target.checked)} /> 수호 마스터 이미지를 본문에 사용</label> : <label className="block text-sm">기존 해외 미지 이미지 URL (atlas/articles)<input className={input} value={form.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} /></label>}
      {draft.channelId === "global_blogger" && form.imageUrl && <a href={form.imageUrl} target="_blank" rel="noreferrer" className="text-emerald-300 underline">발행 이미지 열어 확인</a>}
      <button className={button} onClick={async () => { if (await act({ action: "save", id: draft.id, ...form })) setDirty(false); }}>원고 저장</button>
      <p className="text-sm text-zinc-400">저장 후 아래 항목을 점검하세요. 수정하면 승인이 해제됩니다.</p>
      {Object.entries(labels).map(([key, label]) => <label key={key} className="block text-sm"><input type="checkbox" disabled={dirty} checked={!!checks[key]} onChange={(e) => setChecks({ ...checks, [key]: e.target.checked })} /> {label} 확인</label>)}
      <button className={button} disabled={dirty || !Object.keys(labels).every((key) => checks[key])} onClick={() => act({ action: "approve", id: draft.id, checks })}>최종 점검 승인</button>
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={busy || dirty || draft.state !== "approved"} onClick={() => { if (window.confirm(`${draft.title}\n신규 글을 실제 발행합니다. 최종 점검한 내용으로 진행할까요?`)) act({ action: "publish", id: draft.id }); }}>신규 글 발행</button>
      <button className={button} disabled={busy || dirty} onClick={shorts}>같은 상품으로 쇼핑쇼츠 제작</button>
    </div>
  </section>;
}

export default function UnifiedPublish() {
  const [data, setData] = useState({ channels: {}, drafts: {} });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/atlas/unified-publish").then((r) => { if (!r.ok) throw new Error("자료 로드 실패"); return r.json(); }).then(setData).catch((e) => setMessage(e.message)); }, []);
  async function act(body) {
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/atlas/unified-publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const value = await res.json(); if (!res.ok) throw new Error(value.error || "작업 실패");
      setData(value); return true;
    } catch (e) { setMessage(e.message); return false; } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
    <header className="space-y-3"><h1 className="text-3xl font-bold">오늘의 상품 TOP5 선택</h1>
      <p className="text-zinc-300">국내 Naver와 해외 Blogger · 상품 선택 → 원고·쇼츠 준비 → 점검 승인 → 신규 발행</p>
      <p className="text-sm text-zinc-400">무료 공개 할인정보의 최근 72시간 후보입니다. 판매량·최저가·인기 순위는 검증되지 않았으며, 출처 순서로 최대 5개를 표시합니다.</p>
      <button className={button} disabled={busy} onClick={() => act({ action: "refresh" })}>{busy ? "처리 중…" : "오늘 자료 업데이트"}</button>
      <p role="status" aria-live="polite">{message}</p>
    </header>
    <div className="grid gap-6 lg:grid-cols-2">{channels.map(([id, title, character]) => <section key={id} aria-label={title} className="space-y-3">
      <h2 className="text-xl font-semibold">{title} TOP5 · {character}</h2>
      <p className="text-sm text-amber-200">{data.channels[id]?.error}</p>
      {Array.from({ length: 5 }, (_, i) => {
        const p = data.channels[id]?.slots[i];
        return <article key={i} data-slot={id} className="space-y-2 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <h3 className="font-semibold">{i + 1}. {p?.name || "확인된 상품 대기"}</h3>
          {p ? <><p>{p.features.join(" · ")}</p><p className="text-sm">선정 이유: {p.reason}</p><p>{p.priceText}</p><p className="text-xs text-zinc-400">{p.priceNotice}</p>
            <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="text-emerald-300 underline">출처: {p.source}</a><p className="text-xs">확인시각: {p.checkedAt}</p>
            <button className={button} disabled={busy} onClick={() => act({ action: "prepare", id: p.id })}>선택 · 원고와 쇼츠 준비</button>
          </> : <p className="text-sm text-zinc-400">실제 근거를 수집하면 이 슬롯에 표시됩니다.</p>}
        </article>;
      })}
      {Object.values(data.drafts).filter((d) => d.channelId === id).map((d) => <Review key={`${d.id}:${d.product.checkedAt}`} draft={d} busy={busy} act={act} />)}
    </section>)}</div>
  </main>;
}
