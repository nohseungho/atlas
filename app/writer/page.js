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

  const [masterTargetId, setMasterTargetId] = useState("");
  const [masterText, setMasterText] = useState("");
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterMessage, setMasterMessage] = useState("");

  const [expandedDraftId, setExpandedDraftId] = useState("");
  const [koReviewTargetId, setKoReviewTargetId] = useState("");
  const [koReviewText, setKoReviewText] = useState("");
  const [koReviewSaving, setKoReviewSaving] = useState(false);
  const [koReviewMessage, setKoReviewMessage] = useState("");

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

  // 검수 편의용 한국어 제목(키워드의 koLabel). Blogger 발행 데이터에는 사용하지 않는다.
  function getKoLabel(keywordId) {
    return keywords.find((k) => k.id === keywordId)?.koLabel || "";
  }

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
    openMasterEditor(article);
    loadData();
  }

  function openMasterEditor(article) {
    setMasterTargetId(article.id);
    setMasterText(article.masterMarkdown || "");
    setMasterMessage("");
  }

  async function saveMaster() {
    if (!masterTargetId || !masterText.trim()) {
      setMasterMessage("MASTER 원고 내용을 붙여넣어주세요.");
      return;
    }
    setMasterSaving(true);
    setMasterMessage("");
    const res = await fetch("/api/articles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: masterTargetId, masterMarkdown: masterText }),
    });
    setMasterSaving(false);
    if (!res.ok) {
      setMasterMessage("MASTER 원고 저장에 실패했습니다.");
      return;
    }
    setMasterMessage("MASTER 원고 저장 완료 — Publisher에서 발행할 수 있습니다.");
    loadData();
  }

  function toggleDraft(article) {
    const opening = expandedDraftId !== article.id;
    setExpandedDraftId(opening ? article.id : "");
    if (opening) {
      setKoReviewTargetId(article.id);
      setKoReviewText(article.koDraftReview || "");
      setKoReviewMessage("");
    }
  }

  async function saveKoReview() {
    if (!koReviewTargetId) return;
    setKoReviewSaving(true);
    setKoReviewMessage("");
    const res = await fetch("/api/articles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: koReviewTargetId, koDraftReview: koReviewText }),
    });
    setKoReviewSaving(false);
    if (!res.ok) {
      setKoReviewMessage("저장 실패");
      return;
    }
    setKoReviewMessage("저장 완료");
    loadData();
  }

  // 초안 복사는 항상 영문(draftMarkdown/bodyMarkdown)만 복사한다. 한국어 검수본은 복사 대상이 아니다.
  async function copyDraft(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API unavailable in this context; ignore silently
    }
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
          <Link href="/" className="text-sm text-emerald-400 hover:underline">
            ← Dashboard
          </Link>
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-emerald-400">Writer 초안: {result.title}</h2>
                {getKoLabel(result.keywordId) && (
                  <p className="mt-0.5 text-sm text-zinc-500">({getKoLabel(result.keywordId)})</p>
                )}
              </div>
              <button
                onClick={() => copyDraft(result.draftMarkdown || result.bodyMarkdown)}
                className="shrink-0 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-700"
              >
                초안 복사 (영문)
              </button>
            </div>
            <p className="mt-1 text-sm text-zinc-400">{result.metaDescription}</p>
            <div className="mt-4 whitespace-pre-wrap rounded-lg bg-zinc-950 p-4 text-sm text-zinc-300">
              {result.draftMarkdown || result.bodyMarkdown}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              이 초안을 ChatGPT에 붙여넣어 검수(내용/SEO/Affiliate/문장) 후, 최종 영문(MASTER)만 아래에 다시 붙여넣으세요.
            </p>
          </section>
        )}

        {masterTargetId && (
          <section className="rounded-xl border border-blue-700 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold text-blue-400">MASTER 원고</h2>
            <p className="mt-1 text-xs text-zinc-500">
              ChatGPT 검수를 마친 최종 영문을 붙여넣으세요. Publisher는 이 MASTER 원고만 발행합니다.
            </p>
            <textarea
              value={masterText}
              onChange={(e) => setMasterText(e.target.value)}
              placeholder="ChatGPT에서 검수 완료한 최종 영문 원고를 붙여넣으세요."
              className="mt-3 h-64 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-300 outline-none focus:border-blue-500"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={saveMaster}
                disabled={masterSaving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {masterSaving ? "저장 중..." : "MASTER 원고 저장"}
              </button>
              {masterMessage && <span className="text-sm text-zinc-400">{masterMessage}</span>}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">작성 완료 글 ({writtenArticles.length})</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {writtenArticles.map((a) => (
              <li key={a.id} className="border-b border-zinc-800 pb-3 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span>{a.title}</span>
                    <span className="ml-2 text-xs text-zinc-500">{a.category}</span>
                    {getKoLabel(a.keywordId) && (
                      <p className="text-xs text-zinc-500">({getKoLabel(a.keywordId)})</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        a.masterApproved
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {a.masterApproved ? "MASTER 완료" : "MASTER 필요"}
                    </span>
                    <button
                      onClick={() => toggleDraft(a)}
                      className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
                    >
                      {expandedDraftId === a.id ? "AI Draft 닫기" : "AI Draft 보기"}
                    </button>
                    <button
                      onClick={() => copyDraft(a.draftMarkdown || a.bodyMarkdown)}
                      className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
                    >
                      초안 복사 (영문)
                    </button>
                    <button
                      onClick={() => openMasterEditor(a)}
                      className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
                    >
                      MASTER 작성/수정
                    </button>
                  </div>
                </div>

                {expandedDraftId === a.id && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <p className="mb-1 text-xs font-semibold text-zinc-400">AI Draft (영문 원본)</p>
                      <div className="whitespace-pre-wrap rounded-lg bg-zinc-950 p-4 text-xs text-zinc-300">
                        {a.draftMarkdown || a.bodyMarkdown}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-semibold text-zinc-400">
                        검수용 한국어 번역 (Blogger에 발행되지 않음)
                      </p>
                      <textarea
                        value={koReviewTargetId === a.id ? koReviewText : a.koDraftReview || ""}
                        onChange={(e) => {
                          setKoReviewTargetId(a.id);
                          setKoReviewText(e.target.value);
                        }}
                        placeholder="대표 검수용 한국어 번역을 붙여넣으세요. Blogger에는 발행되지 않습니다."
                        className="h-48 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-300 outline-none focus:border-amber-500"
                      />
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          onClick={saveKoReview}
                          disabled={koReviewSaving}
                          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                        >
                          {koReviewSaving ? "저장 중..." : "한국어 번역 저장"}
                        </button>
                        {koReviewTargetId === a.id && koReviewMessage && (
                          <span className="text-xs text-zinc-400">{koReviewMessage}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
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
