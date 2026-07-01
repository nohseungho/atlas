// Product Discovery Engine — finds user problems first, then recommends products.
// Problem → User → Intent → Stage → Products (never product-first).

import { detectSearchIntent } from "./template-engine.js";

// ─── Category Detection ───────────────────────────────────────────────────────

const CATEGORY_PATTERNS = [
  { pattern: /k.?beauty|스킨케어|skincare|뷰티|beauty/i, category: "k-beauty" },
  { pattern: /k.?food|한식|라면|snack|스낵|음식/i,       category: "k-food" },
  { pattern: /\bai\b|artificial|인공지능|chatgpt|llm/i,  category: "ai" },
  { pattern: /travel|여행|hotel|항공|flight/i,           category: "travel" },
  { pattern: /보험|finance|money|금융|investment|투자/i,  category: "money" },
];

function detectCategory(article) {
  const directMatch = (article.category || "").toLowerCase();
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(directMatch)) return category;
  }
  const broadText = [article.title || "", ...(article.tags || [])].join(" ");
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(broadText)) return category;
  }
  return "general";
}

// ─── Problem Detection ────────────────────────────────────────────────────────

const PROBLEM_PATTERNS = {
  "k-beauty": [
    { pattern: /여드름|acne|트러블|pore|모공/i,               problem: "acne" },
    { pattern: /건성|dry.?skin|수분|moistur/i,                problem: "dry-skin" },
    { pattern: /민감|sensitive|자극|redness/i,                problem: "sensitive-skin" },
    { pattern: /노화|anti.?ag|주름|wrinkle|미백|brightening/i, problem: "anti-aging" },
  ],
  "k-food": [
    { pattern: /간편|easy|빠른|ramen|라면|즉석/i,  problem: "easy-meal" },
    { pattern: /건강|healthy|snack|과자|저칼로리/i, problem: "healthy-snack" },
    { pattern: /선물|gift/i,                       problem: "gift" },
  ],
  "travel": [
    { pattern: /esim|이심|데이터|roaming/i,          problem: "esim" },
    { pattern: /짐|luggage|suitcase|캐리어|packing/i, problem: "luggage" },
    { pattern: /숙소|hotel|숙박|accommodation/i,      problem: "hotel" },
  ],
  "ai": [
    { pattern: /글|writing|콘텐츠|content|copy|블로그/i, problem: "writing" },
    { pattern: /이미지|image|사진|photo|그림/i,          problem: "image" },
    { pattern: /영상|video|유튜브|youtube|릴스/i,        problem: "video" },
    { pattern: /생산성|productivity|업무|work|자동화/i,   problem: "productivity" },
  ],
  "money": [
    { pattern: /절약|save|저축|savings|아끼/i,  problem: "save-money" },
    { pattern: /비교|compare|comparison/i,       problem: "comparison" },
    { pattern: /초보|beginner|입문|처음|시작/i, problem: "beginner" },
  ],
};

const DEFAULT_PROBLEM = {
  "k-beauty": "acne",
  "k-food":   "easy-meal",
  "travel":   "hotel",
  "ai":       "productivity",
  "money":    "comparison",
};

function detectProblem(article, category) {
  const patterns = PROBLEM_PATTERNS[category];
  if (!patterns) return "general";
  const searchText = [
    article.category || "",
    article.title || "",
    ...(article.tags || []),
  ].join(" ");
  for (const { pattern, problem } of patterns) {
    if (pattern.test(searchText)) return problem;
  }
  return DEFAULT_PROBLEM[category] || patterns[0].problem;
}

// ─── Target Users ─────────────────────────────────────────────────────────────

const TARGET_USERS = {
  "acne":           "트러블성 피부를 가진 10-30대",
  "dry-skin":       "건성·복합성 피부 관리가 필요한 성인",
  "sensitive-skin": "피부 자극에 민감한 민감성 피부 타입",
  "anti-aging":     "노화 관리를 시작하는 30-50대",
  "easy-meal":      "빠르고 간편한 한식을 원하는 바쁜 현대인",
  "healthy-snack":  "건강을 챙기면서 간식을 즐기려는 사람",
  "gift":           "한국 제품으로 선물하고 싶은 사람",
  "esim":           "해외여행 데이터 요금이 걱정인 여행자",
  "luggage":        "짐 싸기와 이동 편의를 개선하려는 여행자",
  "hotel":          "숙박 예약을 효율적으로 하고 싶은 여행자",
  "writing":        "콘텐츠 생산 속도를 높이려는 크리에이터·마케터",
  "image":          "이미지 제작에 시간을 절약하려는 크리에이터",
  "video":          "영상 편집 효율을 높이려는 유튜버·마케터",
  "productivity":   "반복 업무를 자동화하고 싶은 직장인",
  "save-money":     "지출을 줄이고 저축을 늘리려는 사람",
  "comparison":     "금융 상품을 직접 비교해 선택하려는 사람",
  "beginner":       "금융 투자를 처음 시작하는 초보자",
  "general":        "일반 독자",
};

// ─── Search Intent Descriptions ───────────────────────────────────────────────

const SEARCH_INTENT_DESCRIPTIONS = {
  "acne":           "여드름 피부에 맞는 클렌저·토너·스팟 케어 제품 탐색",
  "dry-skin":       "건성 피부 수분 충전을 위한 에센스·크림 탐색",
  "sensitive-skin": "자극 없는 민감 피부 케어 루틴 제품 탐색",
  "anti-aging":     "주름 개선·미백 효과가 있는 안티에이징 제품 탐색",
  "easy-meal":      "5분 이내 완성되는 간편 한식 제품 탐색",
  "healthy-snack":  "칼로리 낮고 건강한 한국 간식 탐색",
  "gift":           "한국 제품으로 특별한 선물 아이디어 탐색",
  "esim":           "해외여행 데이터 요금 절감을 위한 eSIM 탐색",
  "luggage":        "여행 짐 효율화를 위한 캐리어·패킹 용품 탐색",
  "hotel":          "최저가 숙소 예약 플랫폼 및 혜택 탐색",
  "writing":        "콘텐츠 작성 자동화를 위한 AI 도구 탐색",
  "image":          "이미지 생성·편집 AI 도구 탐색",
  "video":          "영상 편집 자동화 AI 도구 탐색",
  "productivity":   "반복 업무 자동화를 위한 AI 생산성 도구 탐색",
  "save-money":     "지출 절약·저축 극대화 금융 도구 탐색",
  "comparison":     "금융 상품 비교를 위한 서비스 탐색",
  "beginner":       "투자 입문자를 위한 저위험 상품 탐색",
  "general":        "관련 상품 탐색",
};

// ─── Buying Stage ─────────────────────────────────────────────────────────────

const BUYING_STAGE_MAP = {
  informational: "awareness",
  commercial:    "consideration",
  transactional: "decision",
  comparison:    "decision",
};

// ─── Recommended Products per Problem ────────────────────────────────────────

const PROBLEM_PRODUCTS = {
  "acne": [
    { productType: "foam-cleanser",   reason: "모공 막힌 피지를 제거하는 첫 단계",           priority: 1 },
    { productType: "toner-pads",      reason: "각질 제거 + 살균 성분으로 트러블 예방",        priority: 2 },
    { productType: "spot-treatment",  reason: "집중 진정으로 빠른 개선",                      priority: 3 },
  ],
  "dry-skin": [
    { productType: "essence",         reason: "보습 성분을 피부 깊이 전달",                   priority: 1 },
    { productType: "moisturizer",     reason: "수분 장벽 형성으로 하루 종일 촉촉함 유지",     priority: 2 },
    { productType: "sheet-mask",      reason: "집중 수분 충전 주 2회 루틴",                   priority: 3 },
  ],
  "sensitive-skin": [
    { productType: "gentle-cleanser", reason: "자극 없이 세안하는 약산성 클렌저",             priority: 1 },
    { productType: "soothing-toner",  reason: "시카·판테놀 성분으로 붉기 완화",               priority: 2 },
    { productType: "mineral-sunscreen", reason: "화학 필터 없는 민감 피부용 자외선 차단",     priority: 3 },
  ],
  "anti-aging": [
    { productType: "retinol-serum",   reason: "검증된 주름 개선 성분",                        priority: 1 },
    { productType: "eye-cream",       reason: "눈가 잔주름 집중 케어",                         priority: 2 },
    { productType: "spf50-sunscreen", reason: "광노화 방지 — 안티에이징의 가장 중요한 단계", priority: 3 },
  ],
  "easy-meal": [
    { productType: "instant-ramen",   reason: "5분 이내 조리 가능한 한국 라면",               priority: 1 },
    { productType: "rice-bowl-kit",   reason: "전자레인지 3분 완성 덮밥 세트",               priority: 2 },
    { productType: "cooking-sauce",   reason: "소스 하나로 집밥 완성",                        priority: 3 },
  ],
  "healthy-snack": [
    { productType: "seaweed-snack",   reason: "칼로리 낮고 포만감 높은 김 과자",             priority: 1 },
    { productType: "rice-cracker",    reason: "글루텐 프리 쌀 과자",                          priority: 2 },
    { productType: "roasted-nuts",    reason: "단백질·불포화지방산 풍부한 견과류",            priority: 3 },
  ],
  "gift": [
    { productType: "beauty-sampler",  reason: "K-뷰티 인기 제품 소용량 세트",                priority: 1 },
    { productType: "snack-box",       reason: "다양한 한국 과자 선물 박스",                   priority: 2 },
    { productType: "sauce-gift-set",  reason: "고급 한식 소스 선물 세트",                    priority: 3 },
  ],
  "esim": [
    { productType: "travel-esim",         reason: "도착 전 개통, 현지 데이터 즉시 사용",     priority: 1 },
    { productType: "multi-country-esim",  reason: "여러 나라 여행 시 하나의 eSIM으로 해결", priority: 2 },
    { productType: "travel-wifi-egg",     reason: "eSIM 미지원 기기용 대안",                 priority: 3 },
  ],
  "luggage": [
    { productType: "carry-on-suitcase",  reason: "기내 반입 가능한 경량 캐리어",            priority: 1 },
    { productType: "packing-cubes",      reason: "짐 정리 효율 극대화",                      priority: 2 },
    { productType: "travel-pillow",      reason: "장거리 비행 목 통증 예방",                 priority: 3 },
  ],
  "hotel": [
    { productType: "hotel-booking",      reason: "최저가 보장 호텔 예약 플랫폼",            priority: 1 },
    { productType: "travel-insurance",   reason: "예약 취소·의료비 보장",                    priority: 2 },
    { productType: "loyalty-card",       reason: "숙박 포인트 적립 카드",                    priority: 3 },
  ],
  "writing": [
    { productType: "ai-writing-tool",    reason: "초안 작성 속도 10배 향상",                 priority: 1 },
    { productType: "grammar-checker",    reason: "영문 교정 및 스타일 개선",                  priority: 2 },
    { productType: "content-planner",    reason: "콘텐츠 캘린더 자동화",                     priority: 3 },
  ],
  "image": [
    { productType: "ai-image-gen",       reason: "텍스트 한 줄로 이미지 생성",               priority: 1 },
    { productType: "ai-photo-editor",    reason: "배경 제거·보정 자동화",                    priority: 2 },
    { productType: "stock-image-sub",    reason: "로열티 프리 이미지 무제한 사용",            priority: 3 },
  ],
  "video": [
    { productType: "ai-video-editor",    reason: "자막·컷편집 자동화",                       priority: 1 },
    { productType: "screen-recorder",    reason: "고화질 화면 녹화 및 편집",                  priority: 2 },
    { productType: "teleprompter-app",   reason: "촬영 중 대본 표시",                         priority: 3 },
  ],
  "productivity": [
    { productType: "ai-assistant",       reason: "반복 업무 자동화 + 일정 관리",             priority: 1 },
    { productType: "task-manager",       reason: "프로젝트 진행 현황 한눈에 파악",           priority: 2 },
    { productType: "note-taking-app",    reason: "AI 요약 기능이 있는 노트 앱",              priority: 3 },
  ],
  "save-money": [
    { productType: "budgeting-app",      reason: "지출 패턴 분석으로 절약 습관 형성",        priority: 1 },
    { productType: "cashback-card",      reason: "모든 결제에서 캐시백 적립",                 priority: 2 },
    { productType: "high-yield-savings", reason: "일반 저축보다 높은 이자율",                 priority: 3 },
  ],
  "comparison": [
    { productType: "comparison-site",    reason: "금융 상품 한 번에 비교",                   priority: 1 },
    { productType: "fee-calculator",     reason: "수수료·이자 직접 계산",                    priority: 2 },
    { productType: "review-aggregator",  reason: "실사용자 후기 모음",                        priority: 3 },
  ],
  "beginner": [
    { productType: "starter-guide",      reason: "초보자를 위한 단계별 금융 가이드",          priority: 1 },
    { productType: "robo-advisor",       reason: "자동 투자 — 초보자에게 최적",               priority: 2 },
    { productType: "low-risk-fund",      reason: "원금 손실 위험 낮은 입문 상품",             priority: 3 },
  ],
  "general": [
    { productType: "top-rated-product",  reason: "이 주제 최다 추천 상품",                    priority: 1 },
    { productType: "budget-pick",        reason: "가성비 좋은 대안",                          priority: 2 },
    { productType: "premium-pick",       reason: "전문가 추천 프리미엄 옵션",                 priority: 3 },
  ],
};

// ─── Main Export ──────────────────────────────────────────────────────────────

export function buildProductDiscovery(article) {
  const category = detectCategory(article);
  const problem = detectProblem(article, category);
  const rawIntent = article.searchIntent || detectSearchIntent(article.title);
  const buyingStage = BUYING_STAGE_MAP[rawIntent] || "consideration";

  return {
    problem,
    targetUser: TARGET_USERS[problem] || TARGET_USERS.general,
    searchIntent: SEARCH_INTENT_DESCRIPTIONS[problem] || "관련 상품 탐색",
    buyingStage,
    recommendedProducts: (PROBLEM_PRODUCTS[problem] || PROBLEM_PRODUCTS.general).slice(),
  };
}
