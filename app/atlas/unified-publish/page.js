"use client";

import { useEffect, useState } from "react";
import { buildUnifiedPublishPlan } from "@/lib/atlas/unified-publish-plan";

async function readJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${url} 확인 실패`);
  return data;
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

function resultLabel(result) {
  if (!result) return "대기";
  if (result.pending) return "발행 중";
  if (result.ok) return "발행 완료";
  return "발행 실패";
}

export default function UnifiedPublishPage() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState({ global: null, korea: null });

  async function loadPlan() {
    setLoading(true);
    setError("");
    try {
      const [articleData, blogData, koreaData] = await Promise.all([
        readJson("/api/articles"),
        readJson("/api/blogs"),
        readJson("/api/atlas/korea-drafts"),
      ]);
      setPlan(buildUnifiedPublishPlan({
        articles: articleData.articles || [],
        blogs: blogData.items || [],
        koreaDrafts: koreaData.items || [],
      }));
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlan();
  }, []);

  async function publishBoth() {
    if (!plan?.ready || running) return;
    setRunning(true);
    setError("");
    setResults({ global: { pending: true }, korea: { pending: true } });

    const [globalResult, koreaResult] = await Promise.all([
      postJson("/api/publish", { articleId: plan.global.articleId, blogId: plan.global.blogId }),
      postJson("/api/atlas/korea-publish", { id: plan.korea.draftId, mode: "publish" }),
    ]);

    setResults({ global: globalResult, korea: koreaResult });
    setRunning(false);
    await loadPlan();
  }

  const globalUrl = results.global?.data?.publishedUrl || "";
  const koreaUrl = results.korea?.data?.publishedUrl || results.korea?.data?.editorUrl || "";

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <header>
        <p className="text-sm font-semibold text-emerald-400">ATLAS 통합 발행</p>
        <h1 className="mt-2 text-3xl font-bold">국내·해외 블로그 한 번에 발행</h1>
        <p className="mt-2 text-sm text-zinc-400">승인된 미발행 MASTER만 선택하며 기존 공개 글은 수정하지 않습니다.</p>
      </header>

      {error && <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>}

      <section className="grid gap-4 md:grid-cols-2">
        <ChannelCard label="해외 Blogger" title={plan?.global?.title} target={plan?.global?.blogName} status={resultLabel(results.global)} url={globalUrl} error={results.global && !results.global.ok ? results.global.data?.error : ""} />
        <ChannelCard label="국내 Naver" title={plan?.korea?.title} target={plan?.korea?.blogId} status={resultLabel(results.korea)} url={koreaUrl} error={results.korea && !results.korea.ok ? results.korea.data?.error : ""} />
      </section>

      {plan?.blockers?.length > 0 && (
        <section className="rounded-xl border border-amber-800 bg-amber-950/30 p-5">
          <h2 className="font-semibold text-amber-300">발행 전 확인 필요</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
            {plan.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-3">
        <button type="button" disabled={loading || running || !plan?.ready} onClick={publishBoth} className="rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400">
          {running ? "국내·해외 발행 중..." : "국내·해외 신규 글 발행"}
        </button>
        <button type="button" onClick={loadPlan} disabled={loading || running} className="rounded-lg border border-zinc-700 px-4 py-3 text-sm text-zinc-300">다시 확인</button>
      </div>
      <p className="text-xs text-zinc-500">두 채널은 독립적으로 실행되므로 한쪽만 성공하면 성공 URL을 보존하고 실패한 채널만 다시 시도할 수 있습니다.</p>
    </main>
  );
}

function ChannelCard({ label, title, target, status, url, error }) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{label}</h2>
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">{status}</span>
      </div>
      <p className="mt-4 min-h-12 text-sm text-zinc-200">{title || "선택 가능한 승인 글 없음"}</p>
      <p className="mt-2 text-xs text-zinc-500">대상: {target || "-"}</p>
      {url && <a className="mt-3 block break-all text-sm text-emerald-400 underline" href={url} target="_blank" rel="noreferrer">{url}</a>}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </article>
  );
}
