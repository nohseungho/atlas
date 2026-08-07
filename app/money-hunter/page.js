"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ATLAS 기본 운영은 글로벌 블로그 기준 — 영어권 SEO/Affiliate 키워드를 우선 노출한다.
// 한국 키워드(국내 쇼츠 프로젝트용)는 목록 하단에 유지.
const CATEGORY_OPTIONS = [
  "Outdoor & Camping",
  "Travel Gear",
  "Home & Productivity",
  "Coffee & Kitchen",
  "AI Tools",
  "Tech Gadgets",
  "자동차 보험",
  "정부지원금",
  "전기세/생활비 절약",
  "AI 활용법",
  "여행",
  "건강/생활정보",
  "금융/세금",
];

const INTENT_OPTIONS = ["informational", "commercial", "transactional", "navigational"];
const LEVELS = [1, 2, 3, 4, 5];

const inputClass =
  "rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500";

const emptyForm = {
  keyword: "",
  category: CATEGORY_OPTIONS[0], // 글로벌 카테고리를 기본값으로
  intent: "commercial",
  searchVolumeLevel: 3,
  cpcLevel: 3,
  competitionLevel: 3,
  commercialLevel: 3,
  seasonality: 3,
  memo: "",
};

const STATUS_COLORS = {
  idea: "bg-zinc-700 text-zinc-200",
  selected: "bg-blue-500/20 text-blue-300",
  writing: "bg-amber-500/20 text-amber-300",
  written: "bg-purple-500/20 text-purple-300",
  published: "bg-emerald-500/20 text-emerald-300",
};

export default function MoneyHunterPage() {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [handoffMsg, setHandoffMsg] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function loadKeywords() {
    setLoading(true);
    const res = await fetch("/api/keywords", { cache: "no-store" });
    const data = await res.json();
    setKeywords(data.keywords || []);
    setLoading(false);
  }

  useEffect(() => {
    // Client-side fetch-on-mount against our own API route; intentional for this admin tool.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadKeywords();
  }, []);

  async function updateStatus(id, status) {
    await fetch("/api/keywords", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    loadKeywords();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.keyword.trim()) {
      setError("키워드를 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("키워드 등록에 실패했습니다.");
      return;
    }
    setForm(emptyForm);
    loadKeywords();
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export the secret-free ChatGPT request file for a candidate (Blog 01 only).
  async function exportRequest(moneyHunterId) {
    setHandoffBusy(true);
    setHandoffMsg("");
    try {
      const res = await fetch("/api/atlas/chatgpt-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogId: "blog_001", moneyHunterId }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        downloadJson(data.filename, data.request);
        setHandoffMsg(`요청 파일 내보냄: ${data.filename} — ChatGPT에 업로드하세요.`);
      } else {
        setHandoffMsg(`내보내기 실패: ${data.errorCode || data.message || "오류"}`);
      }
    } catch {
      setHandoffMsg("네트워크 오류");
    }
    setHandoffBusy(false);
  }

  // Register the single atlas-package JSON returned by ChatGPT.
  async function importPackage(file) {
    if (!file) return;
    setHandoffBusy(true);
    setHandoffMsg("패키지 검증·이미지 업로드 중...");
    try {
      const text = await file.text();
      let pkg;
      try {
        pkg = JSON.parse(text);
      } catch {
        setHandoffMsg("JSON 파싱 실패");
        setHandoffBusy(false);
        return;
      }
      const res = await fetch("/api/atlas/chatgpt-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: pkg }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setHandoffMsg(`등록 완료: ${data.articleId} · Cloudinary 이미지 ${data.qa?.distinctCloudinary ?? 0}/5 · ${data.duplicate ? "기존 재사용(중복 생성 없음)" : "신규"} → Publisher에서 'Blogger 초안 반영'`);
      } else if (data.status === "duplicate_review_required") {
        setHandoffMsg(`중복 검토 필요: ${data.reason || ""}`);
      } else if (data.status === "needs_configuration") {
        setHandoffMsg(`설정 필요: ${(data.envNeeded || []).join(", ")}`);
      } else {
        setHandoffMsg(`등록 거부: ${data.errorCode || data.status} ${(data.issues || []).join(", ")}`);
      }
      loadKeywords();
    } catch {
      setHandoffMsg("네트워크 오류");
    }
    setHandoffBusy(false);
  }

  // Export the English keyword-discovery request (Blog 01), upload to ChatGPT.
  async function exportKeywordRequest() {
    setHandoffBusy(true);
    setHandoffMsg("");
    try {
      const res = await fetch("/api/atlas/keyword-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogId: "blog_001" }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        downloadJson(data.filename, data.request);
        setHandoffMsg(`키워드 발굴 요청 내보냄: ${data.filename} — ChatGPT에 업로드하세요.`);
      } else {
        setHandoffMsg(`내보내기 실패: ${data.errorCode || data.message || "오류"}`);
      }
    } catch {
      setHandoffMsg("네트워크 오류");
    }
    setHandoffBusy(false);
  }

  // Register the recommended-keyword package; only validated English Blog-01
  // candidates are added to the Money Hunter DB.
  async function importKeywordPackage(file) {
    if (!file) return;
    setHandoffBusy(true);
    setHandoffMsg("추천 키워드 검증·등록 중...");
    try {
      const text = await file.text();
      let pkg;
      try {
        pkg = JSON.parse(text);
      } catch {
        setHandoffMsg("JSON 파싱 실패");
        setHandoffBusy(false);
        return;
      }
      const res = await fetch("/api/atlas/keyword-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: pkg }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setHandoffMsg(`추천 키워드 등록: 추가 ${data.added}개 · 거부 ${(data.rejected || []).length} · 검토필요 ${(data.review || []).length}`);
      } else {
        setHandoffMsg(`등록 거부: ${data.errorCode || data.status} ${(data.errors || []).join(", ")}`);
      }
      loadKeywords();
    } catch {
      setHandoffMsg("네트워크 오류");
    }
    setHandoffBusy(false);
  }

  // Delete one UNUSED keyword (server blocks if it has usage history).
  async function deleteKeyword(id, name) {
    if (!window.confirm(`"${name}" 키워드를 삭제할까요?`)) return;
    setDeleteBusy(true);
    setDeleteMsg("");
    try {
      const res = await fetch("/api/keywords", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.status === "ok") setDeleteMsg(`삭제됨: ${name}`);
      else if (data.status === "blocked") setDeleteMsg(`"${name}": 사용 기록이 있어 삭제할 수 없습니다.`);
      else setDeleteMsg(`삭제 실패: ${data.errorCode || data.message || "오류"}`);
      loadKeywords();
    } catch {
      setDeleteMsg("네트워크 오류");
    }
    setDeleteBusy(false);
  }

  // Bulk-delete only UNUSED Korean keywords. English / used keywords are safe.
  async function bulkDeleteKorean() {
    const hangul = /[ᄀ-ᇿ㄰-㆏가-힣]/;
    const targets = keywords.filter((k) => hangul.test(k.keyword || "") && !(k.usage && k.usage.used));
    if (targets.length === 0) {
      setDeleteMsg("삭제할 미사용 한글 키워드가 없습니다.");
      return;
    }
    if (!window.confirm(`미사용 한글 키워드 ${targets.length}개를 삭제할까요? (영어·사용 이력 키워드는 제외됩니다.)`)) return;
    setDeleteBusy(true);
    setDeleteMsg("");
    try {
      const res = await fetch("/api/keywords", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulkKorean: true }),
      });
      const data = await res.json();
      setDeleteMsg(`일괄 삭제: ${data.deleted ?? 0}개 삭제됨${data.message ? ` — ${data.message}` : ""}`);
      loadKeywords();
    } catch {
      setDeleteMsg("네트워크 오류");
    }
    setDeleteBusy(false);
  }

  // Display-only sort: newest registration first (KST). Records without a
  // createdAt keep their original array order at the bottom. Ids / usage links
  // are never changed.
  const withDate = keywords.map((k, i) => ({ k, i })).filter((x) => x.k.createdAt);
  withDate.sort((a, b) => {
    const t = new Date(b.k.createdAt).getTime() - new Date(a.k.createdAt).getTime();
    return t !== 0 ? t : a.i - b.i;
  });
  const noDate = keywords.map((k, i) => ({ k, i })).filter((x) => !x.k.createdAt);
  const sorted = [...withDate.map((x) => x.k), ...noDate.map((x) => x.k)];

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Money Hunter DB</h1>
            <p className="mt-1 text-sm text-zinc-400">돈 되는 키워드를 등록하고 점수화합니다.</p>
          </div>
          <Link href="/" className="text-sm text-emerald-400 hover:underline">
            ← Dashboard
          </Link>
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">새 키워드 등록</h2>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="키워드">
              <input
                value={form.keyword}
                onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                className={inputClass}
                placeholder="예: 자동차 보험 비교"
              />
            </Field>

            <Field label="카테고리">
              <input
                list="category-options"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputClass}
              />
              <datalist id="category-options">
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>

            <Field label="검색 의도">
              <select
                value={form.intent}
                onChange={(e) => setForm({ ...form, intent: e.target.value })}
                className={inputClass}
              >
                {INTENT_OPTIONS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </Field>

            <LevelField
              label="검색량"
              value={form.searchVolumeLevel}
              onChange={(v) => setForm({ ...form, searchVolumeLevel: v })}
            />
            <LevelField
              label="CPC"
              value={form.cpcLevel}
              onChange={(v) => setForm({ ...form, cpcLevel: v })}
            />
            <LevelField
              label="경쟁도"
              value={form.competitionLevel}
              onChange={(v) => setForm({ ...form, competitionLevel: v })}
            />
            <LevelField
              label="구매 전환 가능성"
              value={form.commercialLevel}
              onChange={(v) => setForm({ ...form, commercialLevel: v })}
            />
            <LevelField
              label="시즌성"
              value={form.seasonality}
              onChange={(v) => setForm({ ...form, seasonality: v })}
            />

            <Field label="메모" className="sm:col-span-2 lg:col-span-3">
              <textarea
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                className={`${inputClass} min-h-[70px]`}
              />
            </Field>

            <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? "등록 중..." : "키워드 등록"}
              </button>
              {error && <span className="text-sm text-red-400">{error}</span>}
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">영문 키워드 발굴 (ChatGPT)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Blog 01 전용 · 추가 API 비용 없음. 발굴 요청을 내보내 ChatGPT에 업로드하고, 반환된 추천 키워드 패키지를 등록하면
            검증된 영어 후보만 아래 DB에 추가됩니다(한글·타 niche·중복 자동 거부).
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={exportKeywordRequest}
              disabled={handoffBusy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
            >
              영문 키워드 발굴 요청 내보내기
            </button>
            <label className="text-sm text-zinc-300">추천 키워드 패키지 등록:</label>
            <input
              type="file"
              accept="application/json"
              disabled={handoffBusy}
              onChange={(e) => importKeywordPackage(e.target.files?.[0])}
              className="text-sm text-zinc-300"
            />
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">무료 제작 (ChatGPT Handoff)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            추가 API 비용 없음 · Blog 01 전용. 아래 목록의 &quot;제작 요청&quot;으로 요청 파일을 내보내 ChatGPT에 업로드하고,
            반환된 atlas-package JSON을 여기서 등록하면 Cloudinary 업로드·QA·중복검사가 자동 처리됩니다.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-sm text-zinc-300">제작 패키지 등록:</label>
            <input
              type="file"
              accept="application/json"
              disabled={handoffBusy}
              onChange={(e) => importPackage(e.target.files?.[0])}
              className="text-sm text-zinc-300"
            />
          </div>
          {handoffMsg && <p className="mt-2 text-sm text-emerald-400">{handoffMsg}</p>}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">키워드 목록 ({sorted.length})</h2>
            <button
              type="button"
              onClick={bulkDeleteKorean}
              disabled={deleteBusy}
              className="rounded-md bg-red-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-40"
            >
              미사용 한글 키워드 일괄 삭제
            </button>
          </div>
          {deleteMsg && <p className="mt-2 text-sm text-amber-400">{deleteMsg}</p>}
          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">불러오는 중...</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="py-2 pr-4">No.</th>
                    <th className="py-2 pr-4">키워드</th>
                    <th className="py-2 pr-4">카테고리</th>
                    <th className="py-2 pr-4">의도</th>
                    <th className="py-2 pr-4">등록일시(KST)</th>
                    <th className="py-2 pr-4">출처</th>
                    <th className="py-2 pr-4">사용 상태</th>
                    <th className="py-2 pr-4">Money Score</th>
                    <th className="py-2 pr-4">상태</th>
                    <th className="py-2 pr-4">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((k, idx) => (
                    <tr key={k.id} className="border-b border-zinc-900">
                      <td className="py-2 pr-4 text-zinc-500">{idx + 1}</td>
                      <td className="py-2 pr-4 font-medium">{k.keyword}</td>
                      <td className="py-2 pr-4 text-zinc-400">{k.category}</td>
                      <td className="py-2 pr-4 text-zinc-400">{k.intent}</td>
                      <td className="py-2 pr-4 whitespace-nowrap text-zinc-400">{fmtKST(k.createdAt)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap text-zinc-400">{sourceLabel(k)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap text-zinc-400">{usageLabel(k)}</td>
                      <td className="py-2 pr-4">
                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-400">
                          {k.moneyScore ?? "—"}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            STATUS_COLORS[k.status] || "bg-zinc-700 text-zinc-200"
                          }`}
                        >
                          {k.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => exportRequest(k.id)}
                            disabled={handoffBusy}
                            className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-40"
                          >
                            제작 요청
                          </button>
                          <button
                            onClick={() => updateStatus(k.id, "selected")}
                            disabled={k.status === "selected"}
                            className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
                          >
                            Selected로 변경
                          </button>
                          <button
                            onClick={() => updateStatus(k.id, "idea")}
                            disabled={k.status === "idea"}
                            className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
                          >
                            Idea로 되돌리기
                          </button>
                          <button
                            onClick={() => deleteKeyword(k.id, k.keyword)}
                            disabled={deleteBusy || (k.usage && k.usage.used)}
                            title={k.usage && k.usage.used ? "사용 기록이 있어 삭제할 수 없습니다" : "키워드 삭제"}
                            className="rounded-md bg-red-600/80 px-2 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-40"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-zinc-500">
                        등록된 키워드가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function fmtKST(iso) {
  if (!iso) return "기존 데이터";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "기존 데이터";
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
}

function sourceLabel(k) {
  if (k.source === "chatgpt-keyword-handoff") return "영문 추천";
  if (k.source === "manual") return "수동 등록";
  return "기존 데이터";
}

function usageLabel(k) {
  const u = k.usage || {};
  if (u.pjob) return `제작 요청 완료 · ${u.pjob}`;
  if (u.articleId) return `글 사용 · ${u.articleId}`;
  if (u.used) return "사용 중";
  return "미사용";
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function LevelField({ label, value, onChange }) {
  return (
    <Field label={`${label} (1~5)`}>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputClass}
      >
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}
