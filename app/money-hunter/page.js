"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const CATEGORY_OPTIONS = [
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
  category: CATEGORY_OPTIONS[0],
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

  const sorted = [...keywords].sort((a, b) => b.moneyScore - a.moneyScore);

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
          <h2 className="text-lg font-semibold">키워드 목록 ({sorted.length})</h2>
          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">불러오는 중...</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="py-2 pr-4">키워드</th>
                    <th className="py-2 pr-4">카테고리</th>
                    <th className="py-2 pr-4">의도</th>
                    <th className="py-2 pr-4">Money Score</th>
                    <th className="py-2 pr-4">상태</th>
                    <th className="py-2 pr-4">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((k) => (
                    <tr key={k.id} className="border-b border-zinc-900">
                      <td className="py-2 pr-4 font-medium">{k.keyword}</td>
                      <td className="py-2 pr-4 text-zinc-400">{k.category}</td>
                      <td className="py-2 pr-4 text-zinc-400">{k.intent}</td>
                      <td className="py-2 pr-4">
                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-400">
                          {k.moneyScore}
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
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-zinc-500">
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
