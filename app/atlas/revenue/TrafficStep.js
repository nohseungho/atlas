"use client";

import { useEffect, useState } from "react";

// 6단계 “트래픽 배포” 화면. 발행된 글 하나를 Google과 Pinterest에 노출시키기 위한
// 자료를 보여주고, 사용자가 직접 확인한 결과만 저장한다. 자동 게시·자동 색인·
// 자동 수집은 없다. 개발 용어 대신 무엇을 어디에 붙여넣는지를 한글로 적는다.

const PIN_FIELDS = [
  ["impressions", "노출"],
  ["saves", "저장"],
  ["pinClicks", "핀 클릭"],
  ["outboundClicks", "외부 클릭"],
];
const GOOGLE_FIELDS = [
  ["impressions", "검색 노출"],
  ["clicks", "검색 클릭"],
];
const SEARCH_LABEL = { unchecked: "확인 전", indexed: "색인됨", not_indexed: "색인 안 됨" };

// 화면에 보이는 문자열을 그대로 클립보드에 넣는다. 이 화면의 모든 복사 버튼이
// 이 함수 하나만 쓴다.
//
// navigator.clipboard 는 보안 컨텍스트에서만 존재하고, 있어도 문서가 포커스를
// 잃은 상태 등에서는 거부한다. 그래서 실패하면 textarea + execCommand('copy')로
// 한 번 더 시도한다. 성공을 확인했을 때만 true를 돌려준다 — 실패를 "복사됨"으로
// 표시하지 않기 위해서다.
export async function copyText(value) {
  const text = String(value ?? "");
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 아래 fallback으로 넘어간다.
    }
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;

  const active = document.activeElement;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  // 화면에 보이지 않으면서도 선택은 가능해야 한다. display:none 이면 선택이 안 된다.
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  document.body.appendChild(ta);
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    ta.remove();
    if (active && typeof active.focus === "function") active.focus();
  }
}

function CopyButton({ value, label = "복사", onCopied }) {
  // { ok, at } — 누를 때마다 새 객체라서 연속으로 눌러도 안내가 다시 뜬다.
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={async () => {
          const ok = await copyText(value);
          setFeedback({ ok, at: Date.now() });
          onCopied?.(ok ? "복사했습니다." : "복사하지 못했습니다. 다시 눌러주세요.");
        }}
        className="shrink-0 rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
      >
        {label}
      </button>
      {/* 버튼 바로 옆에서 결과를 알린다. 화면 맨 위 안내만으로는 눌러도 아무
          반응이 없는 것처럼 보였다. */}
      {feedback?.ok === true && <span className="text-[11px] font-semibold text-emerald-400">복사됨</span>}
      {feedback?.ok === false && (
        <span className="text-[11px] font-semibold text-rose-400">복사하지 못했습니다. 다시 눌러주세요.</span>
      )}
    </span>
  );
}

function Field({ label, value, onCopied, mono }) {
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-zinc-400">{label}</span>
        <CopyButton value={value} onCopied={onCopied} />
      </div>
      <p className={`mt-1 whitespace-pre-wrap break-words rounded bg-zinc-950 px-2 py-1 text-xs text-zinc-200 ${mono ? "font-mono text-[11px]" : ""}`}>
        {value || "-"}
      </p>
    </div>
  );
}

function num(v) {
  return v === null || v === undefined || v === "" ? "" : String(v);
}

async function fetchState(articleId) {
  const res = await fetch(`/api/atlas/traffic?articleId=${encodeURIComponent(articleId)}`, { cache: "no-store" });
  return res.json().catch(() => ({}));
}

export default function TrafficStep({ articleId }) {
  const [state, setState] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState({ status: "unchecked", checkedAt: "", note: "" });
  const [metrics, setMetrics] = useState({ day7: null, day30: null });
  const [postForm, setPostForm] = useState({}); // { [variantId]: { postedAt, pinUrl } }

  // 저장된 기록은 서버에서 읽어온다 — 새로고침해도 확인 결과와 성과가 남는다.
  useEffect(() => {
    let alive = true;
    async function load() {
      const data = await fetchState(articleId);
      if (!alive) return;
      setState(data);
      if (data.record) {
        setSearch(data.record.search || { status: "unchecked", checkedAt: "", note: "" });
        setMetrics(data.record.metrics || { day7: null, day30: null });
      }
    }
    if (articleId) load();
    return () => {
      alive = false;
    };
  }, [articleId]);

  // 저장 → 서버에서 되읽기 → 화면 갱신. 되읽은 값이 방금 보낸 값과 다르면
  // 성공 메시지를 띄우지 않는다. "저장했습니다"는 파일에 남았을 때만 하는 말이다.
  async function saveAndReload(payload, key, { verify, okText }) {
    setBusy(key);
    setNote("");
    let data;
    try {
      const res = await fetch("/api/atlas/traffic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, ...payload }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      setNote("저장하지 못했습니다: 서버에 연결하지 못했습니다.");
      setBusy("");
      return;
    }
    if (data?.status !== "ok") {
      setNote(`저장하지 못했습니다: ${(data?.errors || []).join(" · ") || data?.errorCode || "알 수 없는 이유"}`);
      setBusy("");
      return;
    }

    const fresh = await fetchState(articleId);
    if (fresh?.status !== "ok" || !fresh.record) {
      setNote("저장 결과를 다시 읽지 못했습니다. 화면을 새로고침해 상태를 확인하세요.");
      setBusy("");
      return;
    }
    setState(fresh);
    setSearch(fresh.record.search || { status: "unchecked", checkedAt: "", note: "" });
    setMetrics(fresh.record.metrics || { day7: null, day30: null });
    setNote(verify(fresh) ? okText : "저장한 값이 다시 읽은 결과와 달라 저장에 실패했습니다. 다시 시도해 주세요.");
    setBusy("");
  }

  // Pinterest 등록 완료 표시는 사람이 누른 것만 저장한다.
  function savePosted(variantId, state) {
    return saveAndReload({ action: "posted", variantId, state }, `post-${variantId}`, {
      verify: (fresh) => Boolean(fresh.record.posted?.[variantId]?.posted) === Boolean(state),
      okText: state ? "Pinterest 등록 완료로 표시했습니다." : "등록 완료 표시를 취소했습니다. 기록은 남아 있습니다.",
    });
  }

  function setMetricValue(period, group, field, value) {
    setMetrics((prev) => {
      const base = prev[period] || { pins: {}, google: null };
      const next = { pins: { ...(base.pins || {}) }, google: { ...(base.google || {}) } };
      if (group === "google") next.google = { ...next.google, [field]: value };
      else next.pins[group] = { ...(next.pins[group] || {}), [field]: value };
      return { ...prev, [period]: next };
    });
  }

  if (!state) return <p className="text-sm text-zinc-500">불러오는 중...</p>;
  if (state.status !== "ok") {
    return <p className="text-sm text-zinc-500">{state.reason || "블로그 발행 후 사용할 수 있습니다."}</p>;
  }

  const kit = state.kit;
  const allText = (v) =>
    [
      `[제목] ${v.title}`,
      `[이미지 문구] ${v.overlay}`,
      `[설명] ${v.description}`,
      `[해시태그] ${v.hashtags.join(" ")}`,
      `[블로그 주소] ${v.link}`,
      `[권장 등록일] ${v.suggestedDate}`,
      v.image?.url ? `[이미지] ${v.image.url}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        발행된 글을 사람들이 찾아오게 만드는 단계입니다. 아래 자료를 복사해 Pinterest와 기존 글에 직접 붙여넣고, 확인한 결과만 여기에
        적어 두면 됩니다. ATLAS가 대신 올리거나 클릭을 만들지 않습니다.
      </p>
      {note && (
        <p
          className={`rounded-lg px-3 py-2 text-xs ${
            /하지 못했|실패/.test(note) ? "bg-rose-950/40 text-rose-300" : "bg-emerald-950/40 text-emerald-300"
          }`}
        >
          {note}
        </p>
      )}

      {/* ── A. Pinterest 홍보자료 3종 ── */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-200">A. Pinterest에 올릴 홍보자료 3종</h3>
        <p className="mt-1 text-xs text-zinc-500">
          같은 글을 서로 다른 각도(질문 · 실수 · 체크리스트)로 소개합니다. 문구는 모두 이 글의 본문에서 가져왔습니다. 하루에 몰아 올리지
          말고 권장 등록일에 한 장씩 올리세요. 올린 뒤에는 <b className="text-zinc-300">“Pinterest에 등록 완료”</b>를 눌러 두어야 같은 핀을
          두 번 올리지 않습니다 — ATLAS는 Pinterest를 대신 확인하지 못합니다.
        </p>
        {kit.nextUnposted ? (
          <p className="mt-2 rounded-lg border border-sky-900 bg-sky-950/30 px-3 py-2 text-xs text-sky-200">
            다음에 올릴 핀: <b>{kit.nextUnposted.order}. {kit.nextUnposted.label}</b> · 권장 등록일 {kit.nextUnposted.suggestedDate}
          </p>
        ) : (
          <p className="mt-2 rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
            3종을 모두 등록했습니다. 더 올릴 핀이 없습니다.
          </p>
        )}
        <div className="mt-3 space-y-3">
          {kit.variants.map((v) => (
            <div key={v.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-rose-900/60 px-2 py-0.5 text-[11px] font-semibold text-rose-200">
                  {v.order}. {v.label}
                </span>
                {v.posting?.posted ? (
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                    Pinterest 등록 완료 · {v.posting.postedAt}
                  </span>
                ) : (
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">등록 전</span>
                )}
                <span className="text-[11px] text-zinc-500">권장 등록일 {v.suggestedDate}</span>
                <span className="ml-auto">
                  <CopyButton value={allText(v)} label="전체 복사" onCopied={setNote} />
                </span>
              </div>
              {v.posting?.posted ? (
                <div className="mt-2 rounded border border-emerald-900 bg-emerald-950/30 px-2 py-1.5 text-[11px] text-emerald-300">
                  <p>
                    <b>이미 Pinterest에 올린 핀입니다 — 다시 게시하지 마세요.</b> 같은 글을 반복해서 올리면 스팸으로 처리될 수 있습니다.
                    복사 버튼은 수정·확인용으로 그대로 둡니다.
                  </p>
                  {v.posting.pinUrl && (
                    <a href={v.posting.pinUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sky-300 underline">
                      등록한 핀 열기: {v.posting.pinUrl}
                    </a>
                  )}
                  <p className="mt-1 text-zinc-400">
                    {kit.nextUnposted
                      ? `다음에 올릴 핀: ${kit.nextUnposted.order}. ${kit.nextUnposted.label} · 권장 등록일 ${kit.nextUnposted.suggestedDate}`
                      : "3종을 모두 등록했습니다. 이제 7일·30일 성과만 적어 두세요."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`${v.order}. ${v.label} 의 등록 완료 표시를 취소할까요? 표시만 되돌리고 기록은 남습니다.`)) return;
                      savePosted(v.id, false);
                    }}
                    disabled={!!busy}
                    className="mt-2 rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    {busy === `post-${v.id}` ? "처리 중..." : "완료 취소"}
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-end gap-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5">
                  <label className="text-[11px] text-zinc-400">
                    실제 등록일
                    <input
                      type="date"
                      value={postForm[v.id]?.postedAt || ""}
                      onChange={(e) => setPostForm({ ...postForm, [v.id]: { ...postForm[v.id], postedAt: e.target.value } })}
                      className="mt-0.5 block rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100"
                    />
                  </label>
                  <label className="flex-1 text-[11px] text-zinc-400">
                    Pinterest 핀 주소 (선택)
                    <input
                      value={postForm[v.id]?.pinUrl || ""}
                      onChange={(e) => setPostForm({ ...postForm, [v.id]: { ...postForm[v.id], pinUrl: e.target.value } })}
                      placeholder="https://www.pinterest.com/pin/..."
                      className="mt-0.5 block w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => savePosted(v.id, { posted: true, ...(postForm[v.id] || {}) })}
                    disabled={!!busy}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {busy === `post-${v.id}` ? "저장 중..." : "Pinterest에 등록 완료"}
                  </button>
                </div>
              )}
              <div className="mt-2 grid gap-3 sm:grid-cols-[160px_1fr]">
                {v.image?.url ? (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.image.url} alt={`${v.title} 핀 미리보기`} className="w-full rounded border border-zinc-800" />
                    <a
                      href={v.image.downloadUrl || v.image.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-center text-[11px] text-sky-300 underline"
                    >
                      이미지 내려받기
                    </a>
                    <p className="mt-1 text-center text-[10px] text-zinc-600">본문 이미지 {v.imageSource || "-"}</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-300">이미지를 만들 수 없어 문구만 제공합니다.</p>
                )}
                <div>
                  <Field label="Pinterest 제목" value={v.title} onCopied={setNote} />
                  <Field label="이미지에 넣을 문구" value={v.overlay} onCopied={setNote} />
                  <Field label="설명" value={v.description} onCopied={setNote} />
                  <Field label="해시태그" value={v.hashtags.join(" ")} onCopied={setNote} />
                  <Field label="블로그 주소" value={v.link} onCopied={setNote} mono />
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">
          Pinterest 자동 로그인·자동 게시·예약 게시는 하지 않습니다. 위 자료로 직접 업로드하세요.
        </p>
      </section>

      {/* ── B. 기존 글에 넣을 링크 ── */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-200">B. 기존 글에서 이 글로 연결하기</h3>
        <p className="mt-1 text-xs text-zinc-500">
          이미 발행된 글 중 내용이 가까운 글입니다. 아래 문장을 해당 글의 관련 문단 아래에 직접 붙여넣으세요. ATLAS가 기존 글을 자동으로
          수정하지 않습니다.
        </p>
        <div className="mt-3 space-y-2">
          {kit.internalLinks.map((c) => (
            <div key={c.articleId} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-sm text-zinc-200">{c.title}</p>
              <div className="mt-1 flex items-center gap-2">
                <a href={c.url} target="_blank" rel="noreferrer" className="break-all text-[11px] text-sky-300 underline">
                  {c.url}
                </a>
                <CopyButton value={c.url} label="주소 복사" onCopied={setNote} />
              </div>
              <Field label="넣을 문장" value={c.sentence} onCopied={setNote} />
              <Field label="링크 글자" value={c.anchor} onCopied={setNote} />
              <Field label="붙여넣을 HTML" value={c.html} onCopied={setNote} mono />
            </div>
          ))}
          {kit.internalLinks.length === 0 && (
            <p className="text-xs text-zinc-500">내용이 가까운 기존 글이 없습니다. 억지로 연결하지 않습니다.</p>
          )}
        </div>
      </section>

      {/* ── C. Google 노출 확인 ── */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-200">C. Google에 올라갔는지 확인</h3>
        <p className="mt-1 text-xs text-zinc-500">
          아래 주소를 복사해 Google Search Console의 맨 위 “URL 검사” 칸에 붙여넣고 결과를 직접 확인한 뒤, 본 대로 골라 저장하세요.
          ATLAS는 색인 여부를 추정하지 않습니다.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CopyButton value={kit.publishedUrl} label="발행 주소 복사" onCopied={setNote} />
          <a
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noreferrer"
            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-zinc-800"
          >
            Google Search Console 열기
          </a>
          <span className="text-[11px] text-zinc-500">현재 상태: {SEARCH_LABEL[search.status] || "확인 전"}{search.checkedAt ? ` (${search.checkedAt})` : ""}</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="text-[11px] text-zinc-400">
            확인 결과
            <select
              value={search.status}
              onChange={(e) => setSearch({ ...search, status: e.target.value })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
            >
              <option value="unchecked">확인 전</option>
              <option value="indexed">색인됨</option>
              <option value="not_indexed">색인 안 됨</option>
            </select>
          </label>
          <label className="text-[11px] text-zinc-400">
            확인 날짜
            <input
              type="date"
              value={search.checkedAt || ""}
              onChange={(e) => setSearch({ ...search, checkedAt: e.target.value })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
            />
          </label>
          <label className="text-[11px] text-zinc-400">
            메모
            <input
              value={search.note || ""}
              onChange={(e) => setSearch({ ...search, note: e.target.value })}
              placeholder="예: 색인 요청함"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() =>
            saveAndReload({ action: "search", search }, "search", {
              verify: (fresh) => fresh.record.search?.status === (search.status || "unchecked"),
              okText: "저장했습니다. 새로고침해도 남아 있습니다.",
            })
          }
          disabled={!!busy}
          className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {busy === "search" ? "저장 중..." : "확인 결과 저장"}
        </button>
      </section>

      {/* ── D. 7일 · 30일 성과 ── */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-200">D. 7일 · 30일 성과 적기</h3>
        <p className="mt-1 text-xs text-zinc-500">
          발행일 {kit.checkDates.published || "-"} · 7일 점검일 {kit.checkDates.day7 || "-"} · 30일 점검일 {kit.checkDates.day30 || "-"} ·
          <b className="text-zinc-300"> 외부 클릭</b>이 실제로 블로그에 사람이 들어왔는지를 보는 가장 중요한 값입니다. 비워 두면 0이 아니라
          “미입력”으로 남습니다.
        </p>
        {["day7", "day30"].map((period) => (
          <div key={period} className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs font-semibold text-zinc-300">{period === "day7" ? "7일 성과" : "30일 성과"}</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[11px]">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1 pr-2">항목</th>
                    {PIN_FIELDS.map(([, label]) => (
                      <th key={label} className="py-1 pr-2">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kit.variants.map((v) => (
                    <tr key={v.id}>
                      <td className="py-1 pr-2 text-zinc-300">{v.order}. {v.label}</td>
                      {PIN_FIELDS.map(([field]) => (
                        <td key={field} className="py-1 pr-2">
                          <input
                            inputMode="numeric"
                            placeholder="미입력"
                            value={num(metrics[period]?.pins?.[v.id]?.[field])}
                            onChange={(e) => setMetricValue(period, v.id, field, e.target.value)}
                            className="w-20 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-100"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1 pr-2 text-zinc-300">Google 검색</td>
                    {GOOGLE_FIELDS.map(([field, label]) => (
                      <td key={field} className="py-1 pr-2">
                        <input
                          inputMode="numeric"
                          placeholder={label}
                          value={num(metrics[period]?.google?.[field])}
                          onChange={(e) => setMetricValue(period, "google", field, e.target.value)}
                          className="w-20 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-100"
                        />
                      </td>
                    ))}
                    <td colSpan={2} className="py-1 text-zinc-600">Google은 노출·클릭만 적습니다</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() =>
                saveAndReload({ action: "metrics", period, metrics: metrics[period] || {} }, period, {
                  verify: (fresh) => {
                    const sent = metrics[period] || {};
                    const got = fresh.record.metrics?.[period];
                    if (!got) return false;
                    for (const v of kit.variants) {
                      for (const [f] of PIN_FIELDS) {
                        const raw = sent.pins?.[v.id]?.[f];
                        if (raw === "" || raw === null || raw === undefined) continue;
                        if (Number(raw) !== got.pins?.[v.id]?.[f]) return false;
                      }
                    }
                    for (const [f] of GOOGLE_FIELDS) {
                      const raw = sent.google?.[f];
                      if (raw === "" || raw === null || raw === undefined) continue;
                      if (Number(raw) !== got.google?.[f]) return false;
                    }
                    return true;
                  },
                  okText: "저장했습니다. 새로고침해도 남아 있습니다.",
                })
              }
              disabled={!!busy}
              className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {busy === period ? "저장 중..." : period === "day7" ? "7일 성과 저장" : "30일 성과 저장"}
            </button>
          </div>
        ))}
      </section>

      {kit.notes.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[11px] text-zinc-500">자료를 만든 방식</summary>
          <ul className="mt-1 space-y-1 text-[11px] text-zinc-600">
            {kit.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
            <li>· 기존에 만들어 둔 Pinterest 홍보자료가 있으면 1번 변형으로 그대로 재사용합니다.</li>
          </ul>
        </details>
      )}
    </div>
  );
}
