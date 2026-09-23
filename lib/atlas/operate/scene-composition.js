// 장면 합성 이미지의 구도 규칙 — 순수 모듈(fs·네트워크 없음)이라 게이트와 테스트가 같이 쓴다.
//
// 배경: 한때 모든 이미지를 같은 텍스트 카드 틀(키커 + 제목 + 칸 3~4개 + 푸터)로 찍어냈다.
// 그 결과 한 글 안의 이미지가 전부 같은 구도로 보였고, 이미지가 장면이 아니라 PPT 슬라이드가 됐다.
// 이제 이미지는 "실제 장면 사진 + 인물 패널"이며, 역할마다 구도가 달라야 한다.

export const PANEL_SIDE = Object.freeze({ LEFT: "left", RIGHT: "right" });
export const PANEL_SHAPE = Object.freeze({
  COLUMN: "full-height-column",
  CARD: "portrait-card",
  BADGE: "circle-badge",
  CUTIN: "corner-cutin",
});

// 이미지 안에 넣을 수 있는 글자 수 상한. 문장·표·체크리스트를 이미지에 넣지 않기 위한 선이다.
export const MAX_LABEL_CHARS = 34;

// 역할별 고정 구도. 순서를 바꾸거나 값을 복제하면 아래 assertCompositionVariety가 막는다.
const GLOBAL_COMPOSITIONS = Object.freeze({
  featured: { side: PANEL_SIDE.RIGHT, shape: PANEL_SHAPE.COLUMN, scale: 1.0, focus: "bust", gravity: "center" },
  context: { side: PANEL_SIDE.LEFT, shape: PANEL_SHAPE.CARD, scale: 0.62, focus: "bust", gravity: "south" },
  comparison: { side: PANEL_SIDE.RIGHT, shape: PANEL_SHAPE.BADGE, scale: 0.34, focus: "face", gravity: "north" },
  checklist: { side: PANEL_SIDE.LEFT, shape: PANEL_SHAPE.CUTIN, scale: 0.46, focus: "face", gravity: "center" },
  closing: { side: PANEL_SIDE.RIGHT, shape: PANEL_SHAPE.CARD, scale: 0.78, focus: "bust", gravity: "north" },
});

const KOREA_COMPOSITIONS = Object.freeze({
  info_why: { side: PANEL_SIDE.RIGHT, shape: PANEL_SHAPE.CARD, scale: 0.68, focus: "bust", gravity: "center" },
  info_how: { side: PANEL_SIDE.LEFT, shape: PANEL_SHAPE.BADGE, scale: 0.36, focus: "face", gravity: "south" },
  info_checklist: { side: PANEL_SIDE.RIGHT, shape: PANEL_SHAPE.CUTIN, scale: 0.48, focus: "face", gravity: "north" },
  product_photo: { side: PANEL_SIDE.LEFT, shape: PANEL_SHAPE.BADGE, scale: 0.3, focus: "face", gravity: "center" },
});

export function compositionFor(channel, role) {
  const table = channel === "korea" ? KOREA_COMPOSITIONS : GLOBAL_COMPOSITIONS;
  return table[role] || null;
}

function fingerprint(composition) {
  return `${composition.side}|${composition.shape}|${composition.scale}|${composition.gravity}`;
}

// 한 글 안의 이미지들이 서로 다른 구도인지. 같은 지문이 둘 이상이면 "같은 구도 반복"이다.
export function compositionVarietyIssues(items = []) {
  const issues = [];
  const seen = new Map();
  for (const item of items) {
    const composition = item?.composition;
    if (!composition) {
      issues.push(`${item?.key || item?.id || "image"}: 구도가 지정되지 않았습니다.`);
      continue;
    }
    const print = fingerprint(composition);
    if (seen.has(print)) issues.push(`${item.key || item.id}: ${seen.get(print)}와 같은 구도입니다 (${print}).`);
    else seen.set(print, item.key || item.id);
  }
  return issues;
}

// 배경 장면이 서로 다른지. 같은 사진을 두 번 쓰면 "같은 장면 재탕"이다.
export function sceneVarietyIssues(items = []) {
  const issues = [];
  const seen = new Map();
  for (const item of items) {
    const source = String(item?.scene?.file || "").trim();
    if (!source) {
      issues.push(`${item?.key || item?.id || "image"}: 장면 사진이 없습니다(텍스트 카드 금지).`);
      continue;
    }
    if (seen.has(source)) issues.push(`${item.key || item.id}: ${seen.get(source)}와 같은 장면 사진입니다.`);
    else seen.set(source, item.key || item.id);
  }
  return issues;
}

// 이미지에 들어가는 글자가 짧은 라벨 하나로 제한되는지. 문장·목록·표는 본문이 할 일이다.
export function labelIssues(items = []) {
  const issues = [];
  for (const item of items) {
    const label = String(item?.scene?.label || "");
    if (label.length > MAX_LABEL_CHARS) {
      issues.push(`${item.key || item.id}: 이미지 라벨이 ${label.length}자입니다(최대 ${MAX_LABEL_CHARS}자).`);
    }
    if (/\n/.test(label)) issues.push(`${item.key || item.id}: 이미지 라벨은 한 줄이어야 합니다.`);
    // 카드형의 흔적: 칸 배열이 남아 있으면 다시 PPT 이미지가 된다.
    if (Array.isArray(item?.card?.columns) && item.card.columns.length) {
      issues.push(`${item.key || item.id}: 카드형 칸(card.columns)이 남아 있습니다.`);
    }
  }
  return issues;
}

export function sceneImageIssues(items = []) {
  return [...sceneVarietyIssues(items), ...compositionVarietyIssues(items), ...labelIssues(items)];
}
