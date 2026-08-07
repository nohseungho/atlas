// Revenue Design Engine — Blogger-compatible HTML sections for monetization layout
// Inline styles only. No external CSS/JS. Single-column, mobile-first.
// Structure (ATLAS MASTER Blog Design v1): Summary -> Quick Answer -> Reader Promise ->
// Body -> Decision Checklist -> Comparison/Key Points -> Recommendation -> FAQ ->
// Sources & References -> Related Articles -> CTA -> Author.
// No hero section, no banner, no long intro. All copy in English for global posts.

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

// 지정한 헤딩(정규식) 아래 문단 텍스트를 다음 H2 전까지 이어붙여 반환한다.
function extractSection(markdown, headingPattern) {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  let capturing = false;
  const captured = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const h2Match = /^## (.+)$/.exec(line);

    if (h2Match) {
      if (capturing) break;
      if (headingPattern.test(h2Match[1])) capturing = true;
      continue;
    }

    if (capturing && line && !line.startsWith("- ")) {
      captured.push(line);
    }
  }

  return captured.join(" ").trim();
}

// 지정한 헤딩 아래의 "- " 불릿 목록만 추출한다 (체크리스트용).
function extractSectionBullets(markdown, headingPattern) {
  if (!markdown) return [];
  const lines = markdown.split("\n");
  let capturing = false;
  const bullets = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const h2Match = /^## (.+)$/.exec(line);

    if (h2Match) {
      if (capturing) break;
      if (headingPattern.test(h2Match[1])) capturing = true;
      continue;
    }

    if (capturing && line.startsWith("- ")) {
      bullets.push(line.slice(2).trim());
    }
  }

  return bullets;
}

const NON_TOPIC_HEADING_PATTERN =
  /^(faq|frequently asked|quick answer|빠른 답변|reader promise|summary|요약|conclusion|마무리|주의|disclaimer|sources|references|related|checklist|체크리스트)/i;

// ─── Section Builders ─────────────────────────────────────────────────────────

function buildUpdatedDateBox(article) {
  const date = article.updatedAt || article.createdAt;
  if (!date) return "";
  return `<p style="font-size:12px;color:#9ca3af;margin:0 0 10px;font-family:system-ui,-apple-system,sans-serif;">Last updated: ${esc(formatDate(date))}</p>`;
}

function buildAffiliateDisclosureBox(disclosure) {
  if (!disclosure) return "";
  return `<div style="background:#f9fafb;border-left:3px solid #d1d5db;padding:8px 14px;margin:0 0 16px;border-radius:0 4px 4px 0;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">* Affiliate Disclosure: ${esc(disclosure)}</p>
</div>`;
}

function buildSummaryBox(article) {
  const text = article.metaDescription || "";
  if (!text) return "";
  return `<div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:16px 20px;margin:0 0 24px;border-radius:0 8px 8px 0;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0;font-size:15px;color:#1e3a5f;line-height:1.7;">${esc(text)}</p>
</div>`;
}

function buildQuickAnswerBox(article) {
  const text = extractSection(article.bodyMarkdown, /quick answer|빠른 답변/i);
  if (!text) return "";
  return `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:18px 20px;margin:0 0 24px;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.06em;">Quick Answer</p>
  <p style="margin:0;font-size:15px;color:#1e3a5f;line-height:1.7;">${esc(text)}</p>
</div>`;
}

function buildReaderPromiseBox(article) {
  const text = extractSection(article.bodyMarkdown, /reader promise|이 글에서 얻는|이 글을 읽으면/i);
  const points = text
    ? []
    : extractH2s(article.bodyMarkdown)
        .filter((h) => !NON_TOPIC_HEADING_PATTERN.test(h))
        .slice(0, 3);

  if (!text && points.length === 0) return "";

  const body = text
    ? `<p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">${esc(text)}</p>`
    : `<ul style="margin:0;padding-left:20px;">
${points.map((p) => `    <li style="margin-bottom:4px;font-size:14px;color:#374151;line-height:1.6;">${esc(p)}</li>`).join("\n")}
  </ul>`;

  return `<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:0 0 24px;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">By the end of this article, you'll know</p>
  ${body}
</div>`;
}

function buildDecisionChecklistBox(article) {
  const bullets = extractSectionBullets(article.bodyMarkdown, /checklist|체크리스트/i);
  if (bullets.length === 0) return "";
  const items = bullets
    .map(
      (b) =>
        `    <li style="margin-bottom:8px;font-size:14px;color:#1f2937;line-height:1.6;">✓ ${esc(b)}</li>`
    )
    .join("\n");
  return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:24px 0;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;">Before You Decide: Checklist</p>
  <ul style="margin:0;padding-left:20px;list-style:none;">
${items}
  </ul>
</div>`;
}

function buildKeyPointsBox(article) {
  const headings = extractH2s(article.bodyMarkdown)
    .filter((h) => !NON_TOPIC_HEADING_PATTERN.test(h))
    .slice(0, 5);
  if (headings.length === 0) return "";
  const items = headings
    .map(
      (p) =>
        `    <li style="margin-bottom:8px;color:#374151;font-size:14px;line-height:1.6;">${esc(p)}</li>`
    )
    .join("\n");
  return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:24px 0;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:.07em;">Key Points</p>
  <ul style="margin:0;padding-left:20px;">
${items}
  </ul>
</div>`;
}

function buildComparisonTable(article) {
  const headings = extractH2s(article.bodyMarkdown)
    .filter((h) => !NON_TOPIC_HEADING_PATTERN.test(h))
    .slice(0, 3);
  const rowLabels = headings.length >= 2 ? headings : ["Price", "Key Features", "Best For"];
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
        <th style="padding:12px 14px;text-align:left;font-weight:700;">Feature</th>
        <th style="padding:12px 14px;text-align:left;font-weight:700;">Option A</th>
        <th style="padding:12px 14px;text-align:left;font-weight:700;">Option B</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
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
  <h2 style="font-size:20px;font-weight:700;color:#1a1a2e;margin:0 0 16px;padding:0;">Frequently Asked Questions (FAQ)</h2>
  <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
${items}
  </div>
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
    <a href="#" style="display:inline-block;background:#2563eb;color:#ffffff;padding:8px 18px;border-radius:5px;text-decoration:none;font-size:13px;font-weight:700;">Check It Out →</a>
  </div>`
    )
    .join("\n");
  return `<div style="margin:32px 0;font-family:system-ui,-apple-system,sans-serif;">
  <h3 style="font-size:16px;font-weight:700;color:#1a1a2e;margin:0 0 8px;padding:0;">Our Recommendation</h3>
  <p style="margin:0 0 14px;font-size:13px;color:#6b7280;">${esc(affiliatePlan.ctaText || "")}</p>
${slots}
</div>`;
}

function buildSourcesBox(article) {
  const sources = article.sources;
  if (Array.isArray(sources) && sources.length > 0) {
    const items = sources
      .map(
        (s) =>
          `    <li style="margin-bottom:6px;font-size:13px;"><a href="${esc(s.url || "#")}" style="color:#2563eb;text-decoration:none;">${esc(s.label || s.url || "Source")}</a></li>`
      )
      .join("\n");
    return `<div style="margin:32px 0;font-family:system-ui,-apple-system,sans-serif;">
  <h3 style="font-size:15px;font-weight:700;color:#1a1a2e;margin:0 0 10px;">Sources & References</h3>
  <ul style="margin:0;padding-left:20px;">
${items}
  </ul>
</div>`;
  }
  return `<div style="background:#f9fafb;border:1px dashed #d1d5db;border-radius:8px;padding:14px 18px;margin:32px 0;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0;font-size:12px;color:#9ca3af;">Sources to verify before final publishing.</p>
</div>`;
}

function buildRelatedArticlesBox(article) {
  const related = article.relatedArticles;
  const hasReal = Array.isArray(related) && related.length > 0;
  const cards = hasReal
    ? related
        .slice(0, 3)
        .map(
          (item) =>
            `    <a href="${esc(item.url || "#")}" style="display:block;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:10px;text-decoration:none;background:#ffffff;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a2e;">${esc(item.title)}</p>
    </a>`
        )
        .join("\n")
    : [1, 2, 3]
        .map(
          () =>
            `    <div style="border:1px dashed #d1d5db;border-radius:8px;padding:14px 16px;margin-bottom:10px;background:#fafafa;">
      <p style="margin:0;font-size:13px;color:#9ca3af;">Related article slot — add link before publishing</p>
    </div>`
        )
        .join("\n");
  return `<div style="margin:32px 0;font-family:system-ui,-apple-system,sans-serif;">
  <h3 style="font-size:15px;font-weight:700;color:#1a1a2e;margin:0 0 10px;">Related Articles</h3>
${cards}
</div>`;
}

function buildCtaBox(isBuyerIntent) {
  const heading = isBuyerIntent ? "Ready to Take the Next Step?" : "Want to Learn More?";
  const body = isBuyerIntent
    ? "Check the official page for the latest price and details before you decide."
    : "Explore the official source for the most up-to-date information on this topic.";
  return `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:24px 20px;margin:32px 0;text-align:center;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1a1a2e;">${esc(heading)}</p>
  <p style="margin:0 0 18px;font-size:13px;color:#555555;line-height:1.6;">${esc(body)}</p>
  <a href="#" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">Learn More →</a>
</div>`;
}

function buildAuthorBox(article) {
  const date = article.createdAt;
  const suffix = date ? ` · ${formatDate(date)}` : "";
  return `<div style="border-top:2px solid #e5e7eb;margin-top:40px;padding-top:20px;font-family:system-ui,-apple-system,sans-serif;">
  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">This article was written by the ATLAS editorial team${esc(suffix)}. Information is accurate as of the publish date — please check official sources for the latest updates.</p>
</div>`;
}

// ─── Main Assembler ───────────────────────────────────────────────────────────

/**
 * buildRevenueHtml(article, bodyHtml)
 *
 * Wraps pre-built body HTML with revenue-optimized design sections in the
 * ATLAS MASTER Blog Design v1 order:
 * Summary -> Quick Answer -> Reader Promise -> Body -> Decision Checklist ->
 * Comparison/Key Points -> Recommendation -> FAQ -> Sources & References ->
 * Related Articles -> CTA -> Author.
 * No hero, no banner, no long intro.
 *
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

  // ── Top: Summary -> Quick Answer -> Reader Promise ──────────────────────
  const updatedBox = buildUpdatedDateBox(article);
  if (updatedBox) { topParts.push(updatedBox); includedSections.push("updatedDateBox"); }

  if (article.affiliatePlan?.disclosure) {
    const disc = buildAffiliateDisclosureBox(article.affiliatePlan.disclosure);
    if (disc) { topParts.push(disc); includedSections.push("affiliateDisclosure"); }
  }

  const summaryBox = buildSummaryBox(article);
  if (summaryBox) { topParts.push(summaryBox); includedSections.push("summaryBox"); }

  const quickAnswer = buildQuickAnswerBox(article);
  if (quickAnswer) { topParts.push(quickAnswer); includedSections.push("quickAnswerBox"); }

  const readerPromise = buildReaderPromiseBox(article);
  if (readerPromise) { topParts.push(readerPromise); includedSections.push("readerPromiseBox"); }

  // ── Bottom: Decision Checklist -> Comparison/Key Points -> Recommendation ->
  //    FAQ -> Sources & References -> Related Articles -> CTA -> Author ─────
  const checklist = buildDecisionChecklistBox(article);
  if (checklist) { bottomParts.push(checklist); includedSections.push("decisionChecklistBox"); }

  if (needsComparisonTable) {
    const table = buildComparisonTable(article);
    if (table) { bottomParts.push(table); includedSections.push("comparisonTable"); }
  } else {
    const keyPoints = buildKeyPointsBox(article);
    if (keyPoints) { bottomParts.push(keyPoints); includedSections.push("keyPointsBox"); }
  }

  if (article.affiliatePlan?.productSlots?.length) {
    const slots = buildProductSlotsBox(article.affiliatePlan);
    if (slots) { bottomParts.push(slots); includedSections.push("recommendationBox"); }
  }

  const faqBlock = buildFaqBlock(article);
  if (faqBlock) { bottomParts.push(faqBlock); includedSections.push("faqBlock"); }

  const sourcesBox = buildSourcesBox(article);
  if (sourcesBox) { bottomParts.push(sourcesBox); includedSections.push("sourcesBox"); }

  const relatedBox = buildRelatedArticlesBox(article);
  if (relatedBox) { bottomParts.push(relatedBox); includedSections.push("relatedArticlesBox"); }

  const ctaBox = buildCtaBox(isBuyerIntent);
  if (ctaBox) { bottomParts.push(ctaBox); includedSections.push("ctaBox"); }

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
