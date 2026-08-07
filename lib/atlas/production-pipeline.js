// ─── ATLAS R3 Production Pipeline (server-side Job Runner) ────────────────────
// Executes the one-click content pipeline as a persistent, resumable job:
//   RESEARCHING → WRITING → VALIDATING → GENERATING_IMAGES → UPLOADING_IMAGES
//   → BUILDING_PREVIEW → CREATING_BLOGGER_DRAFT → READY_FOR_REVIEW
//
// Honesty is enforced at every step: a missing provider stops the job at the
// exact BLOCKED_* state (state preserved + resumable) instead of fabricating
// output. No fake article, source, image URL, or Blogger post id is ever made,
// and nothing is published — publishing is a separate human-approved action.
import { readJson, writeJson } from "@/lib/data-store";
import { markdownToHtml, buildBloggerHtml } from "@/lib/html-exporter";
import { gatherSources } from "@/lib/atlas/providers/research-provider";
import { contentProviderReadiness, generateDraftFromRecommendation } from "@/lib/atlas/providers/content-provider";
import { generateImages } from "@/lib/atlas/providers/image-provider";
import { isCloudinaryConfigured, uploadArticleImageData } from "@/lib/atlas/providers/cloudinary-provider";
import { getTokenByBlogId, decryptToken, upsertTokenForBlog } from "@/lib/atlas/repositories/token-repository";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import { runArticleQa } from "@/lib/atlas/qa-engine";
import { assertProductionEligible } from "@/lib/atlas/recommendation-engine";
import { countActiveAffiliate } from "@/lib/atlas/affiliate-status";
import { isPublicImageUrl } from "@/lib/atlas/revenue-layout-engine";
import { selectDraftCandidate } from "@/lib/atlas/blogger-draft-utils";
import { getProductionJob, updateProductionJob, reserveArticleId } from "@/lib/atlas/repositories/production-job-repository";

export const STEP_SEQUENCE = [
  "RESEARCHING",
  "WRITING",
  "VALIDATING",
  "GENERATING_IMAGES",
  "UPLOADING_IMAGES",
  "BUILDING_PREVIEW",
  "CREATING_BLOGGER_DRAFT",
];
const TOTAL = STEP_SEQUENCE.length + 1; // + READY_FOR_REVIEW
const DEFAULT_BLOG_ID = "blog_001";

const DONE_STATES = new Set(["READY_FOR_REVIEW", "PUBLISHED"]);
export function isResumable(job) {
  return !DONE_STATES.has(job.status);
}

// User-facing step labels (Korean), no dev jargon / stack traces.
export const STEP_LABEL = {
  QUEUED: "대기 중",
  RESEARCHING: "출처 조사",
  WRITING: "원고 작성",
  VALIDATING: "품질 검사",
  GENERATING_IMAGES: "이미지 생성",
  UPLOADING_IMAGES: "이미지 업로드",
  BUILDING_PREVIEW: "미리보기 구성",
  CREATING_BLOGGER_DRAFT: "Blogger 초안 전송",
  READY_FOR_REVIEW: "검토 준비 완료",
  REVIEW_REQUIRED: "사용자 검토 필요",
  FAILED: "실패",
  PUBLISHED: "발행 완료",
  BLOCKED_RESEARCH_PROVIDER: "출처 조사 제공자 미연결",
  BLOCKED_PROVIDER_CONFIG: "원고 생성 제공자 미연결",
  BLOCKED_IMAGE_PROVIDER: "이미지 생성 제공자 미연결",
  BLOCKED_BLOGGER_AUTH: "Blogger 인증 필요",
  BLOCKED_AFFILIATE_APPROVAL: "제휴 승인 대기",
};

// ─── Step executors ──────────────────────────────────────────────────────────
async function stepResearch(job) {
  const r = await gatherSources(job.recommendation);
  if (r.blocked)
    return { blocked: r.blocked, message: "신뢰할 수 있는 출처를 자동 조사할 검색 제공자가 연결되지 않았습니다.", envNeeded: r.envNeeded };
  if (!r.ok)
    return { blocked: "BLOCKED_RESEARCH_PROVIDER", message: r.message || "출처 조사에 실패했습니다.", envNeeded: r.envNeeded || [] };
  return { done: true, persist: { sources: r.sources }, message: `출처 ${r.sources.length}개 수집` };
}

async function stepWriting(job) {
  const readiness = contentProviderReadiness();
  if (!readiness.ready)
    return { blocked: "BLOCKED_PROVIDER_CONFIG", message: "영문 원고를 생성할 AI 제공자가 연결되지 않았습니다.", envNeeded: readiness.missing };
  const sources = job.steps?.RESEARCHING?.data?.sources || [];
  const gen = await generateDraftFromRecommendation(job.recommendation, sources);
  if (!gen.ok)
    return { blocked: "BLOCKED_PROVIDER_CONFIG", message: gen.reason || readiness.message, envNeeded: gen.missing || readiness.missing };
  return { done: true, persist: { draft: gen.draft }, message: "원고 초안 생성" };
}

function stepValidating(job) {
  const draft = job.steps?.WRITING?.data?.draft;
  if (!draft) return { fail: true, message: "검증할 원고가 없습니다." };

  const articles = readJson("articles.json").articles || [];
  const gate = assertProductionEligible(job.recommendation, articles);
  if (!gate.ok) return { fail: true, message: gate.reason };

  const qa = runArticleQa(draft, { articles });
  const affiliateActive = countActiveAffiliate(articles);
  const issues = [];
  if ((draft.faq || []).length !== 5) issues.push("FAQ가 정확히 5개가 아닙니다.");
  if ((draft.sources || []).length < 3) issues.push("실제 출처가 3개 미만입니다.");
  if ((draft.visualAssets || []).length !== 5) issues.push("이미지 슬롯이 5개가 아닙니다.");
  if (affiliateActive === 0) {
    const plan = draft.affiliatePlan || {};
    const salesSurfaces =
      (plan.status === "active" ? (plan.productSlots || []).length : 0) +
      (String(draft.bodyMarkdown || "").match(/AFFILIATE_LINK/g) || []).length;
    if (salesSurfaces > 0) issues.push("제휴 미승인 상태에서 판매 요소가 존재합니다.");
  }

  if (!qa.pass || issues.length) {
    return { review: true, message: `사용자 검토 필요: ${[...qa.checks.filter((c) => c.status === "FAIL").map((c) => c.label), ...issues].join(" · ")}`, persist: { qa, issues } };
  }

  // Commit the validated article into articles.json with a freshly reserved id.
  const id = reserveArticleId();
  const now = new Date().toISOString();
  const record = { ...draft, id, status: "written", publishedUrl: "", blogId: "", createdAt: now, updatedAt: now };
  record.bodyHtml = markdownToHtml(record.bodyMarkdown || "");
  const data = readJson("articles.json");
  data.articles.push(record);
  writeJson("articles.json", data);
  return { done: true, articleId: id, persist: { qa }, message: `검증 통과 · 원고 저장 (${id})` };
}

async function stepGenerateImages(job) {
  if (!job.articleId) return { fail: true, message: "이미지를 붙일 원고가 없습니다." };
  if (!isCloudinaryConfigured())
    return { blocked: "BLOCKED_IMAGE_PROVIDER", message: "Cloudinary 설정(CLOUDINARY_URL)이 없습니다.", envNeeded: ["CLOUDINARY_URL"] };

  const data = readJson("articles.json");
  const article = data.articles.find((a) => a.id === job.articleId);
  if (!article) return { fail: true, message: "이미지를 붙일 원고가 없습니다." };
  const assets = article.visualAssets || [];

  // Idempotent: every role slot already has a public URL → no regeneration.
  if (assets.length === 5 && assets.every((a) => isPublicImageUrl(a.publicUrl)))
    return { done: true, persist: { generated: 5 }, message: "이미지 이미 준비됨(재생성 없음)" };

  const gen = await generateImages(assets);
  if (gen.blocked) return { blocked: gen.blocked, message: "이미지를 생성할 provider가 연결되지 않았습니다.", envNeeded: gen.envNeeded };
  if (gen.fail) return { fail: true, message: gen.message };

  // Upload each generated image to Cloudinary with a fixed public_id (=role key)
  // so a re-run overwrites the same asset — never a duplicate.
  const slug = article.slug || article.id;
  for (const g of gen.generated) {
    const up = await uploadArticleImageData({ slug, key: g.key, source: g.b64 || g.url });
    const asset = article.visualAssets.find((a) => a.key === g.key);
    if (asset) asset.publicUrl = up.secureUrl;
  }
  article.updatedAt = new Date().toISOString();
  writeJson("articles.json", data);
  return { done: true, persist: { generated: gen.generated.length }, message: `이미지 ${gen.generated.length}장 생성·Cloudinary 업로드` };
}

async function stepUploadImages(job) {
  if (!isCloudinaryConfigured())
    return { blocked: "BLOCKED_IMAGE_PROVIDER", message: "Cloudinary 설정(CLOUDINARY_URL)이 없습니다.", envNeeded: ["CLOUDINARY_URL"] };
  const article = (readJson("articles.json").articles || []).find((a) => a.id === job.articleId);
  const assets = article?.visualAssets || [];
  const ready = assets.filter((a) => isPublicImageUrl(a.publicUrl)).length;
  if (ready !== 5) return { fail: true, message: `Cloudinary 공개 이미지 URL이 5개가 아닙니다 (${ready}개).` };
  return { done: true, message: "이미지 업로드 확인(5장)" };
}

function stepBuildPreview(job) {
  if (!job.articleId) return { fail: true, message: "Preview할 원고가 없습니다." };
  // Reuse the existing publisher preview surface — no new preview stack.
  return { done: true, preview: { url: `/publisher?id=${job.articleId}` }, message: "Blog Studio Preview 구성" };
}

async function stepBloggerDraft(job) {
  // Idempotent: a saved postId means the draft already exists — never re-insert.
  if (job.bloggerDraft?.postId) return { done: true, bloggerDraft: job.bloggerDraft, message: "이미 Blogger 초안이 존재합니다(중복 방지)." };

  const tokenRecord = getTokenByBlogId(DEFAULT_BLOG_ID);
  if (!tokenRecord)
    return { blocked: "BLOCKED_BLOGGER_AUTH", message: "Blogger 인증이 없거나 만료되었습니다. 재인증이 필요합니다.", envNeeded: ["Blogger 재인증(/api/auth/blogger/start)"] };

  const blogsData = readJson("blogs.json");
  const blog = blogsData.items.find((b) => b.id === DEFAULT_BLOG_ID);
  if (!blog?.bloggerBlogId)
    return { blocked: "BLOCKED_BLOGGER_AUTH", message: "연결된 Blogger 블로그 ID가 없습니다. 재인증이 필요합니다.", envNeeded: [] };

  const article = (readJson("articles.json").articles || []).find((a) => a.id === job.articleId);
  if (!article) return { fail: true, message: "초안을 만들 원고가 없습니다." };

  const html = buildBloggerHtml(article);
  const { accessToken, refreshToken } = decryptToken(tokenRecord);
  const tokenState = { accessToken, refreshToken };
  const run = async (fn) => {
    try {
      return await fn(tokenState.accessToken);
    } catch (err) {
      if (err.code === "TOKEN_EXPIRED" && tokenState.refreshToken) {
        const refreshed = await bloggerProvider.refreshAccessToken(tokenState.refreshToken);
        tokenState.accessToken = refreshed.accessToken;
        upsertTokenForBlog({
          blogId: DEFAULT_BLOG_ID,
          provider: "blogger",
          accessToken: tokenState.accessToken,
          refreshToken: tokenState.refreshToken,
          scope: tokenRecord.scope,
          expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        });
        return await fn(tokenState.accessToken);
      }
      throw err;
    }
  };

  try {
    // Only insert when no existing DRAFT shares the exact normalized title;
    // an existing draft is PATCHed (never a duplicate insert). posts.insert
    // (isDraft=true) runs at most once, and the postId is saved immediately.
    const drafts = await run((at) => bloggerProvider.listDrafts(blog.bloggerBlogId, at));
    const sel = selectDraftCandidate(drafts, article.title);
    if (sel.match === "multiple")
      return { review: true, message: "동일 제목의 Blogger 초안이 여러 개입니다. 수동 정리가 필요합니다." };

    let postId;
    let action;
    if (sel.match === "found") {
      postId = sel.post.id;
      await run((at) => bloggerProvider.updatePost(blog.bloggerBlogId, postId, { html }, { accessToken: at }));
      action = "Blogger 기존 초안 PATCH";
    } else {
      const created = await run((at) =>
        bloggerProvider.createDraft(blog.bloggerBlogId, { title: article.title, html, labels: article.tags || [] }, at)
      );
      postId = created.id;
      action = "Blogger 초안 생성";
    }
    return { done: true, bloggerDraft: { postId, blogId: DEFAULT_BLOG_ID, bloggerBlogId: blog.bloggerBlogId }, message: action };
  } catch (err) {
    const isAuth =
      err.code === "TOKEN_EXPIRED" || err.code === "REFRESH_INVALID" || /invalid_grant|expired|revoked|unauthorized/i.test(err.message || "");
    if (isAuth) return { blocked: "BLOCKED_BLOGGER_AUTH", message: "Blogger 인증이 만료되었습니다. 재인증이 필요합니다.", envNeeded: [] };
    return { fail: true, message: `Blogger 초안 생성 실패: ${String(err.message || "").slice(0, 150)}` };
  }
}

async function executeStep(step, job) {
  switch (step) {
    case "RESEARCHING": return stepResearch(job);
    case "WRITING": return stepWriting(job);
    case "VALIDATING": return stepValidating(job);
    case "GENERATING_IMAGES": return stepGenerateImages(job);
    case "UPLOADING_IMAGES": return stepUploadImages(job);
    case "BUILDING_PREVIEW": return stepBuildPreview(job);
    case "CREATING_BLOGGER_DRAFT": return stepBloggerDraft(job);
    default: return { fail: true, message: `알 수 없는 단계: ${step}` };
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────
// Advances a job from its current position until it completes, blocks, fails, or
// needs review. Persists after every step so refresh/restart never loses state.
// Idempotent on completion: a READY/PUBLISHED job is never re-run.
export async function runProductionJob(jobId) {
  let job = getProductionJob(jobId);
  if (!job) throw new Error(`production job not found: ${jobId}`);
  if (!isResumable(job)) return job; // already READY_FOR_REVIEW / PUBLISHED → no duplicate work

  if (!job.startedAt) job = updateProductionJob(jobId, (j) => { j.startedAt = new Date().toISOString(); });

  const start = job.progress?.index || 0; // number of completed steps (resume point)
  for (let i = start; i < STEP_SEQUENCE.length; i++) {
    const step = STEP_SEQUENCE[i];
    job = updateProductionJob(jobId, (j) => { j.status = step; j.step = step; });
    const res = await executeStep(step, job);

    job = updateProductionJob(jobId, (j) => {
      j.steps[step] = {
        status: res.done ? "done" : res.review ? "review" : "stopped",
        at: new Date().toISOString(),
        detail: res.message || "",
        data: res.persist,
      };
      if (res.articleId) j.articleId = res.articleId;
      if (res.preview) j.preview = res.preview;
      if (res.bloggerDraft) j.bloggerDraft = res.bloggerDraft;
    });

    if (res.blocked) {
      return updateProductionJob(jobId, (j) => {
        j.status = res.blocked;
        j.step = step;
        j.blocked = { code: res.blocked, userMessage: res.message, resumable: true, envNeeded: res.envNeeded || [] };
      });
    }
    if (res.fail) {
      return updateProductionJob(jobId, (j) => { j.status = "FAILED"; j.error = { userMessage: res.message }; });
    }
    if (res.review) {
      return updateProductionJob(jobId, (j) => {
        j.status = "REVIEW_REQUIRED";
        j.review = { userMessage: res.message };
        j.progress = { index: i + 1, total: TOTAL, percent: Math.round(((i + 1) / TOTAL) * 100) };
      });
    }
    job = updateProductionJob(jobId, (j) => {
      j.progress = { index: i + 1, total: TOTAL, percent: Math.round(((i + 1) / TOTAL) * 100) };
      j.blocked = null;
      j.error = null;
    });
  }

  return updateProductionJob(jobId, (j) => {
    j.status = "READY_FOR_REVIEW";
    j.step = "READY_FOR_REVIEW";
    j.progress = { index: TOTAL, total: TOTAL, percent: 100 };
  });
}

// Gate for the final human "공개 발행 승인" action. Never auto-runs.
export function canApprovePublish(job) {
  const reasons = [];
  if (job.status !== "READY_FOR_REVIEW") reasons.push("검토 준비가 완료되지 않았습니다.");
  if (!job.articleId) reasons.push("원고가 없습니다.");
  if (!job.bloggerDraft?.postId) reasons.push("Blogger 초안이 없습니다.");
  if ((job.steps?.UPLOADING_IMAGES?.status) !== "done") reasons.push("이미지 5장이 준비되지 않았습니다.");
  return { ok: reasons.length === 0, reasons };
}
