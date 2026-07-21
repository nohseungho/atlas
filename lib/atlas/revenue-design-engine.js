// Revenue Design Engine — Blogger-compatible HTML sections for monetization layout
// Inline styles only. No external CSS/JS. Single-column, mobile-first.

import { detectSearchIntent, getReaderPersona } from "./template-engine.js";
import {
  getChrome,
  classifyHeroPolicy,
  resolveHeroImage,
  isValidUrl,
  isAffiliateActive,
  resolveAffiliateUrl,
  resolveProductSlotUrl,
  resolveVisualAssetsByPlacement,
} from "./revenue-layout-engine.js";

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDate(isoStr) {
  try {
    return new Date(isoStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return String(isoStr || "");
  }
}

function extractH2s(markdown) {
  if (!markdown) return [];
  return (markdown.match(/^## (.+)$/gm) || []).map((h) => h.replace(/^## /, "").trim());
}

function isMeaningfulCell(value) {
  const text = (value ?? "").toString().trim();
  return text.length > 0 && text !== "—" && text !== "-";
}

// ─── Section Builders ─────────────────────────────────────────────────────────

function buildUpdatedDateBox(article, chrome) {
  const date = article.updatedAt || article.createdAt;
  if (!date) return "";
  return `<p style="font-size:12px;color:#9ca3af;margin:0 0 10px;font-family:system-ui,-apple-system,sans-serif;">${esc(chrome.updatedLabel)}: ${esc(formatDate(date))}</p>`;
}

// Compact byline: author name / role / reviewed date only (no methodology).
// Sits right under the title, before any disclosure or CTA. The fuller
// Trust/Methodology box (buildTrustBox) repeats name/role further down along
// with methodology — this one is just the "who wrote this, when" signal.
function buildByline(article, chrome) {
  const trust = article.trust;
  if (!trust || !(trust.authorName || trust.role || trust.reviewedAt)) return "";
  const segments = [];
  if (trust.authorName) {
    segments.push(esc(trust.authorName) + (trust.role ? ` · ${esc(trust.role)}` : ""));
  } else if (trust.role) {
    segments.push(esc(trust.role));
  }
  if (trust.reviewedAt) {
    segments.push(`${esc(chrome.reviewedLabel)}: ${esc(formatDate(trust.reviewedAt))}`);
  }
  if (segments.length === 0) return "";
  return `<p style="font-size:12px;color:#6b7280;margin:0 0 16px;font-family:system-ui,-apple-system,sans-serif;">${segments.join(" · ")}</p>`;
}

// Key Comparison Criteria: a short, scannable list of what the reader should
// actually check before deciding — distinct from Key Takeaways (a post-read
// recap) and from Quick Answer (the direct answer). Sourced from
// article.comparisonCriteria only; never duplicates Quick Answer's sentence.
function buildComparisonCriteriaBox(article, chrome) {
  const items = Array.isArray(article.comparisonCriteria)
    ? article.comparisonCriteria.map((c) => (c || "").toString().trim()).filter(Boolean)
    : [];
  if (items.length === 0) return "";
  const rows = items
    .map((c) => `    <li style="margin-bottom:6px;color:#374151;font-size:14px;line-height:1.6;">${esc(c)}</li>`)
    .join("\n");
  return `<div style="margin:0 0 24px;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;">${esc(chrome.comparisonCriteriaHeading)}</p>
  <ul style="margin:0;padding-left:20px;">
${rows}
  </ul>
</div>`;
}

// Hero box: category-based policy. Never renders without a real https image URL.
function buildHeroBox(article, chrome) {
  const image = resolveHeroImage(article);
  if (!image) return ""; // 이미지 없으면 Hero 영역 전체 숨김 — 깨진 태그/빈 박스 금지

  const policy = classifyHeroPolicy(article);
  // info-first / safety: 절제된 소형 이미지, 본문 옆 float 없음. hero-first / product-hero: 전체 폭 16:9.
  const isCompact = policy === "info-first" || policy === "safety";
  const alt = esc(image.alt || chrome.imageAltFallback);
  const captionHtml = image.caption
    ? `<p style="margin:6px 0 0;font-size:11px;color:#9ca3af;text-align:${isCompact ? "left" : "center"};">${esc(image.caption)}${image.source ? ` · ${esc(image.source)}` : ""}</p>`
    : "";

  if (isCompact) {
    return `<div style="margin:0 0 20px;font-family:system-ui,-apple-system,sans-serif;">
  <img src="${esc(image.url)}" alt="${alt}" loading="eager" style="width:100%;max-width:320px;height:auto;border-radius:8px;display:block;" />
  ${captionHtml}
</div>`;
  }

  return `<div style="margin:0 0 24px;font-family:system-ui,-apple-system,sans-serif;">
  <img src="${esc(image.url)}" alt="${alt}" loading="eager" style="width:100%;height:auto;aspect-ratio:${esc(image.aspectRatio)};object-fit:cover;border-radius:10px;display:block;" />
  ${captionHtml}
</div>`;
}

// Visual asset figure: semantic figure/img, content-width (never full-bleed
// hero), fixed 16:9 box via width/height + aspect-ratio (CLS-safe even if
// the image itself is slow to load). Renders nothing when no resolved asset
// is passed for this slot — never an empty figure or a broken <img> src.
function buildVisualAssetFigure(resolvedAsset, { eager } = {}) {
  if (!resolvedAsset || !resolvedAsset.src) return "";
  const loadingAttrs = eager ? `loading="eager" fetchpriority="high"` : `loading="lazy"`;
  return `<figure style="margin:0 0 24px;font-family:system-ui,-apple-system,sans-serif;">
  <img src="${esc(resolvedAsset.src)}" alt="${esc(resolvedAsset.alt)}" width="${esc(resolvedAsset.width)}" height="${esc(resolvedAsset.height)}" ${loadingAttrs} style="display:block;width:100%;max-width:100%;height:auto;aspect-ratio:16/9;object-fit:${resolvedAsset.fit};border-radius:10px;" />
</figure>`;
}

// In-body figure injection for assets that target a specific section, keyed by
// that section's H2 heading text via placement "afterSection:<heading>". This is
// a general, article-agnostic rule — it never references a specific article id.
// The figure is inserted right after the section's content (immediately before
// the next H2), or appended to the body when it targets the last section. Assets
// using the fixed slot placements (afterByline/afterComparisonCriteria/afterFaq)
// are ignored here, so articles that only use those slots are unaffected.
const SECTION_PLACEMENT_PREFIX = "afterSection:";

function injectSectionVisuals(bodyHtml, article, visualsByPlacement) {
  if (!bodyHtml) return bodyHtml;
  const headings = extractH2s(article.bodyMarkdown);
  let out = bodyHtml;
  for (const [placement, asset] of Object.entries(visualsByPlacement)) {
    if (!placement.startsWith(SECTION_PLACEMENT_PREFIX)) continue;
    const heading = placement.slice(SECTION_PLACEMENT_PREFIX.length).trim();
    const index = headings.indexOf(heading);
    if (index === -1) continue; // no matching section — silently skip (no empty figure)
    const figure = buildVisualAssetFigure(asset); // in-body figures are always lazy
    if (!figure) continue;
    // atlas-h2-N ids are assigned to each H2 in document order by markdownToHtml,
    // so the next section's anchor is a stable, unique insertion point.
    const nextMarker = `<h2 id="atlas-h2-${index + 1}"`;
    const pos = out.indexOf(nextMarker);
    out = pos === -1 ? `${out}\n${figure}` : `${out.slice(0, pos)}${figure}\n${out.slice(pos)}`;
  }
  return out;
}

// Quick Answer must come from article.quickAnswer — metaDescription is SEO
// meta text, not a substitute for an actual search-intent answer.
function buildQuickAnswerBox(article) {
  const text = (article.quickAnswer || "").trim();
  if (!text) return "";
  return `<div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:16px 20px;margin:0 0 24px;border-radius:0 8px 8px 0;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0;font-size:15px;color:#1e3a5f;line-height:1.7;">${esc(text)}</p>
</div>`;
}

// TOC anchors must match the atlas-h2-N ids markdownToHtml assigns to each H2
// (see lib/html-exporter.js). Both walk article.bodyMarkdown top-to-bottom in
// the same order, so the Nth extracted heading always matches atlas-h2-N.
function buildTableOfContents(article, chrome) {
  const headings = extractH2s(article.bodyMarkdown);
  if (headings.length < 2) return "";
  const items = headings
    .map(
      (h, i) =>
        `    <li style="margin-bottom:6px;"><a href="#atlas-h2-${i}" style="color:#2563eb;text-decoration:none;font-size:14px;">${esc(h)}</a></li>`
    )
    .join("\n");
  return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:0 0 24px;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;">${esc(chrome.toc)}</p>
  <ol style="margin:0;padding-left:20px;">
${items}
  </ol>
</div>`;
}

// Key Takeaways must come from article.keyTakeaways — H2 headings are section
// titles, not reader-facing comparison/decision takeaways.
function buildKeyTakeaways(article, chrome) {
  const points = Array.isArray(article.keyTakeaways)
    ? article.keyTakeaways.map((p) => (p || "").toString().trim()).filter(Boolean)
    : [];
  if (points.length === 0) return "";
  const items = points
    .map(
      (p) =>
        `    <li style="margin-bottom:8px;color:#374151;font-size:14px;line-height:1.6;">${esc(p)}</li>`
    )
    .join("\n");
  return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 24px;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:.07em;">${esc(chrome.keyTakeaways)}</p>
  <ul style="margin:0;padding-left:20px;">
${items}
  </ul>
</div>`;
}

// 실제 구조화 데이터(article.comparisonTable)가 없거나 필수 셀이 비어있으면
// 빈 표/빈 row를 출력하지 않는다. 유효한 row가 0개면 wrapper 전체를 숨긴다.
function buildComparisonTable(article, chrome) {
  const rows = Array.isArray(article.comparisonTable) ? article.comparisonTable : [];
  const real = rows.filter(
    (row) => row && isMeaningfulCell(row.label) && isMeaningfulCell(row.optionA) && isMeaningfulCell(row.optionB)
  );
  if (real.length === 0) return "";

  const headers =
    Array.isArray(article.comparisonHeaders) && article.comparisonHeaders.length === 3
      ? article.comparisonHeaders
      : chrome.comparisonHeaders;
  const [h1, h2, h3] = headers;

  // First column carries the shortest, most word-break-prone labels
  // ("Comprehensive Trip Insurance", "Medical Evacuation Insurance"). It gets
  // its own min-width plus explicit normal wrapping so narrow mobile
  // viewports break between words, never mid-word.
  const FIRST_COL_STYLE =
    "padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;font-weight:600;min-width:150px;white-space:normal;word-break:normal !important;overflow-wrap:normal !important;hyphens:none;";
  const OTHER_COL_STYLE =
    "padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;white-space:normal;word-break:normal !important;overflow-wrap:normal !important;hyphens:none;";

  const bodyRows = real
    .map(
      (row, i) =>
        `      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">
        <td style="${FIRST_COL_STYLE}">${esc(row.label)}</td>
        <td style="${OTHER_COL_STYLE}">${esc(row.optionA)}</td>
        <td style="${OTHER_COL_STYLE}">${esc(row.optionB)}</td>
      </tr>`
    )
    .join("\n");

  // overflow-x:auto is scoped to this wrapper only, so a wide table scrolls
  // internally without ever causing page-level horizontal overflow. table-layout:
  // auto + min-width keeps columns wide enough that words wrap normally instead
  // of being split mid-word on narrow (mobile) viewports.
  return `<div style="overflow-x:auto;margin:24px 0;font-family:system-ui,-apple-system,sans-serif;">
  <table style="width:100%;min-width:680px;table-layout:auto;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr style="background:#2563eb;color:#ffffff;">
        <th style="padding:12px 14px;text-align:left;font-weight:700;min-width:150px;white-space:normal;word-break:normal !important;overflow-wrap:normal !important;hyphens:none;">${esc(h1)}</th>
        <th style="padding:12px 14px;text-align:left;font-weight:700;white-space:normal;word-break:normal !important;overflow-wrap:normal !important;hyphens:none;">${esc(h2)}</th>
        <th style="padding:12px 14px;text-align:left;font-weight:700;white-space:normal;word-break:normal !important;overflow-wrap:normal !important;hyphens:none;">${esc(h3)}</th>
      </tr>
    </thead>
    <tbody>
${bodyRows}
    </tbody>
  </table>
</div>`;
}

// Shared CTA renderer for both the top CTA and the decision CTA. Renders only
// when the affiliate plan is active and resolves to a real URL — never a
// disabled button, never href="#". label lets each placement (top/decision)
// use its own copy from article.affiliatePlan.cta.
function buildAffiliateCtaBox(article, chrome, label) {
  const url = resolveAffiliateUrl(article.affiliatePlan);
  if (!url) return "";
  const heading = (label || "").trim() || chrome.ctaHeading;
  return `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:24px 20px;margin:32px 0;text-align:center;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1a1a2e;">${esc(heading)}</p>
  <p style="margin:0 0 18px;font-size:13px;color:#555555;line-height:1.6;">${esc(chrome.ctaBody)}</p>
  <a href="${esc(url)}" target="_blank" rel="sponsored nofollow noopener" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">${esc(chrome.ctaButton)}</a>
</div>`;
}

function buildFaqBlock(article, chrome) {
  const faq = article.faq;
  if (!faq || faq.length === 0) return "";
  const items = faq
    .map(
      (item, i) =>
        `  <div style="padding:16px 20px;${i < faq.length - 1 ? "border-bottom:1px solid #e5e7eb;" : ""}background:#ffffff;">
    <p style="margin:0 0 8px;font-weight:700;color:#1a1a2e;font-size:15px;">Q. ${esc(item.question)}</p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">${esc(item.answer)}</p>
  </div>`
    )
    .join("\n");
  return `<div style="margin:32px 0;font-family:system-ui,-apple-system,sans-serif;">
  <h2 style="font-size:20px;font-weight:700;color:#1a1a2e;margin:0 0 16px;padding:0;">${esc(chrome.faqHeading)}</h2>
  <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
${items}
  </div>
</div>`;
}

// Editorial Disclosure: general YMYL disclaimer, always renders regardless of
// affiliate status (distinct from the Affiliate Disclosure below).
function buildEditorialDisclosureBox(article, chrome) {
  const text = article.disclosureText || chrome.disclosureDefault;
  return `<div style="background:#fef3c7;border-left:3px solid #d97706;padding:10px 16px;margin:0 0 16px;border-radius:0 4px 4px 0;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.05em;">${esc(chrome.disclosureLabel)}</p>
  <p style="margin:0;font-size:12px;color:#92400e;line-height:1.5;">${esc(text)}</p>
</div>`;
}

// Affiliate Disclosure: only when the plan is active, resolves to a real URL,
// and provides its own disclosure copy (no invented compliance text).
function buildAffiliateDisclosureBox(article, chrome) {
  const plan = article.affiliatePlan;
  const url = resolveAffiliateUrl(plan);
  const text = (plan?.disclosure || "").trim();
  if (!url || !text) return "";
  return `<div style="background:#f3f4f6;border-left:3px solid #6b7280;padding:10px 16px;margin:0 0 16px;border-radius:0 4px 4px 0;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#4b5563;text-transform:uppercase;letter-spacing:.05em;">${esc(chrome.affiliateDisclosureLabel)}</p>
  <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.5;">${esc(text)}</p>
</div>`;
}

// Product Card: provider-independent. Renders one card per productSlot that
// resolves to a real URL (own URL, or inherited from affiliatePlan.url). No
// fake ratings, review counts, prices, or discounts — only title/description/
// bestFor, which are real editorial fields on the slot.
function buildProductSlotsBox(article, chrome) {
  const plan = article.affiliatePlan;
  if (!isAffiliateActive(plan)) return "";
  const slots = Array.isArray(plan.productSlots) ? plan.productSlots : [];
  const real = slots
    .map((slot) => ({ slot, url: resolveProductSlotUrl(slot, plan) }))
    .filter(({ slot, url }) => url && (slot.title || "").trim());
  if (real.length === 0) return "";

  const cards = real
    .map(
      ({ slot, url }) => `  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:10px;background:#ffffff;">
    <p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#1a1a2e;">${esc(slot.title)}</p>
    ${slot.description ? `<p style="margin:0 0 6px;font-size:13px;color:#374151;line-height:1.5;">${esc(slot.description)}</p>` : ""}
    ${slot.bestFor ? `<p style="margin:0 0 10px;font-size:12px;color:#6b7280;">${esc(chrome.bestForLabel)}: ${esc(slot.bestFor)}</p>` : ""}
    <a href="${esc(url)}" target="_blank" rel="sponsored nofollow noopener" style="display:inline-block;background:#2563eb;color:#ffffff;padding:8px 18px;border-radius:5px;text-decoration:none;font-size:13px;font-weight:700;">${esc(chrome.ctaButton)}</a>
  </div>`
    )
    .join("\n");

  return `<div style="margin:32px 0;font-family:system-ui,-apple-system,sans-serif;">
${cards}
</div>`;
}

function buildRelatedArticlesBox(article, chrome) {
  const related = Array.isArray(article.relatedArticles) ? article.relatedArticles : [];
  const real = related.filter((r) => r && (r.title || "").trim() && isValidUrl(r.url));
  if (real.length === 0) return "";
  const items = real
    .slice(0, 4)
    .map(
      (r) =>
        `    <li style="margin-bottom:6px;"><a href="${esc(r.url)}" style="color:#2563eb;text-decoration:none;font-size:14px;">${esc(r.title)}</a></li>`
    )
    .join("\n");
  return `<div style="margin:32px 0;font-family:system-ui,-apple-system,sans-serif;">
  <h3 style="font-size:16px;font-weight:700;color:#1a1a2e;margin:0 0 10px;padding:0;">${esc(chrome.relatedHeading)}</h3>
  <ul style="margin:0;padding-left:20px;">
${items}
  </ul>
</div>`;
}

function buildSourcesBox(article, chrome) {
  const sources = Array.isArray(article.sources) ? article.sources : [];
  const real = sources.filter((s) => s && (s.title || "").trim() && isValidUrl(s.url));
  if (real.length === 0) return "";
  const items = real
    .map(
      (s) =>
        `    <li style="margin-bottom:4px;"><a href="${esc(s.url)}" target="_blank" rel="noopener" style="color:#6b7280;text-decoration:underline;font-size:12px;">${esc(s.title)}</a></li>`
    )
    .join("\n");
  return `<div style="margin:16px 0 0;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;">${esc(chrome.sourcesHeading)}</p>
  <ul style="margin:0;padding-left:18px;">
${items}
  </ul>
</div>`;
}

// Trust / Methodology: uses article.trust (authorName/role/methodology/
// reviewedAt) when present. Falls back to the old generic one-line credit for
// articles that don't yet have a trust object — never invents credentials.
function buildTrustBox(article, chrome) {
  const trust = article.trust;
  if (trust && (trust.authorName || trust.role || trust.methodology || trust.reviewedAt)) {
    const lines = [];
    if (trust.authorName) {
      const roleSuffix = trust.role ? ` · ${esc(trust.role)}` : "";
      lines.push(`  <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1a1a2e;">${esc(trust.authorName)}${roleSuffix}</p>`);
    }
    if (trust.methodology) {
      lines.push(`  <p style="margin:0 0 4px;font-size:12px;color:#6b7280;line-height:1.6;">${esc(trust.methodology)}</p>`);
    }
    if (trust.reviewedAt) {
      lines.push(`  <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;">${esc(chrome.reviewedLabel)}: ${esc(formatDate(trust.reviewedAt))}</p>`);
    }
    lines.push(`  <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">${esc(chrome.trustIndependenceNote)}</p>`);
    return `<div style="border-top:2px solid #e5e7eb;margin-top:40px;padding-top:20px;font-family:system-ui,-apple-system,sans-serif;">
${lines.join("\n")}
</div>`;
  }

  const date = article.createdAt;
  const suffix = date ? ` · ${formatDate(date)}` : "";
  return `<div style="border-top:2px solid #e5e7eb;margin-top:40px;padding-top:20px;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">${esc(chrome.authorLabel)}${esc(suffix)}.</p>
</div>`;
}

// ─── Main Assembler ───────────────────────────────────────────────────────────

/**
 * buildRevenueHtml(article, bodyHtml)
 *
 * Wraps pre-built body HTML with revenue-optimized, category-aware,
 * language-aware design sections. Returns { html, sections, designType, intent, persona }.
 *
 * mode: "publish" (default) only emits real https publicUrl images, safe to
 * send to Blogger. "local" additionally allows localSrc, for on-device
 * preview only — callers must never pass "local" output to a publish path.
 */
export function buildRevenueHtml(article, bodyHtml, { mode = "publish" } = {}) {
  const chrome = getChrome(article);
  const visualsByPlacement = resolveVisualAssetsByPlacement(article, mode);
  const leadEditorialImage = buildVisualAssetFigure(visualsByPlacement.afterByline, { eager: true });
  const comparisonInfographicImage = buildVisualAssetFigure(visualsByPlacement.afterComparisonCriteria);
  const beforeBuyInfographicImage = buildVisualAssetFigure(visualsByPlacement.afterFaq);
  // Body with any section-anchored figures (afterSection:<heading>) injected in
  // place. Falls back to the plain body when no such assets exist.
  const bodyWithVisuals = injectSectionVisuals(bodyHtml, article, visualsByPlacement);
  const intent = article.searchIntent || detectSearchIntent(article.title);
  const personaObj = article.persona
    ? { name: article.persona }
    : getReaderPersona(article.category, intent);
  const heroPolicy = classifyHeroPolicy(article);
  const infoFirst = heroPolicy === "info-first" || heroPolicy === "safety";
  const plan = article.affiliatePlan;
  const cta = plan?.cta || {};

  const updatedBox = buildUpdatedDateBox(article, chrome);
  const byline = buildByline(article, chrome);
  const quickAnswerBox = buildQuickAnswerBox(article);
  const comparisonCriteriaBox = buildComparisonCriteriaBox(article, chrome);
  const editorialDisclosureBox = buildEditorialDisclosureBox(article, chrome);
  const affiliateDisclosureBox = buildAffiliateDisclosureBox(article, chrome);
  const heroBox = buildHeroBox(article, chrome);
  const topCtaBox = buildAffiliateCtaBox(article, chrome, cta.topLabel);
  const decisionCtaBox = buildAffiliateCtaBox(article, chrome, cta.decisionLabel);
  const comparisonTable = buildComparisonTable(article, chrome);
  const productSlotsBox = buildProductSlotsBox(article, chrome);
  const toc = buildTableOfContents(article, chrome);
  const takeaways = buildKeyTakeaways(article, chrome);
  const faqBlock = buildFaqBlock(article, chrome);
  const relatedBox = buildRelatedArticlesBox(article, chrome);
  const trustBox = buildTrustBox(article, chrome);
  const sourcesBox = buildSourcesBox(article, chrome);

  const parts = [];
  const includedSections = [];
  const add = (name, html) => {
    if (html) {
      parts.push(html);
      includedSections.push(name);
    }
  };

  if (infoFirst) {
    // Insurance/Finance/Tax/Legal & Safety/Health confirmed Reading Flow:
    // byline -> Affiliate Disclosure -> Quick Answer -> comparison criteria ->
    // top CTA -> TOC -> body+Key Takeaways -> Comparison Table -> Product Card
    // -> FAQ -> Decision CTA -> Trust/Methodology -> Sources -> Related.
    // No Hero, no separate Editorial Disclosure box, no generic "Last updated"
    // line in this category — the byline's reviewedAt and the Trust box's
    // independence note already cover that ground without stacking boxes.
    add("byline", byline);
    add("affiliateDisclosureBox", affiliateDisclosureBox);
    add("leadEditorialImage", leadEditorialImage);
    add("quickAnswerBox", quickAnswerBox);
    add("comparisonCriteriaBox", comparisonCriteriaBox);
    add("comparisonInfographicImage", comparisonInfographicImage);
    add("topCtaBox", topCtaBox);
    add("tableOfContents", toc);
    parts.push(bodyWithVisuals || "");
    add("keyTakeaways", takeaways);
    add("comparisonTable", comparisonTable);
    add("productSlotsBox", productSlotsBox);
    add("faqBlock", faqBlock);
    add("beforeBuyInfographicImage", beforeBuyInfographicImage);
    add("decisionCtaBox", decisionCtaBox);
    add("trustBox", trustBox);
    add("sourcesBox", sourcesBox);
    add("relatedArticlesBox", relatedBox);
  } else {
    // Travel/Outdoor/Home/Food/Pet (and Product Review): 실제 Hero 이미지가
    // 있으면 적극적으로 사용한다.
    add(`heroBox:${heroPolicy}`, heroBox);
    add("updatedDateBox", updatedBox);
    add("quickAnswerBox", quickAnswerBox);
    add("topCtaBox", topCtaBox);
    add("affiliateDisclosureBox", affiliateDisclosureBox);
    add("editorialDisclosureBox", editorialDisclosureBox);
    add("comparisonTable", comparisonTable);
    add("productSlotsBox", productSlotsBox);
    add("tableOfContents", toc);
    add("keyTakeaways", takeaways);
    parts.push(bodyWithVisuals || "");
    add("faqBlock", faqBlock);
    add("decisionCtaBox", decisionCtaBox);
    add("relatedArticlesBox", relatedBox);
    add("trustBox", trustBox);
    add("sourcesBox", sourcesBox);
  }

  const html = parts.filter(Boolean).join("\n\n");

  return {
    html,
    sections: includedSections,
    designType: article.template || "guide",
    heroPolicy,
    intent,
    persona: personaObj?.name || "General Reader",
  };
}
