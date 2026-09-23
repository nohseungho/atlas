// 해외 Blogger(미지) 문답형 정보글 작성기.
//
// topic-catalog.js의 검증된 주제 자료를 lib/atlas/article-factory.js가 받는
// MASTER 패키지 형태로 조립한다. 본문은 미지↔수호 문답이며, Quick Answer / TOC /
// FAQ / Sources는 lib/atlas/revenue-design-engine.js가 article 필드에서 렌더하므로
// 본문 안에 같은 섹션을 다시 쓰지 않는다(중복 섹션 차단 규칙 global_no_duplicate_sections).
//
// 이미지는 정확히 5장이며 전부 미지다. 채널 정책상 해외 이미지의 alt/prompt에는
// 다른 채널의 진행자(수호)를 절대 쓰지 않는다 — 문답 본문에만 등장한다.

import { ATLAS_CHARACTERS } from "../character-channel-policy.js";
import { directionFor, scenePrompt } from "./scene-direction.js";

export const GLOBAL_VISUAL_COUNT = 5;

const MIJI_STYLE = "natural editorial travel photography, realistic, soft natural light";

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
    { key: "featured", role: "featured", placement: "afterByline", alt: `Miji introducing ${topic.keyword} for travellers`, intent: topic.sceneIntents?.featured },
    { key: "context", role: "context", placement: `afterSection:${headings[1]}`, alt: `Miji in the setting described by "${headings[1]}"`, intent: topic.sceneIntents?.context },
    { key: "comparison", role: "comparison", placement: `afterSection:${headings[2]}`, alt: `Miji working through "${headings[2]}"`, intent: topic.sceneIntents?.comparison },
    { key: "checklist", role: "checklist", placement: `afterSection:${headings[3]}`, alt: `Miji going through the checks in "${headings[3]}"`, intent: topic.sceneIntents?.checklist },
    { key: "closing", role: "closing", placement: "afterFaq", alt: `Miji closing the ${topic.keyword} guide`, intent: topic.sceneIntents?.closing },
  ];
  return plan.map((asset) => ({
    key: asset.key,
    role: asset.role,
    placement: asset.placement,
    alt: asset.alt,
    prompt: scenePrompt({
      identityPrompt: ATLAS_CHARACTERS.miji.identityPrompt,
      sceneIntent: asset.intent,
      direction: directionFor("global", asset.role),
      style: MIJI_STYLE,
    }),
    direction: directionFor("global", asset.role),
    width: 1600,
    height: 900,
    fit: "cover",
    required: true,
    characterRequired: true,
    localSrc: `/images/articles/${topic.slug}/${asset.key}.png`,
    publicUrl: "",
    // 실제 장면 아트가 들어오기 전에는 localSrc 파일이 없고 이미지 단계는 미완료로 남는다.
  }));
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
