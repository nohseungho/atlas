"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function ArticleEditorPage() {
  const { id } = useParams();
  const router = useRouter();

  const [article, setArticle] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [seoTitle, setSeoTitle] = useState("");
  const [hookTitle, setHookTitle] = useState("");
  const [englishMaster, setEnglishMaster] = useState("");
  const [koreanReview, setKoreanReview] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Client-side fetch-on-mount against our own API route; intentional for this admin tool.
    async function load() {
      const res = await fetch("/api/articles", { cache: "no-store" });
      const data = await res.json();
      const found = (data.articles || []).find((a) => a.id === id);
      if (!found) {
        setNotFound(true);
        return;
      }
      setArticle(found);
      setSeoTitle(found.title || "");
      setHookTitle(found.hookTitle || "");
      setEnglishMaster(found.bodyMarkdown || "");
      setKoreanReview(found.koreanReview || "");
    }
    load();
  }, [id]);

  async function saveArticle() {
    const res = await fetch("/api/articles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        title: seoTitle,
        hookTitle,
        bodyMarkdown: englishMaster,
        koreanReview,
      }),
    });
    return res.ok;
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    const ok = await saveArticle();
    setSaving(false);
    setMessage(ok ? "저장되었습니다." : "저장에 실패했습니다.");
  }

  async function handleSendToPublisher() {
    setSending(true);
    setMessage("");
    const ok = await saveArticle();
    setSending(false);
    if (!ok) {
      setMessage("저장에 실패하여 Publisher로 이동하지 못했습니다.");
      return;
    }
    router.push(`/publisher?id=${id}`);
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 sm:px-10">
        <div className="mx-auto max-w-4xl space-y-4">
          <p className="text-sm text-red-400">해당 글을 찾을 수 없습니다.</p>
          <Link href="/writer" className="text-sm text-emerald-400 hover:underline">
            ← 목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-zinc-400">불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 sm:px-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Editor</h1>
            <p className="mt-1 text-sm text-zinc-400">{article.category}</p>
          </div>
          <Link href="/writer" className="text-sm text-emerald-400 hover:underline">
            ← 목록으로 돌아가기
          </Link>
        </header>

        <section className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <label className="block text-sm font-semibold text-zinc-300">SEO Title</label>
          <input
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
        </section>

        <section className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <label className="block text-sm font-semibold text-zinc-300">Hook Title</label>
          <input
            value={hookTitle}
            onChange={(e) => setHookTitle(e.target.value)}
            placeholder="Hook Title을 입력하세요"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
        </section>

        <section className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <label className="block text-sm font-semibold text-zinc-300">English MASTER</label>
          <textarea
            value={englishMaster}
            onChange={(e) => setEnglishMaster(e.target.value)}
            className="h-96 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200"
          />
        </section>

        <section className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-semibold text-zinc-300">한국어 검수본</label>
            <span className="rounded-full bg-amber-500/20 px-2 py-1 text-xs text-amber-300">
              Blogger에는 발행되지 않습니다 (내부 검수 전용)
            </span>
          </div>
          <textarea
            value={koreanReview}
            onChange={(e) => setKoreanReview(e.target.value)}
            className="h-96 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200"
          />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "MASTER 저장"}
          </button>
          <button
            onClick={handleSendToPublisher}
            disabled={sending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {sending ? "전송 중..." : "Publisher로 보내기"}
          </button>
          <Link
            href="/writer"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
          >
            목록으로 돌아가기
          </Link>
          {message && <span className="text-sm text-zinc-400">{message}</span>}
        </div>
      </div>
    </div>
  );
}
