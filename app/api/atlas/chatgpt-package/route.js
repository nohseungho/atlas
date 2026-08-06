// CHATGPT_HANDOFF — register one atlas-package-{jobId}.json returned by ChatGPT.
// Validates structure + MASTER QA + semantic dedup + image magic bytes, uploads
// the 5 base64 images to Cloudinary (→ 5 distinct 1600x900 WebP HTTPS URLs),
// assembles the final HTML (no base64/data URL ever stored), and checkpoints the
// article. Idempotent: re-registering the same job never creates a duplicate
// article, image, or Blogger post. DRAFT creation stays QA-gated and downstream
// (existing "Blogger 초안 반영" / pipeline), never inside this import.
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { readJson, writeJson } from "@/lib/data-store";
import {
  validatePackageStructure, validatePackageHtml, checkPackageDedup, validateImageBase64, isMeaningfulAlt, IMAGE_ROLES,
} from "@/lib/atlas/chatgpt-handoff";
import { nicheMatches } from "@/lib/atlas/money-hunter-select";
import { isCloudinaryConfigured, uploadArticleImageData } from "@/lib/atlas/providers/cloudinary-provider";
import { EMBEDDED_PLACEMENT } from "@/lib/atlas/revenue-layout-engine";
import { listProductionJobs, updateProductionJob, reserveArticleId } from "@/lib/atlas/repositories/production-job-repository";
import { buildSeoPackage } from "@/lib/atlas/seo-engine";
import { applyRelatedBlock } from "@/lib/atlas/seo-backfill";
import { runContentQa } from "@/lib/atlas/content-qa";
import { STATE } from "@/lib/atlas/content-pipeline-state";
import { advance } from "@/lib/atlas/repositories/content-pipeline-repository";

export const runtime = "nodejs";

// assembleHtml() inlines all 5 figures directly into the article body, so every
// asset is recorded as EMBEDDED. visualAssets stays the image manifest (roles,
// alts, Cloudinary URLs) but the chrome assembler must not inject a second copy
// of any of them. The previous fixed-slot map collided (featured+action on
// afterByline, comparison+checklist on afterFaq), which both dropped two assets
// from the manifest and re-rendered the surviving three on top of the body's
// own copies — 8 images for a 5-image article.
const PLACEMENT = EMBEDDED_PLACEMENT;

function figureHtml(url, alt, eager) {
  const safeAlt = String(alt || "").replace(/"/g, "&quot;");
  return `<figure style="margin:28px 0;">\n  <img src="${url}" alt="${safeAlt}" loading="${eager ? "eager" : "lazy"}" decoding="async" style="display:block;width:100%;height:auto;border-radius:12px;" />\n</figure>`;
}

// Insert the 5 uploaded images: replace <!--ATLAS_IMAGE:role--> markers first;
// otherwise featured at top and the rest after successive H2 headings.
function assembleHtml(html, roleUrlAlt) {
  let out = String(html || "");
  const used = new Set();
  for (const r of roleUrlAlt) {
    const marker = new RegExp(`<!--\\s*ATLAS_IMAGE:${r.role}\\s*-->`, "i");
    if (marker.test(out)) {
      out = out.replace(marker, figureHtml(r.url, r.alt, r.role === "featured"));
      used.add(r.role);
    }
  }
  const remaining = roleUrlAlt.filter((r) => !used.has(r.role));
  const feat = remaining.find((r) => r.role === "featured");
  const rest = remaining.filter((r) => r.role !== "featured");
  if (feat) out = `${figureHtml(feat.url, feat.alt, true)}\n${out}`;
  let i = 0;
  out = out.replace(/(<h2\b[^>]*>[\s\S]*?<\/h2>)/gi, (m) => {
    if (i < rest.length) {
      const r = rest[i++];
      return `${m}\n${figureHtml(r.url, r.alt, false)}`;
    }
    return m;
  });
  while (i < rest.length) {
    const r = rest[i++];
    out += `\n${figureHtml(r.url, r.alt, false)}`;
  }
  return out;
}

function finalHtmlQa(html) {
  const s = String(html || "");
  const issues = [];
  const imgCount = (s.match(/<img\b/gi) || []).length;
  const cloud = new Set(s.match(/https:\/\/res\.cloudinary\.com\/[^"'\s)]+/g) || []);
  if (imgCount !== 5) issues.push(`img count ${imgCount} != 5`);
  if (cloud.size !== 5) issues.push(`distinct Cloudinary URLs ${cloud.size} != 5`);
  if (/\bdata:image\//i.test(s)) issues.push("data URL present");
  if (/(PLACEHOLDER|example\.com|YOUR_[A-Z_]+|\/path\/to\/)/i.test(s)) issues.push("placeholder URL");
  if (/```/.test(s)) issues.push("code fence");
  if ((s.match(/<h1\b/gi) || []).length > 0) issues.push("h1 present");
  const disc = (s.match(/disclaimer/gi) || []).length;
  if (disc !== 1) issues.push(`disclaimer count ${disc} != 1`);

  // Structural singletons: the assembled body owns exactly one FAQ section and
  // one Sources section. More than one here means the body itself duplicated a
  // section before the chrome assembler ever ran.
  const faqHeadings = (s.match(/<h[23][^>]*>[^<]*(?:\bFAQ\b|Frequently Asked Questions)[^<]*<\/h[23]>/gi) || []).length;
  const sourceHeadings = (s.match(/<h[23][^>]*>[^<]*(?:\bSources\b|\bReferences\b)[^<]*<\/h[23]>/gi) || []).length;
  if (faqHeadings !== 1) issues.push(`FAQ section count ${faqHeadings} != 1`);
  if (sourceHeadings !== 1) issues.push(`Sources section count ${sourceHeadings} != 1`);

  // Every image needs real descriptive alt text — 5 distinct, non-placeholder.
  const alts = Array.from(s.matchAll(/<img[^>]*\balt=["']([^"']*)["']/gi), (m) => m[1].trim());
  const weakAlt = alts.filter((a) => !isMeaningfulAlt(a));
  if (alts.length !== imgCount) issues.push(`${imgCount - alts.length} image(s) missing alt`);
  if (weakAlt.length) issues.push(`non-descriptive alt text: ${weakAlt.join(" | ") || "(empty)"}`);
  if (new Set(alts).size !== alts.length) issues.push("duplicate alt text across images");

  return { ok: issues.length === 0, imgCount, distinctCloudinary: cloud.size, issues };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const pkg = body.package || body;
  if (!pkg || typeof pkg !== "object" || !pkg.jobId) {
    return NextResponse.json({ status: "error", errorCode: "PACKAGE_JOBID_REQUIRED" }, { status: 400 });
  }

  const job = listProductionJobs().find((j) => j.id === pkg.jobId);
  if (!job) return NextResponse.json({ status: "error", errorCode: "JOB_NOT_FOUND" }, { status: 404 });
  const blogId = job.blogId || pkg.blogId || "blog_001";

  if (job.moneyHunterId && pkg.moneyHunterId && pkg.moneyHunterId !== job.moneyHunterId) {
    return NextResponse.json({ status: "error", errorCode: "MONEY_HUNTER_ID_MISMATCH" }, { status: 400 });
  }
  if (!nicheMatches(blogId, { category: pkg.category || "", keyword: pkg.title || "" })) {
    // title alone may not carry niche tokens; only reject if clearly cross-niche.
    if (/k-?beauty|skincare|cosmetic|makeup/i.test(`${pkg.title} ${pkg.category}`)) {
      return NextResponse.json({ status: "error", errorCode: "NICHE_MISMATCH" }, { status: 400 });
    }
  }

  // 1) structure + MASTER html QA
  const vs = validatePackageStructure(pkg, { requestJobId: job.id, blogId });
  if (!vs.ok) return NextResponse.json({ status: "rejected", errorCode: "PACKAGE_INVALID", issues: vs.issues }, { status: 400 });
  const hq = validatePackageHtml(pkg.articleHtml);
  if (!hq.ok) return NextResponse.json({ status: "rejected", errorCode: "MASTER_QA_FAILED", issues: hq.issues }, { status: 400 });

  // 2) semantic dedup (never auto-pass ambiguous)
  const existing = readJson("articles.json").articles || [];
  const dedup = checkPackageDedup(pkg, existing);
  if (dedup.verdict === "FAIL") return NextResponse.json({ status: "rejected", errorCode: "DUPLICATE", reason: dedup.reason }, { status: 409 });
  if (dedup.verdict === "DUPLICATE_REVIEW_REQUIRED") {
    return NextResponse.json({ status: "duplicate_review_required", reason: dedup.reason, of: dedup.of }, { status: 200 });
  }

  // 3) image magic-byte validation BEFORE any external upload
  const imgs = pkg.images || [];
  const imgIssues = [];
  for (const role of IMAGE_ROLES) {
    const img = imgs.find((x) => x.role === role);
    if (!img) { imgIssues.push(`missing image role ${role}`); continue; }
    const v = validateImageBase64(img.mimeType, img.base64);
    if (!v.ok) imgIssues.push(`${role}: ${v.issues.join(", ")}`);
  }
  if (imgIssues.length) return NextResponse.json({ status: "rejected", errorCode: "IMAGE_BYTES_INVALID", issues: imgIssues }, { status: 400 });

  // 4) idempotency: this job already produced an article → return it, no re-work.
  if (job.articleId) {
    const a = existing.find((x) => x.id === job.articleId);
    if (a) {
      return NextResponse.json({ status: "ok", duplicate: true, articleId: job.articleId, jobId: job.id, message: "이미 등록된 패키지입니다(중복 생성 없음)." });
    }
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ status: "needs_configuration", errorCode: "CLOUDINARY_CONFIG_MISSING", envNeeded: ["CLOUDINARY_URL"] }, { status: 200 });
  }

  // 5) upload 5 images (fixed public_id per role = idempotent overwrite).
  const slug = pkg.slug;
  const roleUrlAlt = [];
  try {
    for (const role of IMAGE_ROLES) {
      const img = imgs.find((x) => x.role === role);
      const up = await uploadArticleImageData({ slug, key: role, source: img.base64 });
      // alt is validated as real descriptive text upstream (validatePackageStructure),
      // so there is no "<role> image" fallback to invent here — that placeholder is
      // exactly what shipped 5 meaningless alts on art_010.
      roleUrlAlt.push({ role, url: up.secureUrl, alt: String(img.alt).trim() });
    }
  } catch (err) {
    return NextResponse.json({ status: "error", errorCode: "CLOUDINARY_UPLOAD_FAILED", message: String(err.message || "").slice(0, 150) }, { status: 502 });
  }
  const distinct = new Set(roleUrlAlt.map((r) => r.url));
  if (distinct.size !== 5) return NextResponse.json({ status: "error", errorCode: "IMAGE_URLS_NOT_DISTINCT" }, { status: 502 });

  // 6) assemble final HTML + final QA (5 imgs / 5 distinct URLs / no data-url).
  const withImages = assembleHtml(pkg.articleHtml, roleUrlAlt);
  const fq = finalHtmlQa(withImages);
  if (!fq.ok) return NextResponse.json({ status: "rejected", errorCode: "FINAL_HTML_QA_FAILED", issues: fq.issues }, { status: 400 });

  // 6b) SEO surfaces derived from the live corpus (§5). Internal links come
  // only from real publishedUrls, so an empty/new blog yields none rather than
  // an invented URL — buildSeoPackage reports that instead of hiding it.
  const seo = buildSeoPackage(
    { ...pkg, keyword: pkg.title, visualAssets: roleUrlAlt.map((r) => ({ publicUrl: r.url })) },
    { articles: existing, excludeId: job.articleId || "" },
  );
  const finalHtml = applyRelatedBlock(withImages, seo.internalLinks);

  // 7) write the article record (base64 never stored) + docs final HTML.
  const articlesData = readJson("articles.json");
  const articleId = job.articleId || reserveArticleId();
  const now = new Date().toISOString();
  const visualAssets = IMAGE_ROLES.map((role) => {
    const r = roleUrlAlt.find((x) => x.role === role);
    return { key: role, placement: PLACEMENT, alt: r.alt, width: 1600, height: 900, fit: "cover", required: true, localSrc: "", publicUrl: r.url };
  });
  const record = {
    id: articleId, keyword: pkg.title, title: pkg.title, hookTitle: pkg.title, slug: pkg.slug,
    language: "en", searchIntent: pkg.searchIntentKey || "informational",
    searchIntentKey: pkg.searchIntentKey || "informational", coreQuestion: pkg.coreQuestion || "",
    topicEntities: pkg.topicEntities || [], desiredReaderAction: pkg.desiredReaderAction || "",
    excerpt: pkg.excerpt || "", metaDescription: seo.metaDescription || pkg.metaDescription, category: pkg.category || "Travel",
    tags: pkg.tags || [], template: pkg.revenueTemplate || "guide", persona: pkg.readerPersona || "US Tourist",
    // SEO surfaces the publisher consumes: labels go to Blogger, internalLinks
    // are already rendered into the Related block, jsonLd ships with the post.
    seoCluster: seo.cluster, seoLabels: seo.labels, internalLinks: seo.internalLinks, jsonLd: seo.jsonLd,
    outline: pkg.outline || [], quickAnswer: pkg.quickAnswer || "", comparisonCriteria: pkg.comparisonCriteria || [],
    keyTakeaways: pkg.keyTakeaways || [], comparisonHeaders: pkg.comparisonHeaders || [], comparisonTable: pkg.comparisonTable || [],
    sources: (pkg.sources || []).map((s) => (typeof s === "string" ? { title: s, url: s } : s)),
    trust: pkg.trust || { methodology: pkg.contentGap || "" }, relatedArticles: pkg.relatedArticles || [],
    heroImage: null, visualAssets,
    affiliatePlan: { providerId: "", providerName: "", network: "", status: "pending", url: "", disclosure: "", cta: { topLabel: "", decisionLabel: "" }, productSlots: [] },
    bodyMarkdown: pkg.bodyMarkdown || "", bodyHtml: finalHtml, faq: pkg.faq || [],
    qualityChecklist: { hasDisclaimer: true }, koreanReview: pkg.koreanReview || "",
    status: "written", publishedUrl: "", blogId,
    moneyHunterId: pkg.moneyHunterId || job.moneyHunterId || "",
    researchQuery: pkg.researchQuery || "", researchedAt: pkg.researchedAt || "",
    trendEvidence: pkg.trendEvidence || "", purchaseIntent: pkg.purchaseIntent || "", affiliatePotential: pkg.affiliatePotential || "",
    contentGap: pkg.contentGap || "", createdAt: now, updatedAt: now,
  };
  const existingIdx = articlesData.articles.findIndex((a) => a.id === articleId);
  if (existingIdx >= 0) articlesData.articles[existingIdx] = record;
  else articlesData.articles.push(record);
  writeJson("articles.json", articlesData);

  // Final HTML override used by the existing "Blogger 초안 반영" route (DRAFT-only).
  fs.writeFileSync(path.join(process.cwd(), "docs", `${articleId}-blogger-final.html`), finalHtml + "\n", "utf-8");

  // 8) full content QA (§6). A FAIL keeps the article stored but leaves the
  // pipeline short of QA_PASSED, which is what disables the publish button.
  const contentQa = runContentQa(record, { articles: articlesData.articles });

  updateProductionJob(job.id, (j) => {
    j.articleId = articleId;
    j.status = contentQa.pass ? "READY_TO_PUBLISH" : "REVIEW_REQUIRED";
    j.step = "QA";
    j.steps = j.steps || {};
    j.steps.PACKAGE_IMPORTED = { status: "done", at: now, detail: `이미지 5장 Cloudinary 업로드·구조 QA 통과 (${articleId})` };
    j.steps.CONTENT_QA = {
      status: contentQa.pass ? "done" : "review",
      at: now,
      detail: contentQa.summary,
      data: { blocking: contentQa.blocking, needsHumanReview: contentQa.needsHumanReview },
    };
  });

  // Pipeline state: DRAFT_READY always, then QA_PASSED only when the gate is
  // clean. A failed gate is left at DRAFT_READY with the reasons attached —
  // never marked QA_PASSED so the UI cannot offer approval.
  advance(job.id, STATE.DRAFT_READY, { note: `초안 등록 (${articleId})`, patch: { articleId } });
  const stateResult = contentQa.pass
    ? advance(job.id, STATE.QA_PASSED, { note: contentQa.summary })
    : { ok: false, reason: contentQa.summary };

  return NextResponse.json({
    status: contentQa.pass ? "ok" : "qa_failed",
    jobId: job.id,
    articleId,
    state: stateResult.ok ? STATE.QA_PASSED : STATE.DRAFT_READY,
    images: roleUrlAlt.map((r) => ({ role: r.role, url: r.url })),
    finalHtml: `docs/${articleId}-blogger-final.html`,
    qa: {
      imgCount: fq.imgCount,
      distinctCloudinary: fq.distinctCloudinary,
      pass: contentQa.pass,
      blocking: contentQa.blocking,
      needsHumanReview: contentQa.needsHumanReview,
      checks: contentQa.checks,
    },
    seo: {
      cluster: seo.cluster, slug: seo.slug, metaLength: seo.metaLength,
      labels: seo.labels, internalLinks: seo.internalLinks.map((l) => l.url), issues: seo.issues,
    },
    nextStep: contentQa.pass
      ? "미리보기 확인 후 '승인 및 예약' 한 번으로 발행 예약"
      : "검수 실패 항목을 수정한 뒤 다시 붙여넣으세요. 발행은 차단되어 있습니다.",
  });
}
