// Revenue Design Engine — Blogger-compatible HTML sections for monetization layout
// Inline styles only. No external CSS/JS. Single-column, mobile-first.

import { detectSearchIntent, getReaderPersona } from "./template-engine.js";

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

// ─── Section Builders ─────────────────────────────────────────────────────────

function buildUpdatedDateBox(article) {
  const date = article.updatedAt || article.createdAt;
  if (!date) return "";
  return `<p style="font-size:12px;color:#9ca3af;margin:0 0 10px;font-family:system-ui,-apple-system,sans-serif;">Last updated: ${esc(formatDate(date))}</p>`;
}

function buildSummaryBox(article) {
  const text = article.metaDescription || "";
  if (!text) return "";
  return `<div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:16px 20px;margin:0 0 24px;border-radius:0 8px 8px 0;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0;font-size:15px;color:#1e3a5f;line-height:1.7;">${esc(text)}</p>
</div>`;
}

function buildTableOfContents(article) {
  const headings = extractH2s(article.bodyMarkdown);
  if (headings.length < 2) return "";
  const items = headings
    .map(
      (h, i) =>
        `    <li style="margin-bottom:6px;"><a href="#h2-${i}" style="color:#2563eb;text-decoration:none;font-size:14px;">${esc(h)}</a></li>`
    )
    .join("\n");
  return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:0 0 24px;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;">목차</p>
  <ol style="margin:0;padding-left:20px;">
${items}
  </ol>
</div>`;
}

function buildKeyTakeaways(article) {
  const headings = extractH2s(article.bodyMarkdown);
  const points = headings
    .filter((h) => !/^(FAQ|자주|마무리|주의|이 글|Disclaimer)/i.test(h))
    .slice(0, 5);
  if (points.length === 0) return "";
  const items = points
    .map(
      (p) =>
        `    <li style="margin-bottom:8px;color:#374151;font-size:14px;line-height:1.6;">${esc(p)}</li>`
    )
    .join("\n");
  return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 24px;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:.07em;">핵심 포인트</p>
  <ul style="margin:0;padding-left:20px;">
${items}
  </ul>
</div>`;
}

function buildComparisonTablePlaceholder(article) {
  const headings = extractH2s(article.bodyMarkdown).slice(0, 3);
  const rowLabels = headings.length >= 2 ? headings : ["가격", "주요 특징", "적합 대상"];
  const rows = rowLabels
    .map(
      (h, i) =>
        `      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;font-weight:600;">${esc(h)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">—</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">—</td>
      </tr>`
    )
    .join("\n");
  return `<div style="overflow-x:auto;margin:24px 0;font-family:system-ui,-apple-system,sans-serif;">
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr style="background:#2563eb;color:#ffffff;">
        <th style="padding:12px 14px;text-align:left;font-weight:700;">항목</th>
        <th style="padding:12px 14px;text-align:left;font-weight:700;">옵션 A</th>
        <th style="padding:12px 14px;text-align:left;font-weight:700;">옵션 B</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</div>`;
}

function buildAffiliateCtaBox() {
  return `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:24px 20px;margin:32px 0;text-align:center;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1a1a2e;">지금 바로 확인하세요</p>
  <p style="margin:0 0 18px;font-size:13px;color:#555555;line-height:1.6;">최신 가격·혜택 정보는 공식 페이지에서 직접 확인하세요.</p>
  <a href="#" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">자세히 보기 →</a>
</div>`;
}

function buildFaqBlock(article) {
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
  <h2 style="font-size:20px;font-weight:700;color:#1a1a2e;margin:0 0 16px;padding:0;">자주 묻는 질문 (FAQ)</h2>
  <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
${items}
  </div>
</div>`;
}

function buildAffiliateDisclosureBox(disclosure) {
  if (!disclosure) return "";
  return `<div style="background:#f9fafb;border-left:3px solid #d1d5db;padding:8px 14px;margin:0 0 16px;border-radius:0 4px 4px 0;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">* 제휴 링크 고지: ${esc(disclosure)}</p>
</div>`;
}

function buildProductSlotsBox(affiliatePlan) {
  if (!affiliatePlan?.productSlots?.length) return "";
  const slots = affiliatePlan.productSlots
    .sort((a, b) => a.priority - b.priority)
    .map(
      (slot) =>
        `  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:10px;background:#ffffff;">
    <p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#1a1a2e;">${esc(slot.label)}</p>
    <p style="margin:0 0 10px;font-size:12px;color:#6b7280;">${esc(slot.reason)}</p>
    ${slot.linkPlaceholder}
    <a href="#" style="display:inline-block;background:#2563eb;color:#ffffff;padding:8px 18px;border-radius:5px;text-decoration:none;font-size:13px;font-weight:700;">확인하기 →</a>
  </div>`
    )
    .join("\n");
  return `<div style="margin:32px 0;font-family:system-ui,-apple-system,sans-serif;">
  <h3 style="font-size:16px;font-weight:700;color:#1a1a2e;margin:0 0 8px;padding:0;">추천 상품 / 서비스</h3>
  <p style="margin:0 0 14px;font-size:13px;color:#6b7280;">${esc(affiliatePlan.ctaText || "")}</p>
${slots}
</div>`;
}

function buildAuthorBox(article) {
  const date = article.createdAt;
  const suffix = date ? ` · ${formatDate(date)}` : "";
  return `<div style="border-top:2px solid #e5e7eb;margin-top:40px;padding-top:20px;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">이 글은 ATLAS 편집팀이 작성했습니다${esc(suffix)}. 정보는 작성 시점 기준이며 최신 내용은 공식 채널에서 확인하시기 바랍니다.</p>
</div>`;
}

// ─── Main Assembler ───────────────────────────────────────────────────────────

/**
 * buildRevenueHtml(article, bodyHtml)
 *
 * Wraps pre-built body HTML with revenue-optimized design sections.
 * Returns { html, sections, designType, intent, persona }.
 */
export function buildRevenueHtml(article, bodyHtml) {
  const intent = article.searchIntent || detectSearchIntent(article.title);
  const personaObj = article.persona
    ? { name: article.persona }
    : getReaderPersona(article.category, intent);
  const templateType = article.template || "guide";

  const isBuyerIntent =
    intent === "commercial" || intent === "transactional" || intent === "comparison";
  const needsComparisonTable =
    templateType === "comparison" || templateType === "review";

  const topParts = [];
  const bottomParts = [];
  const includedSections = [];

  // ── Top ──────────────────────────────────────────────────────────────────
  const updatedBox = buildUpdatedDateBox(article);
  if (updatedBox) { topParts.push(updatedBox); includedSections.push("updatedDateBox"); }

  if (article.affiliatePlan?.disclosure) {
    const disc = buildAffiliateDisclosureBox(article.affiliatePlan.disclosure);
    if (disc) { topParts.push(disc); includedSections.push("affiliateDisclosure"); }
  }

  const summaryBox = buildSummaryBox(article);
  if (summaryBox) { topParts.push(summaryBox); includedSections.push("summaryBox"); }

  const toc = buildTableOfContents(article);
  if (toc) { topParts.push(toc); includedSections.push("tableOfContents"); }

  const takeaways = buildKeyTakeaways(article);
  if (takeaways) { topParts.push(takeaways); includedSections.push("keyTakeaways"); }

  // ── Bottom (after body) ──────────────────────────────────────────────────
  if (needsComparisonTable) {
    const table = buildComparisonTablePlaceholder(article);
    if (table) { bottomParts.push(table); includedSections.push("comparisonTablePlaceholder"); }
  }

  const faqBlock = buildFaqBlock(article);
  if (faqBlock) { bottomParts.push(faqBlock); includedSections.push("faqBlock"); }

  if (article.affiliatePlan?.productSlots?.length) {
    const slots = buildProductSlotsBox(article.affiliatePlan);
    if (slots) { bottomParts.push(slots); includedSections.push("productSlotsBox"); }
  } else if (isBuyerIntent) {
    const cta = buildAffiliateCtaBox(article);
    if (cta) { bottomParts.push(cta); includedSections.push("affiliateCtaBox"); }
  }

  const authorBox = buildAuthorBox(article);
  if (authorBox) { bottomParts.push(authorBox); includedSections.push("authorBox"); }

  const html = [...topParts, bodyHtml || "", ...bottomParts]
    .filter(Boolean)
    .join("\n\n");

  return {
    html,
    sections: includedSections,
    designType: templateType,
    intent,
    persona: personaObj?.name || "General Reader",
  };
}
