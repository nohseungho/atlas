const DEFAULT_DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

function clean(value) {
  return String(value || "").trim();
}

function bullets(values = []) {
  return values.map(clean).filter(Boolean);
}

export function generateKoreaProductArticle(input = {}) {
  const name = clean(input.productName || input.title || "이 제품");
  const strengths = bullets(input.strengths);
  const weaknesses = bullets(input.weaknesses);
  const bestFor = bullets(input.bestFor);
  const notFor = bullets(input.notFor);
  const facts = bullets(input.facts);
  const affiliateUrl = clean(input.affiliateUrl);
  const disclosure = clean(input.affiliateDisclosure) || DEFAULT_DISCLOSURE;

  const intro = `${name}을 찾고 있다면 먼저 추천하고 싶은 제품입니다. 매일 쓰기 편한 기본기와 구매할 이유가 분명한지 중심으로, 선택에 필요한 내용만 쉽게 정리해보겠습니다.`;
  const strengthText = strengths.length
    ? strengths.map((v, i) => `${i + 1}. ${v}`).join("\n")
    : "1. 일상에서 반복해서 쓰기 편한지\n2. 관리와 청소가 번거롭지 않은지\n3. 가격 대비 기본 기능이 충분한지";
  const factText = facts.length ? facts.map((v) => `- ${v}`).join("\n") : "- 구매 전 현재 판매 페이지의 정확한 모델명과 상세 사양을 다시 확인하세요.";
  const weakText = weaknesses.length ? weaknesses.map((v) => `- ${v}`).join("\n") : "- 특별한 부가기능이 꼭 필요한 사람에게는 단순하게 느껴질 수 있습니다.";
  const bestText = bestFor.length ? bestFor.map((v) => `- ${v}`).join("\n") : `- ${name}의 핵심 기능을 자주 쓰는 사람`;
  const notText = notFor.length ? notFor.map((v) => `- ${v}`).join("\n") : "- 세부 조절 기능이나 프리미엄 기능이 꼭 필요한 사람";

  const bodyText = `${intro}

이 제품을 추천하는 이유
${strengthText}

구매 전에 확인할 점
${factText}

알고 고르면 좋은 점
${weakText}

이런 분께 추천합니다
${bestText}

구매 전에 한 번 더 비교하면 좋은 경우
${notText}

수호의 한줄 추천
${name}은 필요한 기능을 어렵지 않게 쓰고 싶은 분께 기분 좋게 추천할 수 있는 제품입니다. 현재 가격과 옵션, 배송 조건만 마지막으로 확인해보세요.${affiliateUrl ? `\n\n제품 확인하기: ${affiliateUrl}` : ""}`;

  return {
    title: clean(input.title) || `${name}, 일상에서 추천하는 이유와 구매 전 체크 포인트`,
    bodyText,
    affiliateDisclosure: affiliateUrl ? disclosure : clean(input.affiliateDisclosure),
    recommendationMode: "DIRECT_RECOMMENDATION",
    generatedBy: "ATLAS_KOREA_TEMPLATE_V1",
    generatedAt: new Date().toISOString(),
  };
}

export function defaultKoreaProductImages(input = {}) {
  const name = clean(input.productName || input.title || "추천 제품");
  return [
    {
      id: "img_product_reasons",
      role: "product_reasons",
      src: "",
      alt: `${name} 추천 포인트 요약`,
      placement: "추천 이유 문단 뒤",
      anchorKeywords: ["추천하는 이유", "추천", "이유"],
    },
    {
      id: "img_product_fit",
      role: "product_fit",
      src: "",
      alt: `${name} 추천 대상 안내`,
      placement: "추천 대상 문단 뒤",
      anchorKeywords: ["이런 분께 추천", "추천합니다"],
    },
    {
      id: "img_product_check",
      role: "product_check",
      src: "",
      alt: `${name} 구매 전 확인사항`,
      placement: "구매 전 확인 문단 뒤",
      anchorKeywords: ["구매 전에 확인", "현재 가격", "배송 조건"],
    },
  ];
}

export function generatePhilips3000KettleArticle(input = {}) {
  return generateKoreaProductArticle({
    ...input,
    productName: input.productName || "필립스 3000 시리즈 무선 전기주전자",
    title: input.title || "필립스 3000 시리즈 전기주전자, 매일 편하게 쓰기 좋은 추천 포인트",
    strengths: input.strengths || [
      "물을 자주 끓이는 집에서 복잡한 설정 없이 바로 쓰기 쉽습니다.",
      "자동 전원 차단 같은 기본 안전 기능을 중심으로 보기 좋습니다.",
      "입구와 내부 구조가 청소하기 편한지 확인하기 좋은 생활가전입니다.",
    ],
    weaknesses: input.weaknesses || [
      "정밀한 온도 조절이 필요한 차·커피 사용자라면 온도 설정형 제품이 더 맞을 수 있습니다.",
      "플라스틱 소재 접촉을 민감하게 보는 사람은 실제 모델의 내부 소재를 반드시 확인해야 합니다.",
    ],
    bestFor: input.bestFor || [
      "아침마다 물을 빠르게 끓이는 가정",
      "복잡한 기능보다 단순한 사용성과 자동 차단을 중요하게 보는 사람",
      "가격 대비 브랜드 기본기를 원하는 사람",
    ],
    notFor: input.notFor || [
      "온도를 1도 단위로 설정해야 하는 사람",
      "보온 기능이나 앱 연동 등 부가기능이 꼭 필요한 사람",
    ],
    facts: input.facts || [
      "필립스 3000 시리즈는 세부 모델별 용량과 소재가 다를 수 있으므로 구매 페이지의 정확한 모델명을 확인하세요.",
      "현재 판매가와 후기 수는 수시로 바뀌므로 글에 고정 숫자로 박아 넣지 않고 구매 시점에 확인합니다.",
    ],
  });
}
