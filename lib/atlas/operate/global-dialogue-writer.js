// 해외 Blogger(미지) 문답형 정보글 작성기.
//
// topic-catalog.js의 검증된 주제 자료를 lib/atlas/article-factory.js가 받는
// MASTER 패키지 형태로 조립한다. 본문은 미지↔수호 문답이며, Quick Answer / TOC /
// FAQ / Sources는 lib/atlas/revenue-design-engine.js가 article 필드에서 렌더하므로
// 본문 안에 같은 섹션을 다시 쓰지 않는다(중복 섹션 차단 규칙 global_no_duplicate_sections).
//
// 이미지는 정확히 5장이며 전부 미지다. 채널 정책상 해외 이미지의 alt/prompt에는
// 다른 채널의 진행자(수호)를 절대 쓰지 않는다 — 문답 본문에만 등장한다.

export const GLOBAL_VISUAL_COUNT = 5;

const MIJI_SCENE = "ATLAS Miji master portrait composed on a clean editorial card. Presenter image, not a product photo. No text, logo or watermark.";

// 문답 한 턴을 마크다운 문단으로. markdownToHtml이 **강조**와 문단을 처리한다.
function turnLine([speaker, line]) {
  return `**${speaker}:** ${line}`;
}

export function globalDialogueMarkdown(topic) {
  const blocks = [];
  for (const section of topic.dialogue) {
    blocks.push(`## ${section.heading}`);
    for (const turn of section.turns) blocks.push(turnLine(turn));
  }
  return blocks.join("\n\n");
}

// 5장의 배치: 첫 섹션 앞(afterByline) 1장, 본문 섹션 3장(afterSection:<H2>), FAQ 뒤 1장.
// placement가 가리키는 H2가 본문에 실제로 존재해야 그림이 삽입되므로 dialogue 헤딩에서 가져온다.
export function globalVisualAssets(topic) {
  const headings = topic.dialogue.map((s) => s.heading);
  const plan = [
    { key: "featured", role: "featured", placement: "afterByline", alt: `Miji introducing ${topic.keyword} for travellers`, caption: headings[0] },
    { key: "context", role: "context", placement: `afterSection:${headings[1]}`, alt: `Miji explaining ${headings[1].toLowerCase()}`, caption: headings[1] },
    { key: "comparison", role: "comparison", placement: `afterSection:${headings[2]}`, alt: `Miji walking through ${headings[2].toLowerCase()}`, caption: headings[2] },
    { key: "checklist", role: "checklist", placement: `afterSection:${headings[3]}`, alt: `Miji summarising ${headings[3].toLowerCase()}`, caption: headings[3] },
    { key: "closing", role: "closing", placement: "afterFaq", alt: `Miji closing the ${topic.keyword} guide`, caption: headings[4] || headings[headings.length - 1] },
  ];
  return plan.map((asset) => ({
    key: asset.key,
    role: asset.role,
    placement: asset.placement,
    alt: asset.alt,
    prompt: MIJI_SCENE,
    width: 1600,
    height: 900,
    fit: "cover",
    required: true,
    characterRequired: true,
    localSrc: `/images/articles/${topic.slug}/${asset.key}.png`,
    publicUrl: "",
    // 로컬 카드 렌더러가 읽는 문구. 미지 마스터와 함께 합성된다.
    card: {
      kicker: "ATLAS TRAVEL GUIDE",
      title: asset.caption,
      lines: cardLinesFor(topic, asset.key),
      footer: topic.keyword.toUpperCase(),
    },
  }));
}

function cardLinesFor(topic, key) {
  if (key === "featured") return [topic.quickAnswer];
  if (key === "closing") return topic.keyTakeaways.slice(0, 3);
  const index = { context: 1, comparison: 2, checklist: 3 }[key];
  const section = topic.dialogue[index];
  // 카드 본문은 해당 섹션에서 미지가 답한 첫 문장만 쓴다 — 새 문장을 지어내지 않는다.
  return section.turns.filter(([speaker]) => speaker === "Miji").slice(0, 2).map(([, line]) => line);
}

export function buildGlobalMasterPackage(topic) {
  return {
    keyword: topic.keyword,
    title: topic.title,
    hookTitle: topic.title,
    slug: topic.slug,
    searchIntent: topic.searchIntent,
    metaDescription: topic.metaDescription,
    excerpt: topic.quickAnswer,
    category: topic.category,
    tags: topic.keyword.split(/\s+/).filter(Boolean),
    template: "revenue-guide",
    outline: topic.dialogue.map((s) => s.heading),
    quickAnswer: topic.quickAnswer,
    comparisonCriteria: topic.comparisonCriteria,
    comparisonHeaders: topic.comparisonHeaders,
    comparisonTable: topic.comparisonTable,
    keyTakeaways: topic.keyTakeaways,
    sources: topic.sources,
    trust: topic.trust,
    relatedArticles: [],
    heroImage: null,
    visualAssets: globalVisualAssets(topic),
    bodyMarkdown: globalDialogueMarkdown(topic),
    faq: topic.faq,
    koreanReview: topic.koreanReview,
    qualityChecklist: [],
    affiliatePlan: null,
  };
}
