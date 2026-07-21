"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const REQUIRED_VISUALS = 5;

export default function ArticleFactoryPage() {
  const [meta, setMeta] = useState(null);
  const [raw, setRaw] = useState("");
  const [selectedKeywordId, setSelectedKeywordId] = useState("");
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Client-side fetch-on-mount against our own API route; intentional for this admin tool.
    async function load() {
      const res = await fetch("/api/articles/factory", { cache: "no-store" });
      if (res.ok) setMeta(await res.json());
    }
    load();
  }, []);

  const selectedKeyword = meta?.unusedKeywords?.find((k) => k.id === selectedKeywordId);

  async function submit(dryRun) {
    setErrors([]);
    setWarnings([]);
    setSaved(null);

    let master;
    try {
      master = JSON.parse(raw);
    } catch (e) {
      setErrors([`MASTER JSON 파싱 실패: ${e.message}`]);
      return;
    }

    if (selectedKeyword) {
      master.keywordId = master.keywordId || selectedKeyword.id;
      master.keyword = master.keyword || selectedKeyword.keyword;
    }

    setBusy(true);
    const res = await fetch("/api/articles/factory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ master, dryRun }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    setWarnings(data.warnings || []);
    if (!res.ok || !data.ok) {
      setErrors(data.errors || [data.error || "저장에 실패했습니다."]);
      return;
    }
    setSaved(data);
  }

  const visualCount = (() => {
    try {
      return (JSON.parse(raw).visualAssets || []).length;
    } catch {
      return null;
    }
  })();

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 sm:px-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Article Factory</h1>
            <p className="mt-1 text-sm text-zinc-400">
              외부에서 작성한 영문 MASTER 패키지를 검증 후 articles.json에 저장합니다. 본문을 자동
              생성하지 않습니다.
            </p>
          </div>
          <Link href="/writer" className="text-sm text-emerald-400 hover:underline">
            ← Writer
          </Link>
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">1. 미사용 키워드</h2>
            <span className="rounded-md bg-zinc-800 px-2 py-1 font-mono text-xs text-emerald-300">
              다음 ID: {meta?.nextId || "..."}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {(meta?.unusedKeywords || []).map((k) => (
              <label
                key={k.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                  selectedKeywordId === k.id ? "border-emerald-500 bg-emerald-500/5" : "border-zinc-800"
                }`}
              >
                <input
                  type="radio"
                  name="kw"
                  checked={selectedKeywordId === k.id}
                  onChange={() => setSelectedKeywordId(k.id)}
                />
                <div>
                  <p className="font-medium">{k.keyword}</p>
                  <p className="text-xs text-zinc-500">
                    {k.category} · Money Score {k.moneyScore} · 제안 slug:{" "}
                    <span className="font-mono text-zinc-400">{k.suggestedSlug || "(영문 아님)"}</span>
                  </p>
                </div>
              </label>
            ))}
            {meta && (meta.unusedKeywords || []).length === 0 && (
              <p className="text-sm text-zinc-500">사용 가능한 미사용 키워드가 없습니다.</p>
            )}
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">2. MASTER 패키지 JSON</h2>
            {visualCount !== null && (
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  visualCount === REQUIRED_VISUALS
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-500/20 text-amber-300"
                }`}
              >
                이미지 {visualCount}/{REQUIRED_VISUALS}
              </span>
            )}
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder='{ "title": "...", "slug": "...", "quickAnswer": "...", "visualAssets": [ ... ] }'
            className="h-96 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-200"
          />
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => submit(true)}
              disabled={busy || !raw.trim()}
              className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600 disabled:opacity-50"
            >
              {busy ? "검증 중..." : "검증만 (저장 안 함)"}
            </button>
            <button
              onClick={() => submit(false)}
              disabled={busy || !raw.trim()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? "저장 중..." : "검증 후 저장"}
            </button>
          </div>
        </section>

        {errors.length > 0 && (
          <section className="rounded-xl border border-red-800 bg-red-950/40 p-5">
            <h2 className="text-lg font-semibold text-red-300">검증 실패 ({errors.length})</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-200">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-red-300/70">저장되지 않았습니다.</p>
          </section>
        )}

        {warnings.length > 0 && (
          <section className="rounded-xl border border-amber-800 bg-amber-950/30 p-5">
            <h2 className="text-sm font-semibold text-amber-300">참고</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-200">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </section>
        )}

        {saved && (
          <section className="rounded-xl border border-emerald-700 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold text-emerald-400">
              {saved.saved ? `저장 완료: ${saved.id}` : `검증 통과 (미저장): ${saved.id}`}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {saved.saved
                ? "다음 단계로 이동해 이미지 5장을 준비하고 Preview를 확인하세요."
                : "저장하려면 '검증 후 저장'을 누르세요."}
            </p>
            {saved.saved && (
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={`/writer/${saved.id}`}
                  className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600"
                >
                  Editor에서 열기
                </Link>
                <Link
                  href={`/publisher?id=${saved.id}`}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Publisher에서 이미지 준비 · Preview →
                </Link>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
