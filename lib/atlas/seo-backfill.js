// ─── ATLAS SEO Backfill (V1) ─────────────────────────────────────────────────
// §9: bring the 8 already-public posts up to the new SEO standard WITHOUT
// touching what makes them what they are. Exactly four surfaces may change:
//
//   1. meta description  (Blogger customMetaData — currently missing on all 8)
//   2. labels            (currently 0 on every live post)
//   3. internal links     ┐ both delivered by ONE appended "Related ATLAS
//   4. Related Articles   ┘ Guides" block, so no existing prose is rewritten
//
// Never changed: title, body prose, images, slug, published URL, publish date.
// Adding inline links inside existing paragraphs would mean editing sentences
// that are already indexed, so every internal link goes in the appended block.
//
// Pure — no IO, no @/ imports. The route does the backup, the Blogger PATCH,
// and the writes; this module only decides what SHOULD change and proves the
// change is safe and idempotent.
import {
  buildRelatedGuidesHtml,
  normalizeMetaDescription,
  selectInternalLinks,
  selectLabels,
  linkableArticles,
  SEO_LIMITS,
} from "./seo-engine.js";

export const RELATED_BLOCK_MARKER = 'class="atlas-related"';
const RELATED_BLOCK_RE = /<section class="atlas-related">[\s\S]*?<\/section>\s*/gi;

// Strips any block a previous backfill appended, so re-running never stacks a
// second "Related ATLAS Guides" onto the post.
export function stripRelatedBlock(html) {
  return String(html || "").replace(RELATED_BLOCK_RE, "").replace(/\s+$/, "");
}

export function hasRelatedBlock(html) {
  return String(html || "").includes(RELATED_BLOCK_MARKER);
}

/**
 * Appends (or replaces) the Related ATLAS Guides block. Returns the original
 * html unchanged when there are no links to add — an empty block is noise.
 */
export function applyRelatedBlock(html, links = []) {
  const base = stripRelatedBlock(html);
  if (!links.length) return base;
  return `${base}\n\n${buildRelatedGuidesHtml(links)}\n`;
}

/**
 * Builds the per-article backfill plan.
 *
 * Every item reports `changes` (what would actually differ) and `warnings`
 * (things worth knowing but not blocking). An article is `skipped` when it has
 * nothing to change or cannot be patched safely — it is never force-updated.
 *
 * Nothing here invents a meta description: a post with none stored is reported
 * as blocked so a human writes one, because padding text to reach 150 chars is
 * exactly the fabrication this pipeline refuses.
 */
export function buildBackfillPlan({ articles = [], articleIds = null } = {}) {
  const live = linkableArticles(articles);
  const liveIds = new Set(live.map((a) => a.id));
  const targets = live.filter((a) => !articleIds || articleIds.includes(a.id));

  const items = [];
  const skipped = [];

  for (const article of targets) {
    const changes = [];
    const warnings = [];
    const blockers = [];

    // 1. meta description — stored value only, trimmed to the 160-char ceiling.
    const stored = String(article.metaDescription || "").trim();
    let metaDescription = "";
    if (!stored) {
      blockers.push("저장된 meta description이 없습니다. 사람이 직접 작성해야 합니다(자동 생성하지 않음).");
    } else {
      metaDescription = normalizeMetaDescription(stored);
      if (metaDescription !== stored) changes.push(`meta description ${stored.length}자 → ${metaDescription.length}자로 절삭`);
      else changes.push(`meta description 적용 (${metaDescription.length}자)`);
      if (metaDescription.length < SEO_LIMITS.metaDescription[0]) {
        warnings.push(`meta description ${metaDescription.length}자 — 권장 ${SEO_LIMITS.metaDescription[0]}~${SEO_LIMITS.metaDescription[1]}자보다 짧습니다(내용은 그대로 사용).`);
      }
    }

    // 2. labels — live posts currently have none at all.
    const labels = selectLabels({ title: article.title, keyword: article.keyword || article.title, tags: article.tags || [] });
    const existingLabels = article.bloggerLabels || [];
    const labelsChanged = labels.join("|").toLowerCase() !== existingLabels.join("|").toLowerCase();
    if (labels.length < SEO_LIMITS.labels[0]) blockers.push(`라벨 ${labels.length}개 (최소 ${SEO_LIMITS.labels[0]}개)`);
    else if (labelsChanged) changes.push(`라벨 ${labels.length}개 적용: ${labels.join(", ")}`);

    // 3+4. internal links, delivered through the Related ATLAS Guides block.
    const links = selectInternalLinks({
      keyword: article.keyword || article.title,
      title: article.title,
      articles: live,
      excludeId: article.id,
    });
    const badLink = links.find((l) => !liveIds.has(l.articleId));
    if (badLink) blockers.push(`내부링크 대상이 공개 글이 아닙니다: ${badLink.articleId}`);
    if (links.length < SEO_LIMITS.internalLinks[0]) {
      blockers.push(`연결 가능한 공개 글이 ${links.length}개뿐입니다 (최소 ${SEO_LIMITS.internalLinks[0]}개).`);
    }

    const currentHtml = String(article.bodyHtml || "");
    const nextHtml = applyRelatedBlock(currentHtml, links);
    const htmlChanged = nextHtml !== currentHtml;
    if (htmlChanged) {
      changes.push(
        hasRelatedBlock(currentHtml)
          ? `Related ATLAS Guides 블록 갱신 (내부링크 ${links.length}개)`
          : `Related ATLAS Guides 블록 추가 (내부링크 ${links.length}개)`,
      );
    }

    // Safety proof: everything except the appended block must be byte-identical.
    const bodyUntouched = stripRelatedBlock(nextHtml) === stripRelatedBlock(currentHtml);
    if (!bodyUntouched) blockers.push("본문이 Related 블록 외의 부분에서 변경됩니다 — 안전하지 않아 차단합니다.");

    const item = {
      articleId: article.id,
      title: article.title,
      publishedUrl: article.publishedUrl,
      bloggerPostId: article.bloggerPostId || "",
      metaDescription,
      labels,
      internalLinks: links,
      bodyHtml: nextHtml,
      changes,
      warnings,
      blockers,
      ok: blockers.length === 0 && changes.length > 0,
    };

    if (blockers.length) skipped.push({ articleId: article.id, title: article.title, reason: blockers.join(" / ") });
    else if (!changes.length) skipped.push({ articleId: article.id, title: article.title, reason: "변경할 항목이 없습니다(이미 최신)." });
    else items.push(item);
  }

  return {
    ok: items.length > 0,
    total: targets.length,
    updatable: items.length,
    items,
    skipped,
    guarantees: [
      "제목·공개 URL·발행일·이미지·기존 본문 문장은 변경하지 않습니다.",
      "내부링크는 articles.json의 실제 publishedUrl만 사용합니다.",
      "재실행해도 Related 블록이 중복 추가되지 않습니다(교체 방식).",
      "기존 공개 글을 재발행하거나 삭제하지 않습니다(posts.patch만 사용).",
    ],
  };
}

/**
 * Verifies a plan item against the article it will patch, immediately before
 * the Blogger call. Catches the case where articles.json changed between
 * planning and execution.
 */
export function verifyBackfillItem(item, article) {
  const issues = [];
  if (!article) return { ok: false, issues: [`원고를 찾을 수 없습니다: ${item?.articleId}`] };
  if (!article.bloggerPostId) issues.push("bloggerPostId가 없어 patch 대상을 특정할 수 없습니다.");
  if (String(article.publishedUrl || "") !== String(item.publishedUrl || "")) {
    issues.push("공개 URL이 계획 수립 이후 변경되었습니다. 동기화 후 다시 시도하세요.");
  }
  if (stripRelatedBlock(item.bodyHtml) !== stripRelatedBlock(article.bodyHtml || "")) {
    issues.push("본문이 계획 수립 이후 변경되었습니다. 다시 계획을 세워야 합니다.");
  }
  if (!String(item.metaDescription || "").trim()) issues.push("meta description이 비어 있습니다.");
  if ((item.labels || []).length < SEO_LIMITS.labels[0]) issues.push("라벨이 최소 개수 미만입니다.");
  return { ok: issues.length === 0, issues };
}
