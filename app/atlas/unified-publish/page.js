"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const channels = [["korea_naver", "국내 Naver", "수호"], ["global_blogger", "해외 Blogger", "미지"]];
const button = "min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40";
const secondary = "min-h-11 rounded-lg border border-zinc-600 px-3 py-2 text-sm disabled:opacity-40";
const input = "mt-1 w-full min-w-0 rounded-lg border border-zinc-600 bg-zinc-950 p-2 text-base";
function dateText(value) { return value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인"; }

function Evidence({ product }) {
  const signals = product.signals || {};
  return <details className="min-w-0 text-xs text-zinc-400">
    <summary className="flex min-h-11 cursor-pointer items-center text-zinc-300">상세보기</summary>
    <div className="space-y-2 break-words pb-2">
      <p>인기 근거: {signals.popularity?.quote || "확인되지 않음"}</p>
      <p>할인 근거: {signals.discount?.quote || "정상가·할인율을 확인하지 못해 추정하지 않았습니다."}</p>
      {signals.quality && <p>출처의 편집자 선정: {signals.quality.quote}</p>}
      <p>제품 특징: {product.features.join(" · ")}</p>
      <p>가격 표기 원문: {product.evidence}</p>
      <a className="block text-emerald-300 underline" href={product.sourceUrl} target="_blank" rel="noreferrer">출처: {product.source}</a>
      {signals.popularity?.kind === "popular_feed" && <a className="block text-emerald-300 underline" href={signals.popularity.sourceUrl} target="_blank" rel="noreferrer">출처의 인기 목록 확인</a>}
      <p>확인 시각: {dateText(product.checkedAt)} (한국 시간)</p>
      <p>{product.priceNotice}</p>
      <p>공개 자료에서 선별한 후보이며, 시장 전체 판매량 순위나 품질 보증은 아닙니다.</p>
    </div>
  </details>;
}

function BlogReview({ draft, busy, act }) {
  const [form, setForm] = useState({ title: draft.title, bodyText: draft.bodyText, disclosure: draft.disclosure, productUrl: draft.productUrl });
  const [saved, setSaved] = useState(false);
  const editable = ["draft", "approved"].includes(draft.state);
  return <details open className="rounded-lg border border-zinc-700 p-3">
    <summary className="cursor-pointer font-medium">블로그 원고</summary>
    <fieldset disabled={busy || !editable} className="mt-3 space-y-3">
      {[["title", "제목"], ["bodyText", "본문"], ["disclosure", "제휴 고지"], ["productUrl", "상품·출처 링크"]].map(([key, label]) => <label key={key} className="block text-sm">{label}
        {key === "bodyText" ? <textarea rows={8} className={input} value={form[key]} onChange={(e) => { setSaved(false); setForm({ ...form, [key]: e.target.value }); }} />
          : <input className={input} value={form[key]} onChange={(e) => { setSaved(false); setForm({ ...form, [key]: e.target.value }); }} />}
      </label>)}
      <button className={button} onClick={async () => { if (await act({ action: "save", id: draft.id, ...form })) setSaved(true); }}>원고 저장</button>
      {saved && <p role="status" className="text-sm text-emerald-300">원고를 저장했습니다.</p>}
    </fieldset>
  </details>;
}

function Materials({ product, draft, busy, act }) {
  return <section aria-label={`${product.name} 제작자료`} className="space-y-3 rounded-xl bg-zinc-950 p-3">
    <h3 className="text-sm font-semibold text-emerald-300">선택한 상품으로 준비하기</h3>
    <div className="grid grid-cols-2 gap-2">
      <button className={button} disabled={busy} onClick={() => act({ action: "prepareBlog", id: product.id })}>블로그 준비</button>
      <button className={secondary} disabled={busy} onClick={() => act({ action: "prepareShorts", id: product.id })}>쇼핑 연결자료 준비</button>
    </div>
    {(draft?.prepared?.blog || draft?.prepared?.shorts) && <div className="flex items-center gap-3 text-xs text-zinc-300">
      <Image src={`/${draft.masterAssetPath.replace(/^public\//, "")}`} alt={`${draft.character === "miji" ? "미지" : "수호"} 자동 연결 이미지`} width={64} height={64} className="h-16 w-16 rounded object-contain" />
      <p>{draft.character === "miji" ? "미지" : "수호"} 이미지 자동 연결<br />진행자 이미지이며 제품 사진은 아닙니다.</p>
    </div>}
    {draft?.prepared?.blog && <BlogReview key={`${draft.id}:${draft.product.checkedAt}`} draft={draft} busy={busy} act={act} />}
    {draft?.prepared?.shorts && <details className="rounded-lg border border-zinc-700 p-3" open>
      <summary className="cursor-pointer font-medium">쇼핑 연결자료</summary>
      <p className="my-3 whitespace-pre-wrap break-words text-sm text-zinc-300">{draft.shorts.script}</p>
      <p className="text-xs text-zinc-400">영상 제작·렌더·업로드는 별도 쇼츠 프로젝트에서 처리합니다. ATLAS는 상품·이미지·링크·요약 연결자료만 준비합니다.</p>
    </details>}
  </section>;
}

export default function UnifiedPublish() {
  const [data, setData] = useState({ channels: {}, drafts: {}, results: {} });
  const [selected, setSelected] = useState({});
  const [active, setActive] = useState("korea_naver");
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
  return <main className="mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-6 sm:py-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold sm:text-3xl">ATLAS 국내·해외 운영</h1><p className="mt-1 text-sm text-zinc-400">국내는 TOP5 상품형 · 해외는 여행 정보형 Publisher 원고로 운영합니다.</p></div>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => act({ action: "preparePair" })}>{busy ? "준비 중…" : "국내 다음글 준비"}</button><button className={secondary} disabled={busy} onClick={() => act({ action: "refresh" })}>오늘 TOP5 업데이트</button></div>
    </header>
    {message && <p role="alert" className="text-sm text-amber-300">{message}</p>}
    <div className="sticky top-0 z-10 grid grid-cols-2 gap-2 bg-zinc-950 py-2 lg:hidden" aria-label="채널 선택">
      {channels.map(([id, title]) => <button key={id} aria-pressed={active === id} className={active === id ? button : secondary} onClick={() => setActive(id)}>{title}</button>)}
    </div>
    <div className="grid items-start gap-5 lg:grid-cols-2">{channels.map(([id, title, character]) => <section key={id} aria-label={title} className={`${active === id ? "block" : "hidden lg:block"} min-w-0 space-y-3`}>
      <h2 className="text-lg font-semibold">{title} TOP5 <span className="text-sm font-normal text-zinc-400">· {character}</span></h2>{id === "global_blogger" && <div className="rounded-lg border border-amber-800 bg-amber-950/20 p-3 text-xs text-amber-100">아래 해외 상품 TOP5는 참고용입니다. 실제 해외 다음 글은 여행 정보형 원고를 우선합니다. <a className="font-semibold underline" href="/publisher">Publisher에서 art_021 검수·발행</a></div>}
      {data.channels[id]?.error && <p className="text-sm text-amber-200">{data.channels[id].error}</p>}
      {Array.from({ length: 5 }, (_, i) => {
        const p = data.channels[id]?.slots[i];
        return <article key={p?.id || i} data-slot={id} className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4">
          {p ? <>
            <div className="flex items-start justify-between gap-2"><h3 className="line-clamp-2 min-w-0 text-sm font-semibold sm:text-base" title={p.name}>{p.name}</h3><span data-badge className="shrink-0 rounded bg-emerald-950 px-2 py-1 text-xs text-emerald-300">{p.badge}</span></div>
            <p className="mt-2 font-semibold">{p.priceText}{p.discountPercent !== null && p.discountPercent !== undefined && <span className="ml-2 text-sm text-rose-300">{p.discountPercent}% 할인</span>}</p>
            <p className="mt-1 truncate text-xs text-zinc-300 sm:text-sm" title={p.reason}>{p.reason}</p>
            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><Evidence product={p} /><button className={secondary} aria-pressed={selected[id] === p.id} disabled={busy} onClick={() => setSelected({ ...selected, [id]: selected[id] === p.id ? "" : p.id })}>선택</button></div>
            {selected[id] === p.id && <Materials product={p} draft={data.drafts[p.id]} busy={busy} act={act} />}
          </> : <div className="flex min-h-24 items-center justify-between gap-3"><h3 className="text-sm">{i + 1}. 근거를 확인하고 있어요</h3><span className="text-xs text-zinc-500">확인 후 표시</span></div>}
        </article>;
      })}
      {id === "korea_naver" && data.recovery?.korea_naver?.message && <p className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-300">{data.recovery.korea_naver.message}</p>}
      <details className="rounded-xl border border-zinc-800 p-3 text-sm">
        <summary className="cursor-pointer">저장한 자료·발행 결과</summary>
        <div className="mt-3 space-y-3">
          {Object.values(data.drafts).filter((d) => d.channelId === id && (d.prepared?.blog || d.prepared?.shorts)).map((draft) => <details key={draft.id}><summary className="cursor-pointer">{draft.product.name}</summary><Materials product={draft.product} draft={draft} busy={busy} act={act} /></details>)}
          {Object.values(data.results?.[id] || {}).map((result) => <a className="block break-words text-emerald-300 underline" key={result.publishedUrl} href={result.publishedUrl} target="_blank" rel="noreferrer">{result.product.name} · 발행 글 보기</a>)}
          {Object.values(data.archives || {}).flat().filter((draft) => draft.channelId === id).map((draft, index) => <details key={`${draft.id}:${index}`}><summary className="cursor-pointer">이전 원고 · {draft.title}</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-400">{draft.bodyText}</p></details>)}
          <button className={secondary} disabled={busy} onClick={() => act({ action: "reconcile", channel: id })}>발행 결과 다시 확인</button>
          {data.recovery?.[id]?.message && <p>{data.recovery[id].message}</p>}
          <p className="text-xs text-zinc-400">확인된 결과와 주소를 보존합니다. 여기서는 실제 발행하지 않습니다.</p>
        </div>
      </details>
    </section>)}</div>
  </main>;
}
