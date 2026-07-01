"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildBloggerHtml } from "@/lib/html-exporter";

export default function PublisherPage() {
  const [articles, setArticles] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");

  async function loadArticles() {
    const res = await fetch("/api/articles", { cache: "no-store" });
    const data = await res.json();
    setArticles(data.articles || []);
  }

  useEffect(() => {
    // Client-side fetch-on-mount against our own API route; intentional for this admin tool.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadArticles();
  }, []);

  const writtenArticles = articles.filter((a) => a.status === "written");
  const selected = articles.find((a) => a.id === selectedId);

  async function handlePublish() {
    if (!selected) return;
    if (!publishedUrl.trim()) {
      setMessage("발행 URL을 입력해주세요.");
      return;
    }
    setPublishing(true);
    setMessage("");
    const res = await fetch("/api/articles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.id,
        status: "published",
        publishedUrl,
        blogPlatform: "blogger",
      }),
    });
    setPublishing(false);
    if (!res.ok) {
      setMessage("발행 처리에 실패했습니다.");
      return;
    }
    setMessage("발행 완료로 처리했습니다.");
    setSelectedId("");
    setPublishedUrl("");
    loadArticles();
  }

  async function copy(text) {
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
            <h1 className="text-2xl font-bold">Publisher</h1>
            <p className="mt-1 text-sm text-zinc-400">Blogger에 수동으로 복사해서 발행합니다.</p>
          </div>
          <Link href="/" className="text-sm text-emerald-400 hover:underline">
            ← Dashboard
          </Link>
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">작성 완료 글 ({writtenArticles.length})</h2>
          <div className="mt-4 space-y-2">
            {writtenArticles.map((a) => (
              <label
                key={a.id}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                  selectedId === a.id ? "border-emerald-500 bg-emerald-500/5" : "border-zinc-800"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="article"
                    checked={selectedId === a.id}
                    onChange={() => setSelectedId(a.id)}
                  />
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-zinc-500">{a.category}</p>
                  </div>
                </div>
              </label>
            ))}
            {writtenArticles.length === 0 && (
              <p className="text-sm text-zinc-500">발행 대기 중인 글이 없습니다.</p>
            )}
          </div>
        </section>

        {selected && (
          <section className="space-y-4">
            <CopyBlock label="제목" value={selected.title} onCopy={copy} />
            <CopyBlock label="메타 설명" value={selected.metaDescription} onCopy={copy} />
            <CopyBlock label="태그" value={(selected.tags || []).join(", ")} onCopy={copy} />
            <CopyBlock
              label="Blogger 복사용 HTML"
              value={buildBloggerHtml(selected)}
              onCopy={copy}
              tall
            />

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">발행 완료 처리</h2>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  value={publishedUrl}
                  onChange={(e) => setPublishedUrl(e.target.value)}
                  placeholder="발행된 Blogger 게시글 URL"
                  className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {publishing ? "처리 중..." : "발행 완료"}
                </button>
              </div>
              {message && <p className="mt-2 text-sm text-zinc-400">{message}</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function CopyBlock({ label, value, onCopy, tall }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">{label}</h3>
        <button
          onClick={() => onCopy(value)}
          className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
        >
          복사
        </button>
      </div>
      <textarea
        readOnly
        value={value}
        className={`mt-2 w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300 ${
          tall ? "h-64" : "h-16"
        }`}
      />
    </div>
  );
}
