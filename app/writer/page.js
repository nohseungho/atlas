"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function WriterPage() {
  const [keywords, setKeywords] = useState([]);
  const [articles, setArticles] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function loadData() {
    const [kRes, aRes] = await Promise.all([
      fetch("/api/keywords", { cache: "no-store" }),
      fetch("/api/articles", { cache: "no-store" }),
    ]);
    const kData = await kRes.json();
    const aData = await aRes.json();
    setKeywords(kData.keywords || []);
    setArticles(aData.articles || []);
  }

  useEffect(() => {
    // Client-side fetch-on-mount against our own API route; intentional for this admin tool.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const selectedKeywords = keywords.filter((k) => k.status === "selected");
  const writtenArticles = articles.filter((a) => a.status === "written");

  async function handleGenerate() {
    if (!selectedId) {
      setError("작성할 키워드를 선택해주세요.");
      return;
    }
    setGenerating(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/generate-article", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywordId: selectedId }),
    });
    setGenerating(false);
    if (!res.ok) {
      setError("글 생성에 실패했습니다.");
      return;
    }
    const article = await res.json();
    setResult(article);
    setSelectedId("");
    loadData();
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 sm:px-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Writer</h1>
            <p className="mt-1 text-sm text-zinc-400">
              selected 키워드로 템플릿 글 초안을 생성합니다.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/writer/new"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              새 MASTER 작성
            </Link>
            <Link href="/" className="text-sm text-emerald-400 hover:underline">
              ← Dashboard
            </Link>
          </div>
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Selected 키워드 ({selectedKeywords.length})</h2>
          <div className="mt-4 space-y-2">
            {selectedKeywords.map((k) => (
              <label
                key={k.id}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                  selectedId === k.id ? "border-emerald-500 bg-emerald-500/5" : "border-zinc-800"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="keyword"
                    checked={selectedId === k.id}
                    onChange={() => setSelectedId(k.id)}
                  />
                  <div>
                    <p className="font-medium">{k.keyword}</p>
                    <p className="text-xs text-zinc-500">
                      {k.category} · Money Score {k.moneyScore}
                    </p>
                  </div>
                </div>
              </label>
            ))}
            {selectedKeywords.length === 0 && (
              <p className="text-sm text-zinc-500">
                Money Hunter에서 selected 상태로 변경된 키워드가 없습니다.
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating || selectedKeywords.length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {generating ? "생성 중..." : "글 초안 생성"}
            </button>
            {error && <span className="text-sm text-red-400">{error}</span>}
          </div>
        </section>

        {result && (
          <section className="rounded-xl border border-emerald-700 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold text-emerald-400">생성 완료: {result.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{result.metaDescription}</p>
            <div className="mt-4 whitespace-pre-wrap rounded-lg bg-zinc-950 p-4 text-sm text-zinc-300">
              {result.bodyMarkdown}
            </div>
            <Link
              href="/publisher"
              className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Publisher에서 발행하기 →
            </Link>
          </section>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">작성 완료 글 ({writtenArticles.length})</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {writtenArticles.map((a) => (
              <li key={a.id} className="border-b border-zinc-800 pb-2 last:border-0">
                <Link
                  href={`/writer/${a.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-zinc-800"
                >
                  <span>{a.title}</span>
                  <span className="text-xs text-zinc-500">{a.category}</span>
                </Link>
              </li>
            ))}
            {writtenArticles.length === 0 && (
              <li className="text-zinc-500">아직 작성 완료된 글이 없습니다.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
