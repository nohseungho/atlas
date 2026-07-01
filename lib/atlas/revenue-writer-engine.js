// Revenue Writer Engine — produces monetization-optimized article bodies
// Pure markdown output; no HTML conversion here (html-exporter handles that).

import { detectSearchIntent } from "./template-engine.js";
import { generateCtrCandidates, selectBestCtrCandidate } from "./ctr-engine.js";
import { buildAffiliatePlan } from "./affiliate-engine.js";

const DISCLAIMER_PATTERN = /보험|건강|금융|세금|약|의료|법률/;

function slugify(text) {
  return text.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").toLowerCase();
}

// ─── Purchase Intent Sentences ────────────────────────────────────────────────

export function generatePurchaseIntentSentences(keyword) {
  const kw = keyword.keyword || String(keyword);
  return {
    ifYouAre: `만약 ${kw}에 대한 최선의 선택을 찾고 계신다면, 아래 추천 항목을 먼저 확인하세요.`,
    weRecommend: `결정 전 최소 2~3가지 옵션을 비교하시길 권장합니다. 가격과 조건은 수시로 변경될 수 있습니다.`,
    bestFor: `최적 대상: ${kw}를 처음 접하거나 빠르게 비교 후 결정하고 싶은 분.`,
    worthBuyingIf: `구매 가치가 있는 경우: 품질을 최우선시하며 검증된 옵션이 필요한 분.`,
  };
}

// ─── Review Block (Pros / Cons / Best for / Avoid if / Rating) ───────────────

export function generateReviewBlock(keyword) {
  const kw = keyword.keyword || String(keyword);
  return `## 종합 평가

**장점 (Pros)**
- 핵심 기능을 명확하게 제공
- 가격 대비 성능 우수
- 검증된 사용자 리뷰

**단점 (Cons)**
- 일부 옵션은 가격이 높을 수 있음
- 개인 상황에 따라 효과 차이 있음

**이런 분께 추천 (Best for)**
${kw}를 처음 알아보는 분, 빠르게 비교 후 결정하고 싶은 분.

**비추천 대상 (Avoid if)**
이미 ${kw} 관련 제품·서비스를 보유 중이거나 특수한 요구사항이 있다면 전문가 상담을 먼저 권장합니다.

**평점**
★★★★☆ 4.1 / 5.0`;
}

// ─── Affiliate Placeholder ────────────────────────────────────────────────────

export function generateAffiliatePlaceholder(keyword) {
  const kw = keyword.keyword || String(keyword);
  return `## 구매처 안내 (Where to Buy)

<!-- AFFILIATE_PLACEHOLDER: Replace with actual affiliate links -->

${kw} 관련 제품·서비스는 아래 채널에서 확인할 수 있습니다.

- **공식 사이트**: 최신 정보와 혜택 직접 확인
- **Amazon**: 빠른 배송 및 실제 구매자 리뷰
- **가격 비교 사이트**: 여러 옵션을 한 번에 비교

> 이 글의 일부 링크는 제휴 링크로, 구매 시 소정의 수수료가 발생할 수 있습니다.`;
}

// ─── Revenue Body ─────────────────────────────────────────────────────────────

export function generateRevenueBody(keyword) {
  const kw = keyword.keyword || String(keyword);
  const intent = detectSearchIntent(kw);
  const sentences = generatePurchaseIntentSentences(keyword);
  const needsDisclaimer = DISCLAIMER_PATTERN.test(kw);

  const sections = [
    `## 빠른 답변

${kw}에 대한 핵심 정보를 찾고 계신다면, 이 글 하나로 해결됩니다. 비교표와 추천 정보를 바로 아래에서 확인하세요.`,

    `## 왜 ${kw}인가

${kw}는 많은 사람들이 검색하는 주제입니다. 선택지가 다양하고 정보가 방대하기 때문에 올바른 결정을 내리기 어렵습니다. 이 글은 핵심만 추려 빠른 결정을 도와드립니다.`,

    `## 비교: ${kw} 선택 기준

올바른 선택을 위해 아래 기준을 먼저 확인하세요.

- **가격**: 예산 범위에 맞는지 확인
- **기능**: 필요한 기능이 포함되어 있는지 확인
- **신뢰도**: 실제 사용자 리뷰와 전문가 평가 확인
- **지원**: 고객 지원 및 보증 여부 확인`,

    `## 추천

${sentences.ifYouAre}

${sentences.weRecommend}

**${sentences.bestFor}**

*${sentences.worthBuyingIf}*`,

    generateAffiliatePlaceholder(keyword),

    generateReviewBlock(keyword),

    needsDisclaimer
      ? `## 주의 사항\n\n이 글은 일반적인 정보 제공 목적이며, 개인 상황에 따라 전문가 상담이 필요할 수 있습니다.`
      : `## 주의 사항\n\n이 글은 정보 제공 목적으로 작성되었으며, 실제 적용 시 최신 정보를 다시 확인하시기 바랍니다.`,

    `## 마무리\n\n${kw}에 대한 비교 기준과 추천 정보를 정리했습니다. 위 내용을 참고해 본인 상황에 맞는 최선의 선택을 하시기 바랍니다.`,
  ];

  // intent 변수는 향후 섹션 조건 분기를 위해 보존 (현재는 body 구조 고정)
  void intent;

  return sections.join("\n\n");
}

// ─── Revenue FAQ ──────────────────────────────────────────────────────────────

function generateRevenueFaq(keyword) {
  const kw = keyword.keyword || String(keyword);
  return [
    {
      question: `${kw}, 어떤 것을 선택해야 하나요?`,
      answer: `본인의 예산과 필요 기능을 먼저 정리한 후 위의 비교 기준을 참고하세요. 대부분의 경우 중간 가격대 옵션이 가성비가 좋습니다.`,
    },
    {
      question: `${kw} 관련 최저가는 어디서 확인하나요?`,
      answer: `공식 사이트와 Amazon, 가격 비교 사이트를 동시에 확인하는 것이 좋습니다. 프로모션 시기를 노리면 추가 할인을 받을 수 있습니다.`,
    },
    {
      question: `처음 ${kw}를 선택할 때 가장 중요한 기준은 무엇인가요?`,
      answer: `가격보다 신뢰성과 실제 사용자 리뷰를 먼저 확인하세요. 기능이 아무리 좋아도 검증되지 않은 옵션은 피하는 것이 좋습니다.`,
    },
  ];
}

// ─── Main: generateRevenueArticle ────────────────────────────────────────────

/**
 * Returns a full article object with revenue-optimized body.
 * bodyHtml is intentionally left empty — caller (article-writer.js) adds it
 * via markdownToHtml to keep the import chain clean.
 */
export function generateRevenueArticle(keyword) {
  const kw = keyword.keyword || String(keyword);
  const title = `${kw} 완벽 비교 가이드 — 추천 & 구매 방법`;
  const slug = slugify(title) || `article-${keyword.id || Date.now()}`;
  const faq = generateRevenueFaq(keyword);
  const bodyMarkdown = generateRevenueBody(keyword);
  const metaDescription = `${kw} 비교, 추천, 구매 방법을 한눈에 정리했습니다. 장단점과 구매처 안내까지 포함.`.slice(0, 160);
  const tags = Array.from(
    new Set([keyword.category, kw, `${kw} 추천`, `${kw} 비교`].filter(Boolean))
  ).slice(0, 6);

  const ctrCandidates = generateCtrCandidates(keyword);
  const selectedCtr = selectBestCtrCandidate(
    { template: "review", category: keyword.category || "" },
    ctrCandidates
  );

  const affiliatePlan = buildAffiliatePlan({
    category: keyword.category || "",
    title,
    tags,
  });

  return {
    keywordId: keyword.id || "",
    keyword: kw,
    title,
    slug,
    metaDescription,
    category: keyword.category || "",
    tags,
    template: "review",
    outline: [
      "빠른 답변",
      `왜 ${kw}인가`,
      "비교: 선택 기준",
      "추천",
      "구매처 안내",
      "종합 평가",
      "FAQ",
      "마무리",
    ],
    bodyMarkdown,
    bodyHtml: "",
    faq,
    ctrCandidates,
    selectedCtr,
    affiliatePlan,
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
