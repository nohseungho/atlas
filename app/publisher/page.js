"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildBloggerHtml, getBloggerChecklist } from "@/lib/html-exporter";

const ADSENSE_CHECKLIST = [
  "개인정보처리방침(Privacy Policy) 페이지 존재",
  "독창적이고 가치 있는 콘텐츠 (복사/저품질 콘텐츠 없음)",
  "최소 게시글 수 확보 (통상 20~30개 이상 권장)",
  "사이트 내비게이션/메뉴 정상 작동",
  "성인/폭력/저작권 침해 등 금지 콘텐츠 없음",
  "미완성 페이지 없음 (사이트 디자인 완성도)",
  "연락처(Contact) 페이지 존재",
  "충분한 도메인 운영 기간 및 실사용 트래픽",
];

export default function PublisherPage() {
  const [articles, setArticles] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [targetBlogId, setTargetBlogId] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [autoPublishing, setAutoPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [publishResult, setPublishResult] = useState(null);

  async function loadArticles() {
    const res = await fetch("/api/articles", { cache: "no-store" });
    const data = await res.json();
    setArticles(data.articles || []);
  }

  async function loadBlogs() {
    const res = await fetch("/api/blogs", { cache: "no-store" });
    const data = await res.json();
    setBlogs(data.items || []);
  }

  useEffect(() => {
    // Client-side fetch-on-mount against our own API route; intentional for this admin tool.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadArticles();
    loadBlogs();
  }, []);

  const displayArticles = articles.filter((a) => ["written", "published"].includes(a.status));
  const writtenArticles = displayArticles.filter((a) => a.status === "written");
  const readyBlogs = blogs.filter((b) => b.status === "ready");
  const selected = articles.find((a) => a.id === selectedId);
  const selectedBlogRecord = blogs.find((b) => b.id === targetBlogId);
  const canAutoPublish = Boolean(selectedBlogRecord?.tokenRef);
  const isAlreadyPublished = Boolean(selected && (selected.status === "published" || selected.publishedUrl));

  async function handleAutoPublish() {
    if (!selected || !targetBlogId || !canAutoPublish) return;
    setAutoPublishing(true);
    setMessage("");
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: selected.id, blogId: targetBlogId }),
      });
      const data = await res.json();
      if (data.status === "succeeded") {
        setPublishResult({ publishedUrl: data.publishedUrl });
        setSelectedId("");
        setTargetBlogId("");
        setMessage("");
        loadArticles();
      } else if (data.status === "duplicate") {
        setMessage("이미 발행된 글입니다. 중복 발행이 차단되었습니다.");
        loadArticles();
      } else if (data.status === "auth_required") {
        setMessage("Blogger 인증이 만료되었습니다. Blog Manager에서 재연결 후 시도해주세요.");
      } else {
        setMessage(`자동 발행 실패: ${data.error || "오류 발생"}`);
      }
    } catch {
      setMessage("자동 발행 중 네트워크 오류가 발생했습니다.");
    }
    setAutoPublishing(false);
  }

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
        blogId: targetBlogId,
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
    setTargetBlogId("");
    loadArticles();
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
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
          <h2 className="text-lg font-semibold">애드센스 승인 체크리스트</h2>
          <p className="mt-1 text-xs text-zinc-500">사이트 단위로 운영자가 직접 점검하는 참고용 목록입니다.</p>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-300">
            {ADSENSE_CHECKLIST.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-zinc-600">□</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

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
                    onChange={() => { setSelectedId(a.id); setPublishResult(null); }}
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

        {displayArticles.length - writtenArticles.length > 0 && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold text-zinc-400">
              이미 발행됨 ({displayArticles.length - writtenArticles.length})
            </h2>
            <div className="mt-4 space-y-2">
              {displayArticles
                .filter((a) => a.status === "published" || a.publishedUrl)
                .map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 text-sm opacity-60"
                  >
                    <div>
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-zinc-500">{a.category}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="rounded-full bg-zinc-700 px-2 py-1 text-xs text-zinc-400">
                        발행됨
                      </span>
                      {a.publishedUrl && (
                        <a
                          href={a.publishedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-blue-400 hover:bg-zinc-700"
                        >
                          게시글 보기
                        </a>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {publishResult && (
          <section className="rounded-xl border border-emerald-700 bg-emerald-500/10 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-emerald-300">자동 발행 성공!</h2>
              <p className="mt-1 text-sm text-zinc-300">Blogger에 글이 정상 발행되었습니다.</p>
            </div>
            <a
              href={publishResult.publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all text-sm text-blue-400 hover:underline"
            >
              {publishResult.publishedUrl}
            </a>
            <div className="flex flex-wrap gap-3">
              <a
                href={publishResult.publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                게시글 보기
              </a>
              <Link
                href="/blog-manager"
                className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600"
              >
                Blog Manager로 이동
              </Link>
              <Link
                href="/"
                className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600"
              >
                Dashboard로 이동
              </Link>
            </div>
          </section>
        )}

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

            <BloggerChecklist article={selected} />

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">발행 완료 처리</h2>
              <div className="mt-3 flex flex-col gap-3">
                <select
                  value={targetBlogId}
                  onChange={(e) => setTargetBlogId(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
                >
                  <option value="">발행 대상 블로그 선택 (선택 사항)</option>
                  {readyBlogs.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.categoryFocus || "미지정"}){b.tokenRef ? " [연결됨]" : ""}
                    </option>
                  ))}
                </select>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                  <button
                    type="button"
                    onClick={handleAutoPublish}
                    disabled={autoPublishing || !canAutoPublish || isAlreadyPublished}
                    title={
                      isAlreadyPublished
                        ? "이미 발행된 글입니다"
                        : !canAutoPublish
                        ? "Blogger 연결된 블로그를 선택해주세요"
                        : "Blogger API로 자동 발행"
                    }
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                      canAutoPublish && !autoPublishing && !isAlreadyPublished
                        ? "bg-blue-600 text-white hover:bg-blue-500"
                        : "cursor-not-allowed bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {autoPublishing ? "발행 중..." : "자동 발행"}
                  </button>
                </div>
              </div>
              {message && <p className="mt-2 text-sm text-zinc-400">{message}</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function BloggerChecklist({ article }) {
  const items = getBloggerChecklist(article);
  const failedCount = items.filter((item) => !item.passed).length;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">Blogger 발행 체크리스트</h3>
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold ${
            failedCount === 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
          }`}
        >
          {failedCount === 0 ? "모두 통과" : `${failedCount}개 확인 필요`}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className={item.passed ? "text-emerald-400" : "text-red-400"}>
                {item.passed ? "✓" : "✗"}
              </span>
              <span className="text-zinc-300">{item.label}</span>
            </span>
            <span className="text-xs text-zinc-500">{item.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyBlock({ label, value, onCopy, tall }) {
  const [copyStatus, setCopyStatus] = useState("");

  async function handleCopyClick() {
    const success = await onCopy(value);
    setCopyStatus(success ? "복사됨" : "복사 실패 (직접 선택해서 복사해주세요)");
    setTimeout(() => setCopyStatus(""), 2000);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">{label}</h3>
        <div className="flex items-center gap-2">
          {copyStatus && (
            <span
              className={`text-xs ${
                copyStatus === "복사됨" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {copyStatus}
            </span>
          )}
          <button
            onClick={handleCopyClick}
            className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
          >
            복사
          </button>
        </div>
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
