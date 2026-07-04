"use client";

import { useEffect, useState } from "react";
import {
  KEYS,
  readList,
  readMap,
  writeMap,
} from "@/app/atlas/lib/storage";
import { parseBlogDNASections, parseFaqPairs } from "@/app/atlas/blog-studio/page";

// Publisher Integration: ATLAS Blog Draft를 기존 Publisher 엔진(app/api/articles → app/api/publish)이
// 이해하는 article 형태로 변환한다. 새 API를 만들지 않고 기존 두 엔드포인트만 그대로 호출한다.
function buildArticlePayload(blog, linkedProducts) {
  const sections = parseBlogDNASections(blog.body);
  const faqPairs = parseFaqPairs(sections["FAQ"]).map((f) => ({
    question: f.q,
    answer: f.a,
  }));
  const tags = [blog.category, ...linkedProducts.map((p) => p.name)].filter(Boolean);

  return {
    keywordId: "",
    title: blog.topic,
    metaDescription: blog.metaDescription,
    category: blog.category,
    tags,
    status: "written",
    bodyMarkdown: blog.body,
    faq: faqPairs,
  };
}

function buildYoutubePackage({ video, blog, productNames }) {
  const title = video.videoTitle || blog?.topic || "Untitled Video";
  const slug = blog?.slug || video.relatedBlogSlug || "";
  const description = [
    blog?.metaDescription || "",
    slug ? `자세한 내용은 블로그에서 확인하세요: ${slug}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const tags = [blog?.category, ...(productNames || [])].filter(Boolean);
  const pinnedComment =
    "이 영상에 나온 내용, 실제 정리는 블로그에 자세히 담아뒀습니다. 궁금한 점은 댓글로 남겨주세요!";
  const blogCta = slug ? `풀버전 아티클: ${slug}` : "(연결된 블로그 없음)";
  const affiliateCta =
    "영상 속 제품은 설명란 링크에서 확인할 수 있습니다. (제휴 링크 포함 — 구매 가격 변동 없음)";

  return { title, description, tags, pinnedComment, blogCta, affiliateCta };
}

// Publishing Checklist: 기존 Blog/Product/Video/ops Blog Channel 데이터만 참조 (신규 저장소 없음)
function computeChecklist({ blog, video, linkedProducts, blogChannels }) {
  return {
    "Blog MASTER": !!(
      blog &&
      blog.status === "Approved" &&
      blog.body?.trim() &&
      blog.metaDescription?.trim() &&
      blog.slug?.trim()
    ),
    "Image Prompt": !!(blog?.imagePrompts?.length > 0),
    "Shorts MASTER": !!video?.mp4Path?.trim(),
    "Product 연결": !!(blog?.productIds?.length > 0),
    // 버그 수정: placeholder 문자열("[Affiliate Link Placeholder]")이 그대로 남아있으면
    // 실제 제휴 링크가 아니므로 "완료"로 잘못 표시되던 것을 고쳤다 (2026-07-04, First Revenue Test).
    "Affiliate Link (Real)": !!(
      linkedProducts.length > 0 &&
      linkedProducts.every(
        (p) => p.affiliateLink?.trim() && p.affiliateLink.trim() !== "[Affiliate Link Placeholder]"
      )
    ),
    "Blogger Blog ID": blogChannels.some((b) => b.bloggerBlogId?.trim()),
  };
}

function computeStatus({ blog, checklistPassed, manualStatus }) {
  if (manualStatus === "Published") return "Published";
  if (manualStatus === "Archived") return "Archived";
  if (!blog || blog.status !== "Approved") return "Draft";
  if (!checklistPassed) return "MASTER";
  return "Ready to Publish";
}

const STATUS_STYLES = {
  Draft: "bg-zinc-800 text-zinc-300",
  MASTER: "bg-amber-500/10 text-amber-400",
  "Ready to Publish": "bg-emerald-500/10 text-emerald-400",
  Published: "bg-sky-500/10 text-sky-400",
  Archived: "bg-zinc-800 text-zinc-500",
};

export default function PublishingPage() {
  const [blogs, setBlogs] = useState([]);
  const [products, setProducts] = useState([]);
  const [videos, setVideos] = useState([]);
  const [blogChannels, setBlogChannels] = useState([]);
  const [manualStatusMap, setManualStatusMap] = useState({});
  const [selectedBlogId, setSelectedBlogId] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [publishState, setPublishState] = useState({}); // blogId -> { status: "publishing"|"succeeded"|"failed", url, error }

  useEffect(() => {
    setBlogs(readList(KEYS.blogDrafts));
    setProducts(readList(KEYS.products));
    setVideos(readList(KEYS.videoLibrary));
    setManualStatusMap(readMap(KEYS.publishingReady));

    // 신규 API 추가 없음 — 기존 ops 콘솔의 /api/blogs(Blogger 채널 목록)만 조회
    fetch("/api/blogs", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setBlogChannels(data.items || []))
      .catch(() => setBlogChannels([]));
  }, []);

  // Production Pipeline: Generate가 만든 Draft도 곧바로 확인할 수 있도록
  // Approved 외 상태(Draft 등)도 목록에 표시한다 (상태 배지로 구분됨).
  const masterCandidates = blogs;
  const selectedBlog =
    masterCandidates.find((b) => b.id === selectedBlogId) || masterCandidates[0] || null;

  function buildRow(blog) {
    const video = videos.find((v) => v.relatedBlogSlug === blog.slug) || null;
    const linkedProducts = (blog.productIds || [])
      .map((id) => products.find((p) => p.id === id))
      .filter(Boolean);
    const checklist = computeChecklist({ blog, video, linkedProducts, blogChannels });
    const checklistPassed = Object.values(checklist).every(Boolean);
    const manualStatus = manualStatusMap[blog.id];
    const status = computeStatus({ blog, checklistPassed, manualStatus });
    return { blog, video, linkedProducts, checklist, checklistPassed, status };
  }

  function setManualStatus(blogId, status) {
    const next = { ...manualStatusMap, [blogId]: status };
    setManualStatusMap(next);
    writeMap(KEYS.publishingReady, next);
  }

  // Publisher Integration: 기존 /api/articles(글 생성) → 기존 /api/publish(실제 Blogger 발행)를
  // 그대로 호출한다. checklist가 전부 통과했을 때만 호출되도록 버튼에서 gate 처리한다.
  async function handlePublishToBlogger(blog, linkedProducts) {
    const channel = blogChannels.find((b) => b.tokenRef?.trim());
    if (!channel) {
      setPublishState((prev) => ({
        ...prev,
        [blog.id]: { status: "failed", error: "연결된 Blogger 계정(tokenRef)이 없습니다." },
      }));
      return;
    }

    setPublishState((prev) => ({ ...prev, [blog.id]: { status: "publishing" } }));

    try {
      const articleRes = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildArticlePayload(blog, linkedProducts)),
      });
      if (!articleRes.ok) throw new Error("article 생성 실패");
      const article = await articleRes.json();

      const publishRes = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article.id, blogId: channel.id }),
      });
      const result = await publishRes.json();

      if (!publishRes.ok || result.status !== "succeeded") {
        throw new Error(result.error || "발행 실패");
      }

      setPublishState((prev) => ({
        ...prev,
        [blog.id]: { status: "succeeded", url: result.publishedUrl },
      }));
      setManualStatus(blog.id, "Published");
    } catch (err) {
      setPublishState((prev) => ({
        ...prev,
        [blog.id]: { status: "failed", error: err.message },
      }));
    }
  }

  function copyToClipboard(text, key) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 1500);
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold">Publishing Center</h1>
          <p className="mt-1 text-sm text-zinc-400">
            승인된 MASTER 콘텐츠를 선택해 발행 준비 상태를 확인합니다. 실제
            업로드/발행은 이 화면에서 수행하지 않습니다.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 lg:col-span-1">
            <h2 className="text-lg font-semibold">MASTER 콘텐츠 선택</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {masterCandidates.map((blog) => {
                const { status } = buildRow(blog);
                const isSelected = selectedBlog?.id === blog.id;
                return (
                  <li key={blog.id}>
                    <button
                      onClick={() => setSelectedBlogId(blog.id)}
                      className={`w-full rounded-lg border p-3 text-left ${
                        isSelected ? "border-emerald-600" : "border-zinc-800"
                      }`}
                    >
                      <p className="font-medium text-zinc-100">{blog.topic}</p>
                      <p className="mt-1 text-xs text-zinc-500">{blog.category}</p>
                      <span
                        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
                      >
                        {status}
                      </span>
                    </button>
                  </li>
                );
              })}
              {masterCandidates.length === 0 && (
                <li className="text-zinc-500">
                  Approved 상태의 Blog MASTER가 없습니다. Blog Studio에서 먼저
                  승인해주세요.
                </li>
              )}
            </ul>
          </div>

          <div className="space-y-4 lg:col-span-2">
            {selectedBlog ? (
              <BlogDetail
                row={buildRow(selectedBlog)}
                onSetStatus={setManualStatus}
                onCopy={copyToClipboard}
                copiedKey={copiedKey}
                onPublish={handlePublishToBlogger}
                publishState={publishState[selectedBlog.id]}
              />
            ) : (
              <p className="text-sm text-zinc-500">
                왼쪽에서 MASTER 콘텐츠를 선택하세요.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function BlogDetail({ row, onSetStatus, onCopy, copiedKey, onPublish, publishState }) {
  const { blog, video, linkedProducts, checklist, checklistPassed, status } = row;
  const productNames = linkedProducts.map((p) => p.name);
  const pkg = video ? buildYoutubePackage({ video, blog, productNames }) : null;
  const youtubePackageText = pkg
    ? `Title: ${pkg.title}\n\nDescription:\n${pkg.description}\n\nTags: ${pkg.tags.join(", ")}\n\nPinned Comment:\n${pkg.pinnedComment}`
    : "";

  return (
    <>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{blog.topic}</h2>
          <span
            className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}
          >
            {status}
          </span>
        </div>

        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Title" value={blog.topic} />
          <Row label="Category" value={blog.category} />
          <Row label="Slug" value={blog.slug} />
          <Row
            label="Product"
            value={productNames.length ? productNames.join(", ") : "(연결된 상품 없음)"}
          />
          <Row label="Shorts" value={video ? video.videoTitle : "(연결된 Shorts 없음)"} />
          <Row label="Status" value={status} />
        </dl>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-lg font-semibold">Publishing Checklist</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {Object.entries(checklist).map(([label, passed]) => (
            <li key={label} className="flex items-center justify-between border-b border-zinc-800 pb-2 last:border-0">
              <span>{label}</span>
              <span className={passed ? "text-emerald-400" : "text-zinc-500"}>
                {passed ? "완료" : "미완료"}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm">
            {checklistPassed ? (
              <span className="font-semibold text-emerald-400">Ready to Publish</span>
            ) : (
              <span className="text-zinc-500">체크리스트 미완료</span>
            )}
          </span>
          <button
            onClick={() => onPublish(blog, linkedProducts)}
            disabled={!checklistPassed || publishState?.status === "publishing"}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {publishState?.status === "publishing" ? "발행 중..." : "Mark as Published"}
          </button>
          <button
            onClick={() => onSetStatus(blog.id, "Archived")}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            Archive
          </button>
        </div>

        {publishState?.status === "succeeded" && (
          <p className="mt-3 rounded-lg border border-emerald-800 bg-emerald-500/5 p-3 text-sm text-emerald-400">
            Blogger 발행 성공:{" "}
            <a href={publishState.url} target="_blank" rel="noreferrer" className="underline">
              {publishState.url}
            </a>
          </p>
        )}
        {publishState?.status === "failed" && (
          <p className="mt-3 rounded-lg border border-red-800 bg-red-500/5 p-3 text-sm text-red-400">
            Blogger 발행 실패: {publishState.error}
          </p>
        )}
      </div>

      {pkg && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">YouTube Package</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="YouTube Title" value={pkg.title} />
            <Row label="Description" value={pkg.description} pre />
            <Row label="Tags" value={pkg.tags.join(", ")} />
            <Row label="Pinned Comment" value={pkg.pinnedComment} />
            <Row label="Blog CTA" value={pkg.blogCta} />
            <Row label="Affiliate CTA" value={pkg.affiliateCta} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => onCopy(youtubePackageText, `yt-${blog.id}`)}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
            >
              {copiedKey === `yt-${blog.id}` ? "복사됨!" : "Copy YouTube Package"}
            </button>
            <button
              onClick={() => onCopy(pkg.blogCta, `cta-${blog.id}`)}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
            >
              {copiedKey === `cta-${blog.id}` ? "복사됨!" : "Copy Blog CTA"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value, pre }) {
  return (
    <div className="border-b border-zinc-800 pb-2 last:border-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 text-zinc-200 ${pre ? "whitespace-pre-wrap" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
