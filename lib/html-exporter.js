import { getTemplateQualityBonus } from "@/lib/atlas/template-engine";

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function markdownToHtml(markdown) {
  const lines = (markdown || "").split("\n");
  const html = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    if (line.startsWith("### ")) {
      closeList();
      html.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith("- ")) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inline(line.slice(2))}</li>`);
    } else {
      closeList();
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();

  return html.join("\n");
}

export function buildFaqHtml(faq) {
  if (!faq || faq.length === 0) return "";
  const items = faq
    .map(
      (item) =>
        `<h3>${escapeHtml(item.question)}</h3>\n<p>${escapeHtml(item.answer)}</p>`
    )
    .join("\n");
  return `<h2>자주 묻는 질문 (FAQ)</h2>\n${items}`;
}

export function buildBloggerHtml(article) {
  const bodyHtml = article.bodyHtml || markdownToHtml(article.bodyMarkdown);
  const faqHtml = buildFaqHtml(article.faq);
  return [bodyHtml, faqHtml].filter(Boolean).join("\n\n");
}

export function getBloggerChecklist(article) {
  const titleLength = (article.title || "").length;
  const metaLength = (article.metaDescription || "").length;
  const bodyLength = (article.bodyMarkdown || "").replace(/[#*\-\n]/g, "").length;
  const faqCount = (article.faq || []).length;
  const tagCount = (article.tags || []).length;
  const hasDisclaimer = Boolean(article.qualityChecklist?.hasDisclaimer);

  return [
    {
      label: "제목 길이 (10~70자)",
      passed: titleLength >= 10 && titleLength <= 70,
      detail: `${titleLength}자`,
    },
    {
      label: "메타 설명 길이 (50~160자)",
      passed: metaLength >= 50 && metaLength <= 160,
      detail: `${metaLength}자`,
    },
    {
      label: "본문 분량 (800자 이상)",
      passed: bodyLength >= 800,
      detail: `${bodyLength}자`,
    },
    {
      label: "FAQ 3개 이상",
      passed: faqCount >= 3,
      detail: `${faqCount}개`,
    },
    {
      label: "주의 문구 포함",
      passed: hasDisclaimer,
      detail: hasDisclaimer ? "포함" : "미포함",
    },
    {
      label: "태그 등록",
      passed: tagCount > 0,
      detail: `${tagCount}개`,
    },
    ...getTemplateQualityBonus(article),
  ];
}
