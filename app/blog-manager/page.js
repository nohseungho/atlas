"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

const STATUS_COLORS = {
  ready: "bg-emerald-500/20 text-emerald-300",
  paused: "bg-zinc-700 text-zinc-200",
};

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
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function loadBlogs() {
    setLoading(true);
    const res = await fetch("/api/blogs", { cache: "no-store" });
    const data = await res.json();
    setBlogs(data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBlogs();
  }, []);

  async function toggleStatus(id, status) {
    await fetch("/api/blogs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
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

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 sm:px-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Blog Manager</h1>
            <p className="mt-1 text-sm text-zinc-400">발행 대상 블로그를 등록하고 관리합니다.</p>
          </div>
          <Link href="/" className="text-sm text-emerald-400 hover:underline">
            ← Dashboard
          </Link>
        </header>

        {blogAuth === "success" && (
          <p className="rounded-lg border border-emerald-700 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            ✓ Blogger 계정이 연결되었습니다.
          </p>
        )}
        {blogAuth === "error" && (
          <p className="rounded-lg border border-red-700 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            ✗ Blogger 연결 실패: {blogAuthMessage || "알 수 없는 오류"}
          </p>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">새 블로그 등록</h2>
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
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">등록된 블로그 ({blogs.length})</h2>
          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">불러오는 중...</p>
          ) : (
            <div className="mt-4 space-y-2">
              {blogs.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-800 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-zinc-500">
                      {b.platform} · {b.categoryFocus || "미지정"}
                      {b.url ? ` · ${b.url}` : ""}
                      {b.bloggerBlogId ? ` · Blogger ID: ${b.bloggerBlogId}` : " · Blogger ID 미등록"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        STATUS_COLORS[b.status] || "bg-zinc-700 text-zinc-200"
                      }`}
                    >
                      {b.status}
                    </span>
                    <button
                      onClick={() => toggleStatus(b.id, "ready")}
                      disabled={b.status === "ready"}
                      className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
                    >
                      Ready로 변경
                    </button>
                    <button
                      onClick={() => toggleStatus(b.id, "paused")}
                      disabled={b.status === "paused"}
                      className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
                    >
                      Paused로 변경
                    </button>
                    {b.tokenRef ? (
                      <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                        Blogger 연결됨
                      </span>
                    ) : (
                      <a
                        href={`/api/auth/blogger/start?blogId=${b.id}`}
                        className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-500"
                      >
                        Blogger 연결하기
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {blogs.length === 0 && (
                <p className="text-sm text-zinc-500">등록된 블로그가 없습니다.</p>
              )}
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
