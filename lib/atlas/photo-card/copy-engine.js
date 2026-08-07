// ─── Photo Card · 규칙 기반 문구 생성 ──────────────────────────────────────
// 유료 AI API를 쓰지 않고 입력된 상품 정보만으로 6장의 기본 문구를 만든다.
// 입력에 없는 판매량·순위·최저가는 만들어내지 않는다. 모든 결과는 사용자가 수정 가능하다.

import {
  formatAmount,
  linkStatus,
  linkStatusLabel,
  LINK_STATUS,
} from "./product-model.js";

export const CARD_DEFS = [
  { slug: "01-cover", kind: "cover", label: "표지 · 강한 효용" },
  { slug: "02-problem", kind: "problem", label: "필요한 상황 · 문제" },
  { slug: "03-features", kind: "features", label: "핵심 특징" },
  { slug: "04-price", kind: "price", label: "가격 메리트 · 구성" },
  { slug: "05-audience", kind: "audience", label: "추천 대상 · 사용 상황" },
  { slug: "06-cta", kind: "cta", label: "구매 유도 · 제휴 고지" },
];

export const CARD_COUNT = CARD_DEFS.length;

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

// [받침 있을 때, 받침 없을 때]
const PARTICLES = {
  은는: ["은", "는"],
  이가: ["이", "가"],
  을를: ["을", "를"],
  과와: ["과", "와"],
  으로: ["으로", "로"],
  이라면: ["이라면", "라면"],
};

/** 받침 유무에 따라 조사를 고른다. (예: josa("가방", "은는") → "은") */
export function josa(word, key) {
  const pair = PARTICLES[key];
  if (!pair) return "";
  const text = String(word || "").trim();
  if (!text) return pair[1];
  const code = text.charCodeAt(text.length - 1);
  if (code < HANGUL_START || code > HANGUL_END) return pair[1];
  const jong = (code - HANGUL_START) % 28;
  // ㄹ 받침은 "으로"가 아니라 "로"를 쓴다.
  if (key === "으로" && jong === 8) return pair[1];
  return jong === 0 ? pair[1] : pair[0];
}

export function withJosa(word, key) {
  const text = String(word || "").trim();
  return text ? `${text}${josa(text, key)}` : "";
}

function compact(list) {
  return list.map((v) => (typeof v === "string" ? v.trim() : v)).filter(Boolean);
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function checkedAtText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 가격 표기. 비교 근거가 없으면 "최저가"가 아니라 "현재 확인가"로 쓴다. */
export function priceHeadline(product) {
  if (!hasValue(product.currentPrice)) return "가격 확인 후 안내";
  return `현재 확인가 ${formatAmount(product.currentPrice, product.currency)}`;
}

export function priceEvidence(product) {
  const parts = compact([
    checkedAtText(product.priceCheckedAt) ? `${checkedAtText(product.priceCheckedAt)} 확인` : "",
    product.priceSource ? `출처 ${product.priceSource}` : "출처 미기재",
  ]);
  return `${parts.join(" · ")} · 가격·재고는 판매처 기준으로 변동될 수 있습니다.`;
}

function shippingLine(product) {
  if (product.shippingFee === 0) return "배송비 무료 (입력 기준)";
  if (hasValue(product.shippingFee)) {
    return `배송비 ${formatAmount(product.shippingFee, product.currency)}`;
  }
  return "배송비 미확인";
}

function buildCover(product) {
  const headline = product.benefit || product.name;
  return {
    badge: product.category || product.vendor || "상품 추천",
    headline,
    sub: headline === product.name ? product.vendor || "" : product.name,
    bullets: [],
    footnote: hasValue(product.currentPrice) ? priceHeadline(product) : "",
  };
}

function buildProblem(product) {
  const bullets = compact([
    product.benefit ? `${withJosa(product.benefit, "이가")} 필요한 순간` : "",
    product.features[0] ? `${withJosa(product.features[0], "은는")} 매번 아쉬웠던 부분` : "",
    product.audience ? `${withJosa(product.audience, "이라면")} 한 번쯤 겪는 상황` : "",
    product.category ? `${product.category} 고를 때 매번 비교하게 되는 지점` : "",
  ]).slice(0, 4);

  return {
    badge: "이런 상황",
    headline: product.audience
      ? `${product.audience}에게 자주 생기는 고민`
      : "이런 상황이라면 확인해 보세요",
    sub: "",
    bullets: bullets.length ? bullets : ["핵심 효용·추천 대상을 입력하면 자동으로 채워집니다."],
    footnote: "",
  };
}

function buildFeatures(product) {
  return {
    badge: "핵심 특징",
    headline: product.benefit ? `${product.name}` : `${product.name} 체크포인트`,
    sub: product.vendor ? `판매처 ${product.vendor}` : "",
    bullets: product.features.length
      ? product.features.slice(0, 5)
      : ["주요 특징을 3~5개 입력하면 이 카드에 표시됩니다."],
    footnote: "표기된 특징은 판매처·제조사 정보 기준입니다.",
  };
}

function buildPrice(product) {
  const discountLine =
    hasValue(product.listPrice) && hasValue(product.discountPercent)
      ? `정상가 ${formatAmount(product.listPrice, product.currency)} · ${product.discountPercent}% 할인`
      : "정상가 미확인 · 할인율 계산 불가";

  return {
    badge: "가격 정보",
    headline: priceHeadline(product),
    sub: product.vendor ? `${product.vendor} 기준` : "",
    bullets: compact([
      discountLine,
      shippingLine(product),
      product.shippingNote,
      product.category ? `카테고리 ${product.category}` : "",
    ]).slice(0, 4),
    footnote: priceEvidence(product),
  };
}

function buildAudience(product) {
  const bullets = compact([
    product.audience,
    product.benefit ? `${withJosa(product.benefit, "이가")} 중요한 사용 상황` : "",
    product.features[1] || product.features[0] || "",
    product.category ? `${product.category} 입문·교체 시점` : "",
  ]).slice(0, 4);

  return {
    badge: "추천 대상",
    headline: product.audience ? `${withJosa(product.audience, "이라면")} 잘 맞습니다` : "이런 분께 맞습니다",
    sub: "",
    bullets: bullets.length ? bullets : ["추천 대상을 입력하면 이 카드에 표시됩니다."],
    footnote: "",
  };
}

function buildCta(product) {
  const linked = linkStatus(product) === LINK_STATUS.LINKED;
  return {
    badge: linkStatusLabel(product),
    headline: "구매는 상품 링크에서",
    sub: product.vendor ? `${product.vendor} 판매 페이지` : "",
    bullets: compact([
      product.tagNote || "프로필 링크 · 상품 태그에서 판매 페이지로 이동",
      "가격·재고·배송 조건은 판매처 기준",
      product.priceCheckedAt ? `${checkedAtText(product.priceCheckedAt)} 확인 기준` : "",
    ]).slice(0, 3),
    footnote: linked
      ? "이 게시물은 제휴 링크를 포함할 수 있으며, 구매 시 일정 수수료를 받을 수 있습니다."
      : "현재 판매 연결 전 상태입니다. 이 게시물로는 제휴 수수료가 발생하지 않습니다.",
  };
}

const BUILDERS = {
  cover: buildCover,
  problem: buildProblem,
  features: buildFeatures,
  price: buildPrice,
  audience: buildAudience,
  cta: buildCta,
};

/** 상품 1개 → 기본 6장 문구 */
export function buildCards(product = {}) {
  const safe = {
    name: "",
    vendor: "",
    category: "",
    currency: "KRW",
    ...product,
    features: Array.isArray(product.features) ? product.features : [],
    hashtags: Array.isArray(product.hashtags) ? product.hashtags : [],
  };
  return CARD_DEFS.map((def, index) => ({
    index,
    slug: def.slug,
    kind: def.kind,
    label: def.label,
    ...BUILDERS[def.kind](safe),
  }));
}

/** 카드별 사용자 수정본을 덮어쓴다. 비어 있는 필드는 기본 문구를 유지한다. */
export function applyOverrides(cards, overrides = {}) {
  return cards.map((card) => {
    const patch = overrides[card.slug];
    if (!patch) return card;
    const next = { ...card };
    for (const field of ["badge", "headline", "sub", "footnote"]) {
      if (typeof patch[field] === "string") next[field] = patch[field];
    }
    if (typeof patch.bulletsText === "string") {
      next.bullets = patch.bulletsText
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);
    } else if (Array.isArray(patch.bullets)) {
      next.bullets = patch.bullets;
    }
    return next;
  });
}

/** 게시글 문구 · 해시태그 · 상품정보 텍스트 패키지 */
export function buildCaptionText(product, cards, { platform = "", createdAt = new Date() } = {}) {
  const linked = linkStatus(product) === LINK_STATUS.LINKED;
  const lines = [
    `[${product.name}]`,
    "",
    product.caption || cards[0]?.headline || "",
    "",
    "■ 핵심 특징",
    ...((product.features || []).length
      ? product.features.map((f) => `- ${f}`)
      : ["- (입력된 특징 없음)"]),
    "",
    "■ 가격 정보",
    `- ${priceHeadline(product)}`,
    `- ${shippingLine(product)}`,
    hasValue(product.listPrice) && hasValue(product.discountPercent)
      ? `- 정상가 ${formatAmount(product.listPrice, product.currency)} · ${product.discountPercent}% 할인`
      : "- 정상가 미확인 · 할인율 계산 불가",
    `- ${priceEvidence(product)}`,
    "",
    "■ 상품 정보",
    `- 판매처: ${product.vendor || "미기재"}`,
    `- 카테고리: ${product.category || "미분류"}`,
    `- 추천 대상: ${product.audience || "미기재"}`,
    `- 상품 URL: ${product.productUrl || "미기재"}`,
    `- 판매 연결 상태: ${linkStatusLabel(product)}`,
    `- 이미지 출처: ${product.imageSource || "미기재"}${product.imageRightsConfirmed ? " (사용 확인됨)" : " (사용 확인 미체크)"}`,
    "",
    (product.hashtags || []).join(" "),
    "",
    linked
      ? "※ 이 게시물은 제휴 링크를 포함할 수 있으며, 구매 시 일정 수수료를 받을 수 있습니다."
      : "※ 현재 판매 연결 전 상태입니다. 이 게시물로는 제휴 수수료가 발생하지 않습니다.",
    `※ 제작: ATLAS Photo Studio · ${platform || "SNS"} · ${new Date(createdAt).toLocaleString("ko-KR")}`,
  ];
  return lines.filter((line) => line !== undefined).join("\n");
}

export function buildPackageJson(product, cards, { platform = "", preset = "", createdAt = new Date() } = {}) {
  return {
    generatedBy: "ATLAS Photo Studio",
    generatedAt: new Date(createdAt).toISOString(),
    platform,
    preset,
    linkStatus: linkStatus(product),
    product: {
      id: product.id,
      name: product.name,
      category: product.category,
      vendor: product.vendor,
      currency: product.currency,
      currentPrice: product.currentPrice,
      listPrice: product.listPrice,
      discountPercent: product.discountPercent,
      shippingFee: product.shippingFee,
      shippingNote: product.shippingNote,
      productUrl: product.productUrl,
      affiliateLink: product.affiliateLink,
      tagNote: product.tagNote,
      benefit: product.benefit,
      features: product.features,
      audience: product.audience,
      priceSource: product.priceSource,
      priceCheckedAt: product.priceCheckedAt,
      imageSource: product.imageSource,
      imageRightsConfirmed: product.imageRightsConfirmed,
    },
    caption: product.caption,
    hashtags: product.hashtags,
    cards: cards.map((card) => ({
      slug: card.slug,
      kind: card.kind,
      badge: card.badge,
      headline: card.headline,
      sub: card.sub,
      bullets: card.bullets,
      footnote: card.footnote,
    })),
  };
}
