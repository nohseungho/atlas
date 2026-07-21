"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { clearAuthIssue, getAuthIssues } from "@/lib/atlas/blog-auth-status";

const inputClass =
  "rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500";

const emptyForm = {
  name: "",
  platform: "blogger",
  url: "",
  bloggerBlogId: "",
  categoryFocus: "",
  memo: "",
};

const OPERATION_STATUS_COLORS = {
  ready: "bg-emerald-500/20 text-emerald-300",
  paused: "bg-zinc-700 text-zinc-200",
};

const CONNECTION_STYLES = {
  connected: {
    key: "connected",
    icon: "🟢",
    label: "연결 정상",
    className: "bg-emerald-500/10 text-emerald-300",
    subtext: "저장된 인증 정보가 있으며 최근 인증 오류가 없습니다.",
  },
  expired: {
    key: "expired",
    icon: "🟡",
    label: "재인증 필요",
    className: "bg-amber-500/10 text-amber-300",
    subtext: "최근 자동 발행에서 인증 오류가 확인되었습니다.",
  },
  not_connected: {
    key: "not_connected",
    icon: "🔴",
    label: "미연결",
    className: "bg-red-500/10 text-red-300",
    subtext: "Blogger 계정 연결이 필요합니다.",
  },
};

function getConnectionStatus(blog, authIssues) {
  if (!blog.tokenRef) return CONNECTION_STYLES.not_connected;
  if (authIssues[blog.id]) return CONNECTION_STYLES.expired;
  return CONNECTION_STYLES.connected;
}

function formatDate(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function bloggerDashboardUrl(bloggerBlogId) {
  return bloggerBlogId ? `https://www.blogger.com/blog/posts/${bloggerBlogId}` : null;
}

function getLastPublished(blogId, articles) {
  const published = articles
    .filter((a) => a.blogId === blogId && (a.status === "published" || a.publishedUrl))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return published[0] || null;
}

export default function BlogManagerPage() {
  return (
    <Suspense fallback={null}>
      <BlogManagerContent />
    </Suspense>
  );
}

function BlogManagerContent() {
  const searchParams = useSearchParams();
  const blogAuth = searchParams.get("blogAuth");
  const blogAuthMessage = searchParams.get("message");
  const reconnectedBlogId = searchParams.get("blogId");

  const [blogs, setBlogs] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [authIssues, setAuthIssues] = useState({});

  async function loadBlogs() {
    setLoading(true);
    const [blogsRes, articlesRes] = await Promise.all([
      fetch("/api/blogs", { cache: "no-store" }),
      fetch("/api/articles", { cache: "no-store" }),
    ]);
    const blogsData = await blogsRes.json();
    const articlesData = await articlesRes.json();
    setBlogs(blogsData.items || []);
    setArticles(articlesData.articles || []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBlogs();
    setAuthIssues(getAuthIssues());
  }, []);

  useEffect(() => {
    if (blogAuth === "success" && reconnectedBlogId) {
      clearAuthIssue(reconnectedBlogId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthIssues(getAuthIssues());
    }
  }, [blogAuth, reconnectedBlogId]);

  async function toggleStatus(id, status) {
    await fetch("/api/blogs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    loadBlogs();
  }

  async function handleDisconnect(id) {
    await fetch("/api/blogs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "disconnect" }),
    });
    loadBlogs();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("블로그 이름을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/blogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("블로그 등록에 실패했습니다.");
      return;
    }
    setForm(emptyForm);
    loadBlogs();
  }

  const connectedCount = blogs.filter(
    (b) => getConnectionStatus(b, authIssues).key === "connected"
  ).length;
  const expiredCount = blogs.filter(
    (b) => getConnectionStatus(b, authIssues).key === "expired"
  ).length;
  const notConnectedCount = blogs.filter(
    (b) => getConnectionStatus(b, authIssues).key === "not_connected"
  ).length;

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 sm:px-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Blog Operations Center</h1>
            <p className="mt-1 text-sm text-zinc-400">
              블로그 연결, OAuth 인증, 발행 상태와 운영 조치를 한 화면에서 관리합니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/publisher"
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
            >
              Publisher
            </Link>
            <Link
              href="/"
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
            >
              Dashboard
            </Link>
          </div>
        </header>

        {blogAuth === "success" && (
          <p className="rounded-lg border border-emerald-700 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            ✓ Blogger 인증이 다시 연결되었습니다.
          </p>
        )}
        {blogAuth === "error" && (
          <p className="rounded-lg border border-red-700 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            ✗ Blogger 연결 실패: {blogAuthMessage || "알 수 없는 오류"}
          </p>
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="전체 블로그" value={blogs.length} />
          <SummaryCard label="연결 정상" value={connectedCount} accent="text-emerald-400" />
          <SummaryCard label="재인증 필요" value={expiredCount} accent="text-amber-400" />
          <SummaryCard label="미연결" value={notConnectedCount} accent="text-red-400" />
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">블로그 운영 현황 ({blogs.length})</h2>
          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">불러오는 중...</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {blogs.map((b) => (
                <BlogCard
                  key={b.id}
                  blog={b}
                  connection={getConnectionStatus(b, authIssues)}
                  lastPublished={getLastPublished(b.id, articles)}
                  onToggleStatus={toggleStatus}
                  onDisconnect={handleDisconnect}
                />
              ))}
              {blogs.length === 0 && (
                <p className="text-sm text-zinc-500">등록된 블로그가 없습니다.</p>
              )}
            </div>
          )}
        </section>

        <details className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <summary className="cursor-pointer text-lg font-semibold">새 블로그 등록</summary>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="블로그 이름">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                placeholder="예: ATLAS Money Blog 04"
              />
            </Field>

            <Field label="플랫폼">
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                className={inputClass}
              >
                <option value="blogger">blogger</option>
              </select>
            </Field>

            <Field label="카테고리 포커스">
              <input
                value={form.categoryFocus}
                onChange={(e) => setForm({ ...form, categoryFocus: e.target.value })}
                className={inputClass}
                placeholder="예: 여행"
              />
            </Field>

            <Field label="URL (선택)">
              <input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                className={inputClass}
                placeholder="https://..."
              />
            </Field>

            <Field label="Blogger Blog ID (선택, 자동 발행 연동 준비용)">
              <input
                value={form.bloggerBlogId}
                onChange={(e) => setForm({ ...form, bloggerBlogId: e.target.value })}
                className={inputClass}
                placeholder="예: 1234567890123456789"
              />
            </Field>

            <Field label="메모" className="sm:col-span-2 lg:col-span-2">
              <textarea
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                className={`${inputClass} min-h-[42px]`}
              />
            </Field>

            <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? "등록 중..." : "블로그 등록"}
              </button>
              {error && <span className="text-sm text-red-400">{error}</span>}
            </div>
          </form>
        </details>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent = "text-zinc-50" }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function BlogCard({ blog: b, connection, lastPublished, onToggleStatus, onDisconnect }) {
  const dashboardUrl = bloggerDashboardUrl(b.bloggerBlogId);
  const reconnectLabel = b.tokenRef ? "재연결" : "Blogger 연결하기";
  const isPrimaryAuthAction = connection.key === "expired" || connection.key === "not_connected";
  const reconnectClassName = isPrimaryAuthAction
    ? connection.key === "expired"
      ? "bg-amber-600 hover:bg-amber-500 text-white"
      : "bg-blue-600 hover:bg-blue-500 text-white"
    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-zinc-100">{b.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {b.platform} · {b.categoryFocus || "미지정"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${connection.className}`}
        >
          {connection.icon} {connection.label}
        </span>
      </div>

      <p className="text-xs text-zinc-500">{connection.subtext}</p>

      <dl className="grid gap-x-4 gap-y-1 text-xs text-zinc-400 sm:grid-cols-2">
        <div className="truncate">
          <span className="text-zinc-500">Blog ID: </span>
          {b.bloggerBlogId || "미등록"}
        </div>
        <div className="truncate">
          <span className="text-zinc-500">URL: </span>
          {b.url || "미등록"}
        </div>
        <div className="sm:col-span-2">
          <span className="text-zinc-500">마지막 수정: </span>
          {formatDate(b.updatedAt)}
        </div>
      </dl>

      <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
        {lastPublished ? (
          <>
            <span className="text-zinc-500">마지막 발행: </span>
            <span className="text-zinc-300">{lastPublished.title}</span>
            <span className="text-zinc-500"> · {formatDate(lastPublished.updatedAt)}</span>
            {lastPublished.publishedUrl && (
              <a
                href={lastPublished.publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-blue-400 hover:underline"
              >
                열기
              </a>
            )}
          </>
        ) : (
          <span className="text-zinc-500">발행 기록 없음</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
        <span className="text-xs text-zinc-500">현재 상태: {b.status === "ready" ? "Ready" : "Paused"}</span>
        {b.status === "ready" ? (
          <button
            onClick={() => onToggleStatus(b.id, "paused")}
            className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
          >
            일시중지
          </button>
        ) : (
          <button
            onClick={() => onToggleStatus(b.id, "ready")}
            className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
          >
            운영 재개
          </button>
        )}
        <span
          className={`ml-auto rounded-full px-2 py-1 text-xs font-semibold ${
            OPERATION_STATUS_COLORS[b.status] || "bg-zinc-700 text-zinc-200"
          }`}
        >
          {b.status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
        <ActionLink href={b.url} label="블로그 보기" disabledReason="공개 URL이 등록되지 않았습니다" />
        <ActionLink
          href={dashboardUrl}
          label="Blogger 관리"
          disabledReason="Blogger Blog ID가 등록되지 않았습니다"
        />
        <a
          href={`/api/auth/blogger/start?blogId=${b.id}`}
          className={`rounded-md px-2 py-1 text-xs font-semibold ${reconnectClassName}`}
        >
          {reconnectLabel}
        </a>
        {b.tokenRef && (
          <button
            onClick={() => onDisconnect(b.id)}
            className="rounded-md bg-red-900/40 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-900/70"
          >
            연결 해제
          </button>
        )}
      </div>
    </div>
  );
}

function ActionLink({ href, label, disabledReason }) {
  if (!href) {
    return (
      <span
        title={disabledReason}
        className="cursor-not-allowed rounded-md bg-zinc-900 px-2 py-1 text-xs text-zinc-600"
      >
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-md bg-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-100 hover:bg-zinc-700"
    >
      {label}
    </a>
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
