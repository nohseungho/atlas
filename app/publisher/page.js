"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { buildBloggerHtml, buildLocalPreviewHtml, getBloggerChecklist } from "@/lib/html-exporter";
import { flagAuthIssue, clearAuthIssue } from "@/lib/atlas/blog-auth-status";
import { isPublicImageUrl } from "@/lib/atlas/revenue-layout-engine";

const VISUAL_ASSET_LABELS = {
  leadEditorial: "대표 이미지",
  clinicEditorial: "의료 상담 이미지",
  delayEditorial: "공항 지연 이미지",
  comparisonInfographic: "비교 기준 이미지",
  checklistInfographic: "결정 체크리스트 이미지",
  beforeBuyInfographic: "가입 전 확인 이미지",
};

const PREVIEW_DEVICES = [
  { id: "desktop", label: "Desktop 1440px", width: 1440 },
  { id: "tablet", label: "Tablet 768px", width: 768 },
  { id: "mobile", label: "Mobile 390px", width: 390 },
];

const PUBLISH_STATE_LABELS = {
  written: "작성 완료 (승인 전)",
  approved: "승인됨 (발행 대기)",
  publishing: "발행 중",
  published: "발행 완료",
  publish_failed: "발행 실패",
};

const PUBLISH_STATE_STYLES = {
  written: "bg-zinc-700 text-zinc-300",
  approved: "bg-amber-500/20 text-amber-300",
  publishing: "bg-blue-500/20 text-blue-300",
  published: "bg-emerald-500/20 text-emerald-300",
  publish_failed: "bg-red-500/20 text-red-300",
};

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
  return (
    <Suspense fallback={null}>
      <PublisherContent />
    </Suspense>
  );
}

function PublisherContent() {
  const searchParams = useSearchParams();
  const preselectId = searchParams.get("id") || "";

  const [articles, setArticles] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [view, setView] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [previewedIds, setPreviewedIds] = useState([]);
  const [targetBlogId, setTargetBlogId] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [publishResult, setPublishResult] = useState(null);
  const [authRequiredBlogId, setAuthRequiredBlogId] = useState("");

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

  // Publisher state comes from the server on every load — publish state, postId,
  // URL, publish time and approval all survive a refresh / browser restart.
  async function loadView() {
    const res = await fetch("/api/atlas/publisher-status", { cache: "no-store" });
    const data = await res.json();
    setView(data);
    return data;
  }

  async function refreshAll() {
    await Promise.all([loadArticles(), loadView()]);
  }

  useEffect(() => {
    // Client-side fetch-on-mount against our own API route; intentional for this admin tool.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadArticles();
    loadBlogs();
    loadView();
  }, []);

  useEffect(() => {
    if (preselectId && articles.some((a) => a.id === preselectId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(preselectId);
    }
  }, [preselectId, articles]);

  const readyBlogs = blogs.filter((b) => b.status === "ready");
  const connectedBlogs = blogs.filter((b) => b.tokenRef);
  const selected = articles.find((a) => a.id === selectedId);
  const isAlreadyPublished = Boolean(selected && (selected.status === "published" || selected.publishedUrl));

  function openPreview(articleId) {
    setSelectedId(articleId);
    setPublishResult(null);
    setPreviewedIds((prev) => (prev.includes(articleId) ? prev : [...prev, articleId]));
  }

  async function handleAutoPublish(articleId, blogId) {
    setMessage("");
    setAuthRequiredBlogId("");
    const res = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, blogId }),
    });
    const data = await res.json();

    if (data.status === "succeeded") {
      clearAuthIssue(blogId);
      setPublishResult({ publishedUrl: data.publishedUrl, postId: data.postId, verified: data.verified });
    } else if (data.status === "linked_existing") {
      setMessage(`기존 글 연결됨 (${data.matchedBy} 일치) — 새 게시물을 만들지 않았습니다. postId: ${data.postId}`);
    } else if (data.status === "duplicate") {
      setMessage("이미 발행된 글입니다. 중복 발행이 차단되었습니다.");
    } else if (data.status === "in_progress") {
      setMessage("이미 발행 요청이 진행 중입니다.");
    } else if (data.status === "not_approved") {
      setMessage("승인되지 않은 글입니다. 미리보기 확인 후 승인해주세요.");
    } else if (data.status === "conflict") {
      setMessage(`중복 위험: ${data.error}`);
    } else if (data.status === "auth_required") {
      flagAuthIssue(blogId, data.error);
      setAuthRequiredBlogId(blogId);
      setMessage("Blogger 재연결 필요 — 재연결 후 다시 시도해주세요.");
    } else {
      setMessage(`자동 발행 실패: ${data.error || "오류 발생"}`);
    }

    await refreshAll();
    return data;
  }

  async function handleApproval(articleId, action) {
    setMessage("");
    const res = await fetch("/api/atlas/publisher-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, action }),
    });
    const data = await res.json();
    if (data.status !== "ok") setMessage(`승인 처리 실패: ${data.errorCode || "오류"}`);
    await refreshAll();
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
    refreshAll();
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
            <p className="mt-1 text-sm text-zinc-400">
              Blogger 실제 공개 상태를 동기화하고, 승인한 글만 자동 발행합니다.
            </p>
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

        <PublisherControlCenter
          view={view}
          connectedBlogs={connectedBlogs}
          selectedId={selectedId}
          previewedIds={previewedIds}
          onPreview={openPreview}
          onApproval={handleApproval}
          onAutoPublish={handleAutoPublish}
          onSynced={setView}
          onRefresh={refreshAll}
          message={message}
        />

        {publishResult && (
          <section className="rounded-xl border border-emerald-700 bg-emerald-500/10 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-emerald-300">자동 발행 성공!</h2>
              <p className="mt-1 text-sm text-zinc-300">
                Blogger에 글이 정상 발행되었습니다. postId: {publishResult.postId || "-"}
                {publishResult.verified ? " (공개 상태 재조회 확인됨)" : ""}
              </p>
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

            <BloggerDraftPanel article={selected} blogs={blogs} />

            <BloggerChecklist article={selected} />

            <VisualAssetsPanel key={`${selected.id}-assets`} article={selected} onSaved={refreshAll} />

            <LocalPreviewPanel key={`${selected.id}-preview`} article={selected} />

            {isAlreadyPublished ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <h2 className="text-lg font-semibold text-zinc-400">발행 완료 처리</h2>
                <p className="mt-2 text-sm text-zinc-500">
                  이미 발행된 글입니다. 발행 상태와 게시글 URL은 여기서 변경할 수 없습니다 — 위 이미지 준비 상태 / Local
                  Preview만 확인·저장할 수 있습니다.
                </p>
              </div>
            ) : (
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
                </div>
                <p className="text-xs text-zinc-500">
                  Blogger API 자동 발행은 위 <span className="text-zinc-300">Blogger 발행 관제</span>에서 승인 후 실행합니다.
                  이 입력란은 외부에서 직접 발행한 글의 URL을 기록할 때만 사용합니다.
                </p>
              </div>
              {message && <p className="mt-2 text-sm text-zinc-400">{message}</p>}
              {authRequiredBlogId && (
                <div className="mt-3 flex flex-wrap gap-3 rounded-lg border border-amber-700 bg-amber-500/10 p-3">
                  <a
                    href={`/api/auth/blogger/start?blogId=${authRequiredBlogId}`}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
                  >
                    지금 재연결
                  </a>
                  <Link
                    href="/blog-manager"
                    className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600"
                  >
                    Blog Operations Center 열기
                  </Link>
                </div>
              )}
            </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// Blogger 발행 관제: real public state on top, one row per article underneath.
// Every value shown here is server data (data/atlas/*.json) — nothing is read
// from localStorage, so a refresh or a browser restart shows the same thing.
function PublisherControlCenter({
  view,
  connectedBlogs,
  selectedId,
  previewedIds,
  onPreview,
  onApproval,
  onAutoPublish,
  onSynced,
  onRefresh,
  message,
}) {
  const [blogId, setBlogId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (!blogId && connectedBlogs.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBlogId(connectedBlogs[0].id);
    }
  }, [blogId, connectedBlogs]);

  const counts = view?.counts;
  const state = view?.state;
  const rows = view?.rows || [];
  const externalPosts = state?.externalPosts || [];
  const needsReconnect = state?.connection === "reconnect_required";

  async function runSync() {
    if (syncing || !blogId) return;
    setSyncing(true);
    setSyncNote("");
    try {
      const res = await fetch("/api/atlas/blogger-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogId }),
      });
      const data = await res.json();
      onSynced(data);
      if (data.status === "reconnect_required") setSyncNote("Blogger 재연결 필요");
      else if (data.status === "error") setSyncNote(`동기화 실패: ${data.message || "오류"}`);
      else if (data.status === "conflict") setSyncNote("동일 제목 공개 게시물이 중복되어 일부는 자동 연결하지 않았습니다.");
      else setSyncNote(`동기화 완료 — 실제 공개 ${data.counts?.bloggerLive ?? "?"}개`);
      await onRefresh();
    } catch {
      setSyncNote("동기화 중 네트워크 오류가 발생했습니다.");
    }
    setSyncing(false);
  }

  // Every row action locks the whole list while it is in flight, so rapid
  // double-clicks cannot fire a second publish request.
  async function runRowAction(rowId, fn) {
    if (busyId) return;
    setBusyId(rowId);
    try {
      await fn();
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Blogger 발행 관제</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={blogId}
            onChange={(e) => setBlogId(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500"
          >
            {connectedBlogs.length === 0 && <option value="">연결된 블로그 없음</option>}
            {connectedBlogs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} [연결됨]
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={runSync}
            disabled={syncing || !blogId}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              !syncing && blogId ? "bg-blue-600 text-white hover:bg-blue-500" : "cursor-not-allowed bg-zinc-800 text-zinc-500"
            }`}
          >
            {syncing ? "동기화 중..." : "Blogger 상태 동기화"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Blogger 실제 공개" value={counts?.bloggerLive} />
        <StatTile label="ATLAS 연결 공개" value={counts?.atlasLinked} tone="emerald" />
        <StatTile label="외부 게시물" value={counts?.external} />
        <StatTile label="발행 대기" value={counts?.pending} tone="amber" />
        <StatTile label="연결 누락" value={counts?.missingLinks} tone={counts?.missingLinks ? "red" : "zinc"} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>마지막 동기화: {state?.lastSyncedAt ? new Date(state.lastSyncedAt).toLocaleString("ko-KR") : "없음"}</span>
        <span>
          Blogger 연결:{" "}
          <span className={needsReconnect ? "text-amber-400" : state?.connection === "connected" ? "text-emerald-400" : "text-zinc-400"}>
            {needsReconnect ? "재연결 필요" : state?.connection === "connected" ? "연결됨" : "미확인"}
          </span>
        </span>
      </div>

      {needsReconnect && blogId && (
        <a
          href={`/api/auth/blogger/start?blogId=${blogId}`}
          className="mt-3 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
        >
          Blogger 재연결
        </a>
      )}

      {syncNote && <p className="mt-3 text-sm text-zinc-400">{syncNote}</p>}
      {message && <p className="mt-1 text-sm text-amber-300">{message}</p>}

      <div className="mt-5 space-y-2">
        {rows.map((row) => {
          const previewed = previewedIds.includes(row.articleId);
          const busy = busyId === row.articleId;
          return (
            <div
              key={row.articleId}
              className={`rounded-lg border px-4 py-3 text-sm ${
                selectedId === row.articleId ? "border-emerald-500 bg-emerald-500/5" : "border-zinc-800"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="mr-2 font-mono text-xs text-zinc-500">{row.articleId}</span>
                    {row.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${PUBLISH_STATE_STYLES[row.publishState] || "bg-zinc-700 text-zinc-300"}`}>
                      {PUBLISH_STATE_LABELS[row.publishState] || row.publishState}
                    </span>
                    <span className={row.postId ? "text-emerald-400" : row.missingLink ? "text-red-400" : "text-zinc-500"}>
                      Blogger {row.postId ? `연결됨 (${row.bloggerStatus || "LIVE"})` : row.missingLink ? "연결 누락" : "미연결"}
                    </span>
                    {row.postId && <span className="font-mono text-zinc-500">postId {row.postId}</span>}
                    {row.publishedAt && (
                      <span className="text-zinc-500">발행 {new Date(row.publishedAt).toLocaleString("ko-KR")}</span>
                    )}
                  </div>
                  {row.url && (
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-xs text-blue-400 hover:underline"
                    >
                      {row.url}
                    </a>
                  )}
                  {row.error && (
                    <p className="mt-1 text-xs text-red-400">
                      {row.errorCode ? `[${row.errorCode}] ` : ""}
                      {row.error}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPreview(row.articleId)}
                    className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-emerald-400 hover:bg-zinc-700"
                  >
                    미리보기
                  </button>

                  {row.canApprove && (
                    <button
                      type="button"
                      disabled={busy || !previewed}
                      title={previewed ? "발행 승인" : "먼저 미리보기를 확인해주세요"}
                      onClick={() => runRowAction(row.articleId, () => onApproval(row.articleId, "approve"))}
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        previewed && !busy ? "bg-amber-600 text-white hover:bg-amber-500" : "cursor-not-allowed bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      승인
                    </button>
                  )}

                  {row.canRevoke && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runRowAction(row.articleId, () => onApproval(row.articleId, "revoke"))}
                      className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      승인 취소
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!row.canPublish || busy || !blogId}
                    title={
                      row.canPublish
                        ? "승인된 글을 Blogger에 자동 발행합니다"
                        : row.publishState === "published"
                        ? "이미 발행된 글입니다"
                        : "승인 후에만 자동 발행할 수 있습니다"
                    }
                    onClick={() => runRowAction(row.articleId, () => onAutoPublish(row.articleId, blogId))}
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${
                      row.canPublish && !busy && blogId
                        ? "bg-blue-600 text-white hover:bg-blue-500"
                        : "cursor-not-allowed bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {busy ? "처리 중..." : "자동 발행"}
                  </button>

                  {row.canUpdateExisting && (
                    <button
                      type="button"
                      onClick={() => onPreview(row.articleId)}
                      title="기존 Blogger 글 업데이트는 아래 '이미지 준비 상태' 패널에서 실행합니다 (새 글 생성 없음)"
                      className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                    >
                      기존 글 업데이트
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-zinc-500">글이 없습니다.</p>}
      </div>

      {externalPosts.length > 0 && (
        <div className="mt-5 border-t border-zinc-800 pt-4">
          <h3 className="text-sm font-semibold text-zinc-300">외부 게시물 ({externalPosts.length})</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Blogger에는 공개되어 있지만 ATLAS article이 아닌 게시물입니다. ATLAS article로 생성하지 않습니다.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            {externalPosts.map((p) => (
              <li key={p.id} className="break-all">
                · {p.title || "(제목 없음)"} <span className="font-mono text-zinc-600">postId {p.id}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function StatTile({ label, value, tone = "zinc" }) {
  const toneClass = {
    zinc: "text-zinc-100",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
  }[tone];
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value ?? "-"}</p>
    </div>
  );
}

// One-click "Blogger 초안 반영": PATCH an existing manual draft or create a new
// DRAFT — never a public publish. Idempotent server-side (same postId reused).
function BloggerDraftPanel({ article, blogs }) {
  const connectedBlogs = blogs.filter((b) => b.tokenRef);
  const [blogId, setBlogId] = useState(() => connectedBlogs[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function run() {
    if (!blogId || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/atlas/blogger-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article.id, blogId }),
      });
      setResult(await res.json());
    } catch {
      setResult({ status: "error", errorCode: "NETWORK_ERROR" });
    }
    setBusy(false);
  }

  const editUrl =
    result?.status === "ok" && result.bloggerBlogId && result.postId
      ? `https://www.blogger.com/blog/post/edit/${result.bloggerBlogId}/${result.postId}`
      : "";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">Blogger 초안 반영</h3>
        <span className="text-xs text-zinc-500">공개 발행 아님 · DRAFT 전용</span>
      </div>

      {connectedBlogs.length === 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-amber-400">Blogger 연결 필요</p>
          <a
            href="/blog-manager"
            className="inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
          >
            Blogger 연결
          </a>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={blogId}
            onChange={(e) => setBlogId(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            {connectedBlogs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} [연결됨]
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={run}
            disabled={busy || !blogId}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              !busy && blogId ? "bg-blue-600 text-white hover:bg-blue-500" : "cursor-not-allowed bg-zinc-800 text-zinc-500"
            }`}
          >
            {busy ? "초안 반영 중..." : "Blogger 초안 반영"}
          </button>
        </div>
      )}

      {result && (
        <div className="mt-3 text-xs">
          {result.status === "ok" ? (
            <div className="space-y-1">
              <p className="text-emerald-400">
                Blogger 초안에 반영되었습니다. ({result.action === "patched" ? "기존 초안 업데이트" : "새 초안 생성"})
              </p>
              <p className="text-zinc-400">postId: {result.postId}</p>
              <p className={result.remote?.isDraft ? "text-emerald-400" : "text-red-400"}>
                상태: {result.remote?.status || "?"} {result.remote?.isDraft ? "(DRAFT 유지)" : "(확인 필요)"}
              </p>
              <p className="text-zinc-400">
                이미지: {result.remote?.imgCount ?? 0}개 (Cloudinary {result.remote?.cloudinaryCount ?? 0})
              </p>
              {editUrl && (
                <a href={editUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-blue-400 hover:underline">
                  Blogger 초안 편집 열기
                </a>
              )}
            </div>
          ) : result.status === "reconnect_required" ? (
            <div className="space-y-2">
              <p className="text-amber-400">{result.message || "Blogger 연결이 만료되었습니다."}</p>
              {blogId && (
                <a
                  href={`/api/auth/blogger/start?blogId=${blogId}`}
                  className="inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
                >
                  다시 연결
                </a>
              )}
            </div>
          ) : result.status === "multiple_candidates" ? (
            <div className="space-y-1">
              <p className="text-amber-400">{result.message}</p>
              {(result.candidates || []).map((c) => (
                <p key={c.id} className="text-zinc-500">
                  - {c.title} (postId: {c.id})
                </p>
              ))}
            </div>
          ) : (
            <p className="text-red-400">
              실패: {result.errorCode || "오류"} {result.issues ? `(${result.issues.join(", ")})` : ""} {result.message || ""}
            </p>
          )}
        </div>
      )}
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

function VisualAssetsPanel({ article, onSaved }) {
  const assets = Array.isArray(article.visualAssets) ? article.visualAssets : [];
  // Dynamic over the selected article's own visualAssets — never a hardcoded
  // count, so art_002 (3) and art_003 (5) both render correctly.
  const requiredAssets = assets.filter((a) => a.required !== false);
  const publicReadyCount = requiredAssets.filter((a) => isPublicImageUrl(a.publicUrl)).length;
  const isWritten = article.status === "written";
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(assets.map((a) => [a.key, a.publicUrl || ""]))
  );
  const [savingKey, setSavingKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [readiness, setReadiness] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState("");
  const [syncResult, setSyncResult] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareStage, setPrepareStage] = useState("");
  const [prepareResult, setPrepareResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/articles/upload-visuals?articleId=${encodeURIComponent(article.id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setReadiness(data);
      })
      .catch(() => {
        if (!cancelled) setReadiness(null);
      });
    return () => {
      cancelled = true;
    };
  }, [article.id]);

  if (assets.length === 0) return null;

  const canSync = Boolean(
    readiness &&
      assets.length > 0 &&
      readiness.requiredLocalReady &&
      article.status === "published" &&
      readiness.hasStoredPostReference &&
      readiness.cloudinaryConfigured
  );

  // prepare (written drafts): only needs local files + Cloudinary config. No
  // Blogger post reference required, because prepare never touches Blogger.
  const canPrepare = Boolean(
    readiness &&
      assets.length > 0 &&
      readiness.requiredLocalReady &&
      isWritten &&
      readiness.cloudinaryConfigured
  );

  async function handlePrepare() {
    setPreparing(true);
    setPrepareResult(null);
    setPrepareStage("이미지 확인 중");
    setPrepareStage("Cloudinary 업로드 중");
    try {
      const res = await fetch("/api/articles/upload-visuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article.id, mode: "prepare" }),
      });
      setPrepareStage("공개 URL 저장 중");
      const data = await res.json();
      setPrepareResult({ ok: res.ok, data });
      setPrepareStage(res.ok ? "이미지 공개 준비 완료" : "실패");
      onSaved();
    } catch {
      setPrepareResult({ ok: false, data: { errorCode: "NETWORK_ERROR" } });
      setPrepareStage("실패");
    }
    setPreparing(false);
  }

  async function handleSyncAndUpdate() {
    setSyncing(true);
    setSyncResult(null);
    setSyncStage("이미지 확인 중");
    setSyncStage("Cloudinary 업로드 중");
    try {
      const res = await fetch("/api/articles/upload-visuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article.id, mode: "sync" }),
      });
      setSyncStage("공개 URL 저장 중");
      const data = await res.json();
      setSyncStage("기존 Blogger 글 업데이트 중");
      setSyncResult(data);
      setSyncStage(res.ok && data?.bloggerUpdate?.status === "updated" ? "완료" : "실패");
      onSaved();
    } catch {
      setSyncResult({ errorCode: "NETWORK_ERROR" });
      setSyncStage("실패");
    }
    setSyncing(false);
  }

  async function handleSave(assetKey) {
    setSavingKey(assetKey);
    setSavedKey("");
    const nextAssets = assets.map((a) =>
      a.key === assetKey ? { ...a, publicUrl: (drafts[assetKey] || "").trim() } : a
    );
    const res = await fetch("/api/articles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: article.id, visualAssets: nextAssets }),
    });
    setSavingKey("");
    if (res.ok) {
      setSavedKey(assetKey);
      onSaved();
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">이미지 준비 상태</h3>
        <span className="text-xs text-zinc-500">
          공개 URL 준비 {publicReadyCount}/{requiredAssets.length}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {assets.map((asset) => {
          const localReady = Boolean(asset.localSrc);
          const publicReady = isPublicImageUrl(asset.publicUrl);
          return (
            <div key={asset.key} className="rounded-lg border border-zinc-800 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-200">
                  {VISUAL_ASSET_LABELS[asset.key] || asset.key}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className={localReady ? "text-emerald-400" : "text-red-400"}>
                    로컬 미리보기 {localReady ? "준비됨" : "미준비"}
                  </span>
                  <span className={publicReady ? "text-emerald-400" : "text-amber-400"}>
                    공개 URL {publicReady ? "준비됨" : "필요"}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={drafts[asset.key] ?? ""}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [asset.key]: e.target.value }))
                  }
                  placeholder="공개 이미지 URL (https://...)"
                  className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => handleSave(asset.key)}
                  disabled={savingKey === asset.key}
                  className="rounded-md bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {savingKey === asset.key ? "저장 중..." : "저장"}
                </button>
                {savedKey === asset.key && <span className="text-xs text-emerald-400">저장됨</span>}
              </div>
            </div>
          );
        })}
      </div>

      {isWritten ? (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <p className="mb-2 text-xs text-zinc-400">
            Cloudinary에 이미지만 업로드하고 공개 URL을 저장합니다. Blogger에는 아직 발행하지 않습니다.
          </p>
          <button
            type="button"
            onClick={handlePrepare}
            disabled={!canPrepare || preparing}
            title={
              !readiness
                ? "상태 확인 중..."
                : !readiness.cloudinaryConfigured
                ? "Cloudinary 설정이 필요합니다"
                : !readiness.requiredLocalReady
                ? "필수 이미지 로컬 파일이 준비되지 않았습니다"
                : "이미지를 Cloudinary에 업로드하고 공개 URL을 저장합니다 (Blogger 발행 없음)"
            }
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              canPrepare && !preparing
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "cursor-not-allowed bg-zinc-800 text-zinc-500"
            }`}
          >
            이미지 공개 준비
          </button>
          {preparing && <p className="mt-2 text-xs text-amber-400">{prepareStage}...</p>}
          {!preparing &&
            prepareResult &&
            (prepareResult.ok ? (
              <div className="mt-3 space-y-1 text-xs">
                <p className="text-emerald-400">
                  이미지 {prepareResult.data.preparedCount ?? publicReadyCount}/
                  {prepareResult.data.requiredCount ?? requiredAssets.length} 공개 준비 완료
                </p>
                <p className="text-emerald-400">Blogger 발행 없음</p>
                <p className="text-zinc-500">새 글 생성 없음</p>
              </div>
            ) : (
              <div className="mt-3 space-y-1 text-xs">
                <p className="text-red-400">
                  실패: {prepareResult.data.errorCode || prepareResult.data.bloggerUpdate?.errorCode || "알 수 없는 오류"}
                </p>
                {prepareResult.data.results
                  ?.filter((r) => r.status !== "success" && r.status !== "ready")
                  .map((r) => (
                    <p key={r.key} className="text-zinc-500">
                      - {VISUAL_ASSET_LABELS[r.key] || r.key}: {r.status} ({r.errorCode || "-"})
                    </p>
                  ))}
              </div>
            ))}
        </div>
      ) : (
        <div className="mt-4 border-t border-zinc-800 pt-4">
        <button
          type="button"
          onClick={handleSyncAndUpdate}
          disabled={!canSync || syncing}
          title={
            !readiness
              ? "상태 확인 중..."
              : !readiness.cloudinaryConfigured
              ? "Cloudinary 설정이 필요합니다"
              : !readiness.requiredLocalReady
              ? "필수 이미지 로컬 파일이 준비되지 않았습니다"
              : article.status !== "published"
              ? "발행된 글에서만 사용할 수 있습니다"
              : !readiness.hasStoredPostReference
              ? "기존 Blogger 게시글 기록을 찾을 수 없습니다"
              : "이미지를 Cloudinary에 업로드하고 기존 Blogger 글을 업데이트합니다"
          }
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            canSync && !syncing
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "cursor-not-allowed bg-zinc-800 text-zinc-500"
          }`}
        >
          이미지 공개 연결 및 기존 글 업데이트
        </button>
        {syncing && <p className="mt-2 text-xs text-amber-400">{syncStage}...</p>}
        {!syncing && syncResult && (
          <div className="mt-3 space-y-1 text-xs">
            {syncResult.bloggerUpdate?.status === "updated" ? (
              <>
                <p className="text-emerald-400">
                  이미지 {syncResult.results?.filter((r) => r.status === "success").length ?? 0}/
                  {assets.length} 공개 연결 완료
                </p>
                <p className="text-emerald-400">Blogger 기존 글 업데이트 완료</p>
                <p className="text-zinc-400 break-all">
                  기존 게시글 URL: {syncResult.bloggerUpdate.publishedUrl}
                </p>
                <p className="text-zinc-500">새 글 생성 없음</p>
              </>
            ) : (
              <>
                <p className="text-red-400">
                  실패: {syncResult.errorCode || syncResult.bloggerUpdate?.errorCode || "알 수 없는 오류"}
                </p>
                {syncResult.results?.filter((r) => r.status !== "success").map((r) => (
                  <p key={r.key} className="text-zinc-500">
                    - {VISUAL_ASSET_LABELS[r.key] || r.key}: {r.status} ({r.errorCode || "-"})
                  </p>
                ))}
              </>
            )}
          </div>
        )}
        </div>
      )}
    </div>
  );
}

function LocalPreviewPanel({ article }) {
  const [deviceId, setDeviceId] = useState("desktop");
  const device = PREVIEW_DEVICES.find((d) => d.id === deviceId) || PREVIEW_DEVICES[0];
  const previewHtml = buildLocalPreviewHtml(article);
  const doc = `<!doctype html><html><head><meta charset="utf-8" />
<style>*{box-sizing:border-box;}body{margin:0;padding:16px;background:#0b0b0f;}
.atlas-preview-shell{max-width:720px;margin:0 auto;background:#ffffff;padding:24px;border-radius:8px;}
img{max-width:100%;}</style>
</head><body><div class="atlas-preview-shell">${previewHtml}</div></body></html>`;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">Local Preview</h3>
        <div className="flex gap-2">
          {PREVIEW_DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDeviceId(d.id)}
              className={`rounded-md px-2 py-1 text-xs ${
                deviceId === d.id ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <iframe
          title="Local Preview"
          srcDoc={doc}
          style={{
            width: `${device.width}px`,
            height: "900px",
            border: "1px solid #27272a",
            borderRadius: "8px",
            background: "#ffffff",
            display: "block",
          }}
        />
      </div>
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
