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

// 생활형 제품 후기 흐름: 문제 → 소개 → 고른 이유 → 특징 → (삽화) → 아쉬운 점 → 잘 맞는 사람 → 링크 → 마무리
// 직접 사용 사실이 확인되지 않은 제품이므로 체험 표현을 쓰지 않는다.
export function generateMultitapReviewArticle(input = {}) {
  const name = clean(input.productName) || "에코파워탭 국내 제조 순동 일체형 개별 스위치 과부하 차단 멀티탭 4구 CSG-40415 1.5m";
  const affiliateUrl = clean(input.affiliateUrl);
  const disclosure = clean(input.affiliateDisclosure) || DEFAULT_DISCLOSURE;
  const bodyText = `집에서 멀티탭을 바꾸게 되는 계기는 대부분 비슷합니다.
TV 뒤에 꽂아둔 멀티탭이 어느 날 만져보니 미지근하게 뜨겁거나,
책상 아래 멀티탭에 충전기와 모니터 어댑터가 뒤엉켜 서로 간섭하거나,
하나만 끄고 싶은데 전체 전원을 내려야 하는 상황이 반복될 때입니다.

멀티탭은 매일 쓰지만 고를 때는 콘센트 개수와 가격만 보고 사기 쉽습니다.
그런데 여러 전자제품을 동시에 연결하는 물건이라
정격 용량, 스위치 방식, 과부하 차단 같은 기본 안전 요소를 같이 보는 편이 마음이 편합니다.

오늘 소개할 제품

${name}입니다.
이름이 길지만 제품의 핵심이 그대로 들어 있습니다.
국내 제조, 순동 일체형 단자, 콘센트별 개별 스위치, 과부하 차단, 4구, 1.5m 케이블 구성입니다.

왜 이 제품을 골랐는지

멀티탭 후보를 추릴 때 세 가지를 기준으로 봤습니다.
첫째, 과부하 차단처럼 눈에 보이지 않는 안전 장치가 있는지.
둘째, 자주 끄는 기기를 따로 관리할 수 있는 개별 스위치인지.
셋째, 접점 부위 소재가 명확히 표기되어 있는지.
이 제품은 세 가지가 제품명에 모두 명시되어 있어 후보에서 먼저 눈에 들어왔습니다.

특징과 좋은 점

개별 스위치가 있으면 TV 셋톱박스나 충전기처럼 대기전력이 생기는 기기만 골라서 끌 수 있습니다.
통합 스위치 하나짜리 멀티탭과 비교하면 매일 쓰는 편의성 차이가 꽤 큽니다.

순동 일체형 단자는 여러 조각을 이어 붙인 구조보다 접촉 부위가 단순해
발열 관리 측면에서 유리하다고 알려진 방식입니다.

과부하 차단 기능은 연결 기기의 사용 전력이 기준을 넘으면 전원을 끊어 주는 장치입니다.
전기포트나 히터처럼 소비전력이 큰 제품을 실수로 함께 꽂았을 때를 대비한 안전망 역할입니다.

4구에 1.5m 길이는 TV 주변이나 책상 아래처럼 벽 콘센트에서 조금 떨어진 자리에 두기 무난한 구성입니다.

아쉬운 점

솔직히 말하면 저는 이 제품을 직접 오래 써본 것은 아니라서, 제품 정보와 구성 기준으로 정리한 내용입니다.
실제 내구성이나 스위치 감촉은 구매 후기를 함께 참고하시는 편이 좋습니다.

4구 구성이라 연결할 기기가 많은 자리에는 부족할 수 있습니다.
USB 충전 포트는 없어서 스마트폰 충전은 별도 어댑터가 필요합니다.
그리고 개별 스위치 제품은 통합 스위치 제품보다 본체가 조금 길어질 수 있어 좁은 틈에는 미리 자리를 확인해야 합니다.

어떤 사람에게 잘 맞는지

TV·셋톱박스·공유기처럼 대기전력이 생기는 기기를 한곳에 모아 두는 분,
책상에서 모니터·충전기·스탠드를 따로따로 끄고 싶은 분,
멀티탭이 뜨거워진 경험이 있어 안전 기능을 우선으로 보는 분께 잘 맞습니다.

반대로 6구 이상 넉넉한 구성이나 USB 포트 일체형을 원하는 분은 다른 모델을 함께 비교하는 편이 낫습니다.

제품 정보는 아래에서 확인할 수 있습니다.
가격과 옵션, 케이블 길이는 판매 페이지 기준으로 한 번 더 확인해 주세요.

마무리

멀티탭은 한 번 사면 몇 년을 쓰는 물건이라
콘센트 개수보다 안전 기능과 스위치 방식을 먼저 보는 것을 권합니다.
필요한 기능이 제품명에 그대로 적혀 있는 제품이라 비교 기준으로 삼기에도 편했습니다.`;

  return {
    title: clean(input.title) || "멀티탭, 아무거나 쓰면 안 되는 이유와 안전하게 고르는 법",
    bodyText,
    affiliateDisclosure: affiliateUrl ? disclosure : clean(input.affiliateDisclosure),
    recommendationMode: "DIRECT_RECOMMENDATION",
    generatedBy: "ATLAS_KOREA_MULTITAP_REVIEW_V1",
    generatedAt: new Date().toISOString(),
  };
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
