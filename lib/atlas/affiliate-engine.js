// Affiliate Engine — generates structured product slot plans for monetization
// No external APIs, no real links. Placeholder-only output.

const INTENT_PATTERNS = [
  { pattern: /k.?beauty|스킨케어|skincare|뷰티|beauty|세럼|클렌저|선크림/i, intent: "k-beauty" },
  { pattern: /k.?food|한식|라면|김치|snack|스낵|음식|고추장|된장/i, intent: "k-food" },
  { pattern: /\bai\b|artificial intelligence|chatgpt|llm|인공지능|챗gpt/i, intent: "ai" },
  { pattern: /travel|여행|hotel|항공|flight|숙박|esim|이심/i, intent: "travel" },
  { pattern: /보험|finance|money|금융|investment|투자|신용카드|은행|대출/i, intent: "money" },
];

const CTA_TEXT = {
  "k-beauty": "아래 제품은 Amazon에서 바로 구매하실 수 있습니다.",
  "k-food": "아래 한국 식품은 Amazon에서 구매 가능합니다.",
  "ai": "아래 AI 도구의 최신 요금제를 확인하세요.",
  "travel": "아래 서비스로 여행 준비를 시작하세요.",
  "money": "아래 서비스로 더 나은 금융 선택을 하세요.",
  "general": "아래 추천 항목을 확인해보세요.",
};

const SLOT_TEMPLATES = {
  "k-beauty": [
    { label: "선크림 추천", productType: "sunscreen", reason: "K-뷰티 루틴 마지막 단계 — UV 차단 필수", priority: 1 },
    { label: "세럼 추천", productType: "serum", reason: "수분·미백·안티에이징 핵심 단계", priority: 2 },
    { label: "클렌저 추천", productType: "cleanser", reason: "올바른 이중 세안의 시작", priority: 3 },
  ],
  "k-food": [
    { label: "라면 추천", productType: "ramen", reason: "해외에서 구하기 어려운 한국 라면 베스트", priority: 1 },
    { label: "스낵 추천", productType: "snack", reason: "K-스낵 해외 팬덤 급성장 품목", priority: 2 },
    { label: "소스·양념 추천", productType: "sauce", reason: "한식 조리의 필수 양념", priority: 3 },
  ],
  "ai": [
    { label: "AI 도구 추천", productType: "ai-tool", reason: "생산성을 높여주는 검증된 AI 솔루션", priority: 1 },
    { label: "AI 구독 서비스", productType: "subscription", reason: "월정액으로 사용하는 AI 서비스", priority: 2 },
    { label: "자동화 소프트웨어", productType: "software", reason: "반복 업무를 줄여주는 도구", priority: 3 },
  ],
  "travel": [
    { label: "숙소 예약", productType: "hotel", reason: "최저가 호텔·에어비앤비 예약", priority: 1 },
    { label: "eSIM 추천", productType: "esim", reason: "해외 로밍 대신 저렴한 현지 데이터", priority: 2 },
    { label: "여행 카드 추천", productType: "travel-card", reason: "해외 결제 수수료 제로 카드", priority: 3 },
  ],
  "money": [
    { label: "금융 상품 비교", productType: "comparison-offer", reason: "여러 상품을 한 번에 비교", priority: 1 },
    { label: "계산기 도구", productType: "calculator", reason: "보험료·수익률 등 직접 계산", priority: 2 },
    { label: "전문 가이드", productType: "guide", reason: "전문가가 만든 금융 결정 가이드", priority: 3 },
  ],
  "general": [
    { label: "추천 상품 1", productType: "product-a", reason: "이 주제와 관련된 베스트셀러", priority: 1 },
    { label: "추천 상품 2", productType: "product-b", reason: "가성비 좋은 대안 상품", priority: 2 },
    { label: "추천 상품 3", productType: "product-c", reason: "전문가 추천 프리미엄 옵션", priority: 3 },
  ],
};

export function detectProductIntent(article) {
  const searchText = [
    article.category || "",
    article.title || "",
    ...(article.tags || []),
  ].join(" ");

  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(searchText)) return intent;
  }
  return "general";
}

export function generateProductSlots(article, intent) {
  const resolvedIntent = intent || detectProductIntent(article);
  const templates = SLOT_TEMPLATES[resolvedIntent] || SLOT_TEMPLATES.general;
  return templates.map((slot) => ({
    ...slot,
    linkPlaceholder: `<!-- AFFILIATE_LINK: ${slot.productType} -->`,
  }));
}

export function buildAffiliatePlan(article) {
  const intent = detectProductIntent(article);
  const productSlots = generateProductSlots(article, intent);
  return {
    intent,
    productSlots,
    disclosure:
      "이 글의 일부 링크는 제휴 링크입니다. 구매 시 소정의 수수료가 발생할 수 있으며, 이는 독자의 구매 비용에 영향을 주지 않습니다.",
    ctaText: CTA_TEXT[intent] || CTA_TEXT.general,
  };
}
