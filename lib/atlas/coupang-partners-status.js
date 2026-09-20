// 쿠팡 파트너스 승인 상태와 국내 콘텐츠 제작을 분리하는 단일 기준.
//
//   pending  : 파트너스 최종 승인 전. 제휴 링크 없이 일반 상품 링크(제조사 공식 페이지 등)
//              또는 링크 없는 글로 발행할 수 있다. 제휴 고지는 출력하지 않는다.
//   approved : 최종 승인 후. Open API 키가 있으면 신규 초안에 제휴 링크·공식 이미지를 자동 연결하고,
//              키가 없으면 파트너스 화면에서 만든 소재를 인박스로 받아 연결한다. 신규 글 발행에는 제휴 링크가 필수다.
//
// 승인 후에도 기존 발행 글은 건드리지 않는다. pending 상태로 발행된 글은 초안의 monetization.partnersLinkPending
// 기록으로만 남기고, 활성화는 향후 신규 글부터 적용한다.
//
// 상태 판정 순서: Open API 키(COUPANG_PARTNERS_ACCESS_KEY + SECRET_KEY) → COUPANG_PARTNERS_STATUS=approved → pending.
function clean(value) {
  return String(value || "").trim();
}

export const COUPANG_PARTNERS_STAGE = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
});

export const KOREA_LINK_MODE = Object.freeze({
  AFFILIATE: "affiliate",
  PRODUCT_PAGE: "product_page",
  NONE: "none",
});

export function isPartnersLink(url = "") {
  try {
    const parsed = new URL(clean(url));
    return parsed.protocol === "https:" && parsed.hostname === "link.coupang.com" && /^\/(a\/[A-Za-z0-9]+|re\/AFFSDP)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isHttpUrl(url = "") {
  try {
    const parsed = new URL(clean(url));
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function coupangPartnersStatus(env = process.env) {
  const openApi = Boolean(clean(env?.COUPANG_PARTNERS_ACCESS_KEY) && clean(env?.COUPANG_PARTNERS_SECRET_KEY));
  const declared = clean(env?.COUPANG_PARTNERS_STATUS).toLowerCase();
  const approved = openApi || declared === COUPANG_PARTNERS_STAGE.APPROVED;
  const stage = approved ? COUPANG_PARTNERS_STAGE.APPROVED : COUPANG_PARTNERS_STAGE.PENDING;
  return {
    stage,
    approved,
    openApi,
    // 신규 초안에 제휴 링크를 자동으로 붙일 수 있는 경로
    autoLink: openApi,
    linkSource: openApi ? "open_api" : approved ? "manual_inbox" : "none",
    // 승인 후 신규 글은 제휴 링크가 있어야 발행한다. 승인 전에는 요구하지 않는다.
    affiliateRequired: approved,
    reason: openApi
      ? "Open API 키가 설정되어 있어 신규 초안에 제휴 링크·공식 이미지를 자동 연결합니다."
      : approved
        ? "COUPANG_PARTNERS_STATUS=approved. Open API 키가 없어 파트너스 화면 소재(인박스)로 연결합니다."
        : "파트너스 최종 승인 전입니다. 제휴 링크 없이 일반 상품 링크 또는 링크 없는 글로 발행합니다.",
  };
}

// 초안 하나가 실제 본문에 어떤 링크를 어떻게 넣을지 결정한다. 본문 렌더러와 발행 게이트가 같은 답을 쓴다.
export function koreaLinkPlan(draft = {}, status = coupangPartnersStatus()) {
  const affiliateUrl = clean(draft.affiliateUrl);
  const productUrl = clean(draft.productUrl);
  if (affiliateUrl && isHttpUrl(affiliateUrl)) {
    return {
      linkMode: KOREA_LINK_MODE.AFFILIATE,
      url: affiliateUrl,
      label: clean(draft.productLinkLabel) || clean(draft.productName) || affiliateUrl,
      disclosure: clean(draft.affiliateDisclosure),
      partnersStage: status.stage,
      partnersLinkPending: false,
    };
  }
  if (productUrl && isHttpUrl(productUrl) && !isPartnersLink(productUrl)) {
    return {
      linkMode: KOREA_LINK_MODE.PRODUCT_PAGE,
      url: productUrl,
      label: clean(draft.productLinkLabel) || `${clean(draft.productName) || "제품"} 공식 정보 보기`,
      disclosure: "",
      partnersStage: status.stage,
      partnersLinkPending: status.stage === COUPANG_PARTNERS_STAGE.PENDING,
    };
  }
  return {
    linkMode: KOREA_LINK_MODE.NONE,
    url: "",
    label: "",
    disclosure: "",
    partnersStage: status.stage,
    partnersLinkPending: status.stage === COUPANG_PARTNERS_STAGE.PENDING,
  };
}

// 초안에 남기는 수익화 기록. 승인 후 "어떤 글이 제휴 링크 없이 나갔는지"를 알 수 있게만 하고, 자동 수정은 하지 않는다.
export function monetizationRecord(draft = {}, status = coupangPartnersStatus()) {
  const plan = koreaLinkPlan(draft, status);
  return {
    partnersStage: status.stage,
    linkSource: status.linkSource,
    linkMode: plan.linkMode,
    partnersLinkPending: plan.partnersLinkPending,
    decidedAt: new Date().toISOString(),
  };
}
