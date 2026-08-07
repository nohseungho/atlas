// ─── Photo Card · 디자인 프리셋 ────────────────────────────────────────────
// 같은 렌더링 엔진을 쓰지만 구조(이미지 위치·텍스트 존·정렬)가 실제로 다르다.
// 색상만 다른 동일 레이아웃이 되지 않도록 structure/zone 값을 프리셋마다 다르게 둔다.

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

// 텍스트가 절대 넘어가면 안 되는 여백(안전영역)
export const SAFE_MARGIN = 84;

export const PRESETS = [
  {
    id: "clean",
    label: "Clean",
    description: "이미지 상단 · 하단 흰 패널에 좌측 정렬 텍스트 (미니멀 상품 카탈로그형)",
    structure: "image-top-panel-bottom",
    align: "left",
    palette: {
      canvas: "#eef0f2",
      panel: "#ffffff",
      ink: "#14161a",
      muted: "#5b6470",
      accent: "#0f766e",
      accentInk: "#ffffff",
      line: "#d8dde3",
    },
    imageBox: { x: 0, y: 0, w: CARD_WIDTH, h: 1150 },
    panelBox: { x: 0, y: 1070, w: CARD_WIDTH, h: 850 },
    textBox: { x: SAFE_MARGIN, y: 1190, w: CARD_WIDTH - SAFE_MARGIN * 2, h: 620 },
    badgePosition: "above-text",
    defaultFit: "contain",
  },
  {
    id: "deal",
    label: "Deal",
    description: "상단 특가 밴드 + 중앙 정사각 프레임 이미지 + 하단 다크 가격 블록 (고대비 세일형)",
    structure: "band-top-image-mid-dark-bottom",
    align: "center",
    palette: {
      canvas: "#0b0c0e",
      panel: "#16181d",
      ink: "#ffffff",
      muted: "#b3bac4",
      accent: "#facc15",
      accentInk: "#101215",
      line: "#2a2e36",
    },
    topBandBox: { x: 0, y: 0, w: CARD_WIDTH, h: 430 },
    imageBox: { x: 90, y: 470, w: 900, h: 820 },
    bottomBox: { x: 0, y: 1330, w: CARD_WIDTH, h: 590 },
    textBox: { x: SAFE_MARGIN, y: 1390, w: CARD_WIDTH - SAFE_MARGIN * 2, h: 460 },
    badgePosition: "top-band",
    defaultFit: "contain",
  },
  {
    id: "lifestyle",
    label: "Lifestyle",
    description: "이미지 전면 + 하단 그라디언트 위 큰 문구 · 좌측 세로 악센트 (감성 피드형)",
    structure: "full-bleed-overlay",
    align: "left",
    palette: {
      canvas: "#0f1113",
      panel: "rgba(0,0,0,0)",
      ink: "#ffffff",
      muted: "#e2d9cf",
      accent: "#e8b06a",
      accentInk: "#1a1206",
      line: "rgba(255,255,255,0.28)",
    },
    imageBox: { x: 0, y: 0, w: CARD_WIDTH, h: CARD_HEIGHT },
    scrim: { from: 780, to: CARD_HEIGHT, alpha: 0.92 },
    textBox: { x: SAFE_MARGIN + 34, y: 1010, w: CARD_WIDTH - SAFE_MARGIN * 2 - 34, h: 800 },
    badgePosition: "inline-top",
    defaultFit: "cover",
  },
];

export const PRESET_IDS = PRESETS.map((p) => p.id);

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}

/** 카드 종류별 강조 배율. 가격/표지는 헤드라인을 더 크게 잡는다. */
export const KIND_EMPHASIS = {
  cover: { headlineMax: 96, headlineLines: 3 },
  problem: { headlineMax: 68, headlineLines: 3 },
  features: { headlineMax: 68, headlineLines: 2 },
  price: { headlineMax: 92, headlineLines: 2 },
  audience: { headlineMax: 72, headlineLines: 3 },
  cta: { headlineMax: 78, headlineLines: 2 },
};

export const FONT_STACK =
  '"Pretendard", "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
