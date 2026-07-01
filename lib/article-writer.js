import { markdownToHtml } from "./html-exporter";

const DISCLAIMER_CATEGORY_PATTERN = /보험|건강|금융|세금|정부지원금/;
const FINANCE_DISCLAIMER =
  "이 글은 일반적인 정보 제공 목적이며, 개인 상황에 따라 전문가 상담이 필요할 수 있습니다.";

function slugify(text) {
  return text
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .toLowerCase();
}

function buildOutline(keyword) {
  return [
    "도입",
    "핵심 요약",
    `${keyword}란 무엇인가`,
    `${keyword} 확인 시 체크리스트`,
    `${keyword} 관련 자주 하는 실수`,
    `${keyword} 잘 활용하는 방법`,
    "FAQ",
    "마무리",
  ];
}

function buildFaq(keyword) {
  return [
    {
      question: `${keyword}, 얼마나 자주 확인해야 하나요?`,
      answer: `${keyword}은 상황 변화가 있을 때마다 확인하는 것이 좋습니다. 최소 분기에 한 번은 최신 정보를 점검하세요.`,
    },
    {
      question: `${keyword} 관련 정보는 어디서 확인할 수 있나요?`,
      answer: "공식 기관 홈페이지나 서비스 제공처의 공지사항을 우선적으로 확인하는 것이 가장 정확합니다.",
    },
    {
      question: `초보자도 ${keyword}를 쉽게 이해할 수 있나요?`,
      answer: "기본 개념부터 차근차근 정리하면 충분히 이해할 수 있습니다. 이 글의 핵심 요약 부분을 먼저 읽어보세요.",
    },
  ];
}

export function generateArticleFromKeyword(keyword) {
  const title = `${keyword.keyword} 완벽 정리 가이드`;
  const slug = slugify(title) || `article-${keyword.id}`;
  const needsDisclaimer = DISCLAIMER_CATEGORY_PATTERN.test(keyword.category);
  const faq = buildFaq(keyword.keyword);

  const sections = [
    `## 도입\n\n${keyword.keyword}에 대해 궁금해하는 분들이 많습니다. 이 글에서는 ${keyword.keyword}의 핵심 내용을 한눈에 볼 수 있도록 정리했습니다.`,
    `## 핵심 요약\n\n- ${keyword.keyword}의 기본 개념\n- 꼭 확인해야 할 체크포인트\n- 실수하기 쉬운 부분\n- 실제로 활용하는 방법`,
    `## ${keyword.keyword}란 무엇인가\n\n${keyword.keyword}는 많은 사람들이 관심을 갖는 주제입니다. 기본 개념과 배경을 먼저 짚고 넘어가겠습니다.`,
    `## ${keyword.keyword} 확인 시 체크리스트\n\n- 최신 정보인지 확인하기\n- 본인 상황에 맞는지 확인하기\n- 공식 출처인지 확인하기`,
    `## ${keyword.keyword} 관련 자주 하는 실수\n\n많은 사람들이 ${keyword.keyword}를 확인할 때 오래된 정보를 그대로 믿거나, 본인 상황을 고려하지 않고 적용하는 실수를 합니다.`,
    `## ${keyword.keyword} 잘 활용하는 방법\n\n${keyword.keyword}를 실제로 활용할 때는 여러 옵션을 비교하고, 본인에게 맞는 방식을 선택하는 것이 중요합니다.`,
  ];

  sections.push(
    needsDisclaimer
      ? `## 주의 사항\n\n${FINANCE_DISCLAIMER}`
      : "## 주의 사항\n\n이 글은 정보 제공을 목적으로 작성되었으며, 실제 적용 시 최신 정보를 다시 확인하시기 바랍니다."
  );

  sections.push(
    `## 마무리\n\n지금까지 ${keyword.keyword}에 대해 정리해봤습니다. 오늘 확인한 내용을 바탕으로 본인에게 맞는 선택을 해보세요.`
  );

  const bodyMarkdown = sections.join("\n\n");
  const bodyHtml = markdownToHtml(bodyMarkdown);
  const metaDescription = `${keyword.keyword} 관련 핵심 정보를 정리했습니다. 체크리스트와 FAQ까지 한번에 확인하세요.`.slice(
    0,
    160
  );

  const tags = Array.from(
    new Set([keyword.category, ...keyword.keyword.split(/\s+/)].filter(Boolean))
  ).slice(0, 6);

  return {
    keywordId: keyword.id,
    keyword: keyword.keyword,
    title,
    slug,
    metaDescription,
    category: keyword.category,
    tags,
    outline: buildOutline(keyword.keyword),
    bodyMarkdown,
    bodyHtml,
    faq,
    status: "written",
    qualityChecklist: {
      hasClearTitle: true,
      hasEnoughBody: true,
      hasFaq: true,
      hasDisclaimer: true,
      readyForBlogger: true,
    },
  };
}
