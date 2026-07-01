// CTR Engine — generates click-through-rate optimization candidates
// No selection logic here; caller decides which candidate to use.

const CURRENT_YEAR = new Date().getFullYear();

// ─── Headline Candidates (10) ─────────────────────────────────────────────────
//
// Headline Rules:
// 1. 정답을 먼저 말하지 않는다 — "완벽 정리", "총정리", "완전 정복" 금지.
//    독자가 읽기 전에 이미 답을 얻은 느낌을 주면 클릭하지 않는다.
// 2. 궁금증을 만든다 — 제목을 읽은 뒤 "그게 뭔데?"라는 질문이 생겨야 한다.
// 3. 숫자/시간/돈이 있으면 우선 활용한다 — "5가지", "3분", "30%" 등이
//    클릭률을 높인다. 키워드에 금액/기간이 내재되어 있으면 반드시 노출.
// 4. 제목 길이 70자 이하 — 검색 결과에서 잘리지 않는 길이.

export function generateHeadlineCandidates(keyword) {
  const kw = keyword.keyword || String(keyword);
  return [
    `${kw} — 잘 고르는 사람들이 먼저 확인하는 것`,           // 궁금증: 뭘 확인하지?
    `${kw} 선택 방법: 전문가가 알려주는 핵심 기준`,            // 전문가 권위 + 기준 미공개
    `${kw} vs 대안: 어떤 것이 당신에게 맞을까?`,              // 비교 + 질문
    `${kw}, 처음이라도 실수 없이 고르는 법`,                   // 문제(실수) + 해법 미공개
    `${kw}, 사기 전에 반드시 알아야 할 5가지`,                 // 숫자 5 + 위기감
    `${kw} 실사용 후기 — 장단점 솔직 정리`,                    // 신뢰(솔직) + 미공개 단점
    `${kw}에 쓰는 돈, 줄일 수 있는 방법이 있습니다`,           // 돈 + 방법 미공개
    `많은 사람들이 ${kw} 선택에서 하는 실수`,                   // 실수 + 궁금증
    `${kw}가 정말 가치 있을까? 직접 분석해봤습니다`,            // 의심 + 분석 예고
    `${kw} 추천 TOP 3 — 가성비 순으로 정리`,                   // 숫자 3 + 순위 미공개
  ];
}

// ─── Hook Candidates (10) ─────────────────────────────────────────────────────
//
// Hook Rules:
// 1. 첫 문장에서 설명하지 않는다 — 첫 문장은 배경 설명이 아니라 긴장을 만드는 문장이다.
//    "이 글에서는 X에 대해 알아보겠습니다" 같은 도입부는 즉시 이탈을 유발한다.
// 2. 질문이 생기도록 작성한다 — 독자가 "그래서 뭔데?", "어떻게?"라는 질문을
//    자연스럽게 갖도록 문장을 끝내야 한다. 마침표가 아니라 여운으로 끝낸다.
// 3. 정답은 첫 문장에서 공개하지 않는다 — "이 글 하나로 해결", "결론부터",
//    "더 이상 검색 안 해도 된다" 같은 표현은 첫 문장에서 금지.
//    독자가 계속 읽어야 답을 얻는 구조를 만들어야 한다.

export function generateHookCandidates(keyword) {
  const kw = keyword.keyword || String(keyword);
  return [
    `${kw}를 선택했다가 후회한 분들, 한 가지 공통점이 있습니다.`,            // 공통점 = 뭔데?
    `많은 사람들이 ${kw} 선택에서 같은 실수를 반복합니다. 그 이유를 먼저 알아야 합니다.`,  // 실수 = 어떤 실수?
    `${kw}를 아직도 직관으로 고르고 계신가요?`,                               // 질문 = 그게 왜 문제지?
    `전문가들은 ${kw}를 이렇게 고릅니다. 핵심 기준 3가지를 공개합니다.`,      // 기준 = 뭔지 궁금
    `${kw}에 돈을 낭비하기 전에 이 글을 먼저 읽으세요.`,                       // 돈 낭비 = 어떻게?
    `5분이면 ${kw}에 대한 모든 것을 파악할 수 있습니다.`,                      // 시간 + 약속
    `${kw} 중에 진짜 쓸 만한 것과 그렇지 않은 것, 구분하는 방법이 따로 있습니다.`,  // 방법 = 뭔데?
    `${kw}를 아직도 감으로 선택하고 계신가요? 데이터 기반으로 정리했습니다.`,  // 질문 + 전환
    `누군가는 ${kw}에서 손해를 봅니다. 왜 그런지 알면 더 잘 고를 수 있습니다.`,   // 왜? = 궁금
    `${kw}의 숨겨진 진실 — 광고가 말하지 않는 것들.`,                          // 숨겨진 = 강력한 호기심
  ];
}

// ─── Meta Description Candidates (5) ─────────────────────────────────────────

export function generateMetaDescriptionCandidates(keyword) {
  const kw = keyword.keyword || String(keyword);
  return [
    `${kw} 비교, 추천, 구매 방법을 한눈에 정리했습니다. 장단점과 구매처 안내까지 포함.`,
    `${kw} 고민 중이신가요? 전문가가 정리한 핵심 기준과 추천 TOP 3를 확인하세요.`,
    `${kw}를 선택하기 전 반드시 확인해야 할 5가지 기준. 후회 없는 선택을 도와드립니다.`,
    `${kw} 최신 비교 분석 — 가격, 기능, 신뢰도를 한 번에 비교했습니다.`,
    `${kw} 실구매자 후기와 전문가 분석을 합쳐 정리했습니다. 지금 바로 확인하세요.`,
  ].map((d) => d.slice(0, 160));
}

// ─── Thumbnail Concepts (3) ──────────────────────────────────────────────────

export function generateThumbnailConcepts(keyword) {
  const kw = keyword.keyword || String(keyword);
  return [
    {
      style: "text-overlay",
      concept: "텍스트 오버레이",
      description: `짙은 단색 배경(#1a1a2e)에 흰색 헤드라인. "${kw}"를 큰 글씨로 중앙 배치. 하단 소형 CTA 텍스트.`,
      bgColor: "#1a1a2e",
      textColor: "#ffffff",
    },
    {
      style: "split-comparison",
      concept: "비교 분할",
      description: `화면 좌/우 분할로 두 선택지 대비. 중앙에 VS 텍스트. 각 면에 옵션명 + 핵심 특징 1가지.`,
      bgColor: "#f0f7ff / #fff3cd",
      textColor: "#1a1a2e",
    },
    {
      style: "number-highlight",
      concept: "숫자 강조",
      description: `"TOP 3", "5가지" 등 숫자를 크게 강조. 간결한 부제목과 신뢰감 있는 레이아웃. 밝은 그레이 배경.`,
      bgColor: "#f9fafb",
      textColor: "#2563eb",
    },
  ];
}

// ─── Main: generateCtrCandidates ─────────────────────────────────────────────

export function generateCtrCandidates(keyword) {
  return {
    headlineCandidates: generateHeadlineCandidates(keyword),
    hookCandidates: generateHookCandidates(keyword),
    metaDescriptionCandidates: generateMetaDescriptionCandidates(keyword),
    thumbnailConcept: generateThumbnailConcepts(keyword),
  };
}

// ─── Selection Scoring ────────────────────────────────────────────────────────

function scoreHeadline(text) {
  const reasons = [];
  let score = 0;

  // 1. Curiosity gap: implies unknown, problem, or question
  if (/왜|어떻게|정말|직접|솔직|실수|숨겨진|진실|모르는|알아야|가치 있/.test(text)) {
    score += 20;
    reasons.push("curiosity gap ✓");
  } else {
    reasons.push("curiosity gap ✗");
  }

  // 2. Contains number / time / money signal — proven CTR lift
  if (/\d+|TOP\s*\d|분만|시간|원|만원|비용|절약|돈/.test(text)) {
    score += 20;
    reasons.push("숫자/시간/돈 ✓");
  } else {
    reasons.push("숫자/시간/돈 ✗");
  }

  // 3. Doesn't reveal the full answer upfront
  if (!/완벽 정리|총정리|완전 정복|다 알려/.test(text)) {
    score += 20;
    reasons.push("정답 미노출 ✓");
  } else {
    reasons.push("정답 노출 ✗");
  }

  // 4. No clickbait risk
  if (!/충격|경악|기절|대박|완전 무료|100%|절대/.test(text)) {
    score += 20;
    reasons.push("낚시 없음 ✓");
  } else {
    reasons.push("낚시 위험 ✗");
  }

  // 5. Length ≤ 70 chars
  if (text.length <= 70) {
    score += 20;
    reasons.push(`${text.length}자 이내 ✓`);
  } else {
    reasons.push(`${text.length}자 초과 ✗`);
  }

  return { score, reasons };
}

function scoreHook(text) {
  const reasons = [];
  let score = 0;

  // 1. Problem / tension opening — strongest engagement signal (30pts)
  if (/실수|낭비|전에|먼저|알아야|잘못/.test(text)) {
    score += 30;
    reasons.push("문제 제기 ✓");
  } else {
    reasons.push("문제 제기 ✗");
  }

  // 2. Urgency or promise (20pts)
  if (/5분|결론|이 글 하나|찾는 답|지금|숨겨진|데이터/.test(text)) {
    score += 20;
    reasons.push("긴급성/약속 ✓");
  } else {
    reasons.push("긴급성/약속 ✗");
  }

  // 3. Concise (25pts) — shorter hooks convert better as first sentence
  if (text.length <= 60) {
    score += 25;
    reasons.push(`${text.length}자 이내 ✓`);
  } else if (text.length <= 80) {
    score += 15;
    reasons.push(`${text.length}자 (적정)`);
  } else {
    reasons.push(`${text.length}자 초과 ✗`);
  }

  // 4. No overselling (25pts)
  if (!/최고|단독|특가|완전 무료|100%/.test(text)) {
    score += 25;
    reasons.push("과장 없음 ✓");
  } else {
    reasons.push("과장 있음 ✗");
  }

  return { score, reasons };
}

function scoreMeta(text) {
  const reasons = [];
  let score = 0;

  // 1. CTA verb
  if (/확인|알아보|정리|비교|추천|보세요/.test(text)) {
    score += 25;
    reasons.push("CTA 동사 ✓");
  } else {
    reasons.push("CTA 동사 ✗");
  }

  // 2. Benefit expression
  if (/한눈에|한 번에|빠르게|쉽게|바로|포함/.test(text)) {
    score += 25;
    reasons.push("편익 표현 ✓");
  } else {
    reasons.push("편익 표현 ✗");
  }

  // 3. Optimal length for Korean meta (40-100 chars)
  if (text.length >= 40 && text.length <= 100) {
    score += 25;
    reasons.push(`${text.length}자 (최적) ✓`);
  } else if (text.length < 40) {
    score += 10;
    reasons.push(`${text.length}자 (짧음)`);
  } else {
    reasons.push(`${text.length}자 초과 ✗`);
  }

  // 4. No clickbait
  if (!/충격|경악|100%|완전 무료/.test(text)) {
    score += 25;
    reasons.push("낚시 없음 ✓");
  } else {
    reasons.push("낚시 있음 ✗");
  }

  return { score, reasons };
}

function pickThumbnail(thumbnailConcepts, articleContext) {
  const { template } = articleContext || {};
  if (template === "comparison") {
    return thumbnailConcepts.find((t) => t.style === "split-comparison") || thumbnailConcepts[0];
  }
  if (template === "list" || template === "howto") {
    return thumbnailConcepts.find((t) => t.style === "number-highlight") || thumbnailConcepts[0];
  }
  return thumbnailConcepts[0];
}

// ─── selectBestCtrCandidate ───────────────────────────────────────────────────

/**
 * Scores all candidates and returns the best headline, hook, metaDescription,
 * and thumbnailConcept as a single selectedCtr object.
 *
 * @param {object} articleContext - { template, category } for thumbnail selection
 * @param {object} ctrCandidates - output of generateCtrCandidates()
 * @returns {{ headline, hook, metaDescription, thumbnailConcept, score, reasons }}
 */
export function selectBestCtrCandidate(articleContext, ctrCandidates) {
  const headlineScored = ctrCandidates.headlineCandidates
    .map((text) => ({ text, ...scoreHeadline(text) }))
    .sort((a, b) => b.score - a.score);

  const hookScored = ctrCandidates.hookCandidates
    .map((text) => ({ text, ...scoreHook(text) }))
    .sort((a, b) => b.score - a.score);

  const metaScored = ctrCandidates.metaDescriptionCandidates
    .map((text) => ({ text, ...scoreMeta(text) }))
    .sort((a, b) => b.score - a.score);

  const bestHeadline = headlineScored[0];
  const bestHook = hookScored[0];
  const bestMeta = metaScored[0];
  const thumbnailConcept = pickThumbnail(ctrCandidates.thumbnailConcept, articleContext);

  return {
    headline: bestHeadline.text,
    hook: bestHook.text,
    metaDescription: bestMeta.text,
    thumbnailConcept,
    score: Math.round((bestHeadline.score + bestHook.score + bestMeta.score) / 3),
    reasons: {
      headline: bestHeadline.reasons,
      hook: bestHook.reasons,
      meta: bestMeta.reasons,
    },
  };
}
