import {
  ATLAS_CHANNEL_ID,
  assertNaverWriteTarget,
  stampChannelIdentity,
  validateChannelIdentity,
  validateNaverWriteTarget,
} from "./character-channel-policy.js";
import { coupangPartnersStatus } from "./coupang-partners-status.js";

export const KOREA_PLATFORM = "naver";

export const KOREA_DRAFT_STATE = Object.freeze({
  DRAFT: "draft",
  READY_FOR_REVIEW: "ready_for_review",
  APPROVED: "approved",
  PUBLISHING: "publishing",
  PUBLISHED: "published",
  FAILED: "failed",
});

export const KOREA_CONTENT_TYPE = Object.freeze({
  EXISTING_POST_UPDATE: "existing_post_update",
  NEW_PRODUCT_REVIEW: "new_product_review",
  // 생활편의·시즌 검색형 정보글. 제휴 링크 없이 발행할 수 있고 productName을 요구하지 않는다.
  // 제품을 함께 소개할 때만 role: "product_photo" 슬롯에 실제 제품 사진을 연결한다.
  INFO_GUIDE: "info_guide",
});

export function normalizeKoreaDraft(input = {}) {
  const now = new Date().toISOString();
  const id = String(input.id || `kr_${Date.now().toString(36)}`);
  return stampChannelIdentity({
    id,
    platform: KOREA_PLATFORM,
    contentType: input.contentType || KOREA_CONTENT_TYPE.NEW_PRODUCT_REVIEW,
    blogId: "who-ami",
    logNo: String(input.logNo || ""),
    title: String(input.title || ""),
    productName: String(input.productName || ""),
    productUrl: String(input.productUrl || ""),
    affiliateUrl: String(input.affiliateUrl || ""),
    // 승인 분리 기록: 일반 상품 링크 문구, 공식 제품 정보, 수익화 결정, 이미지 권한 표시는 편집을 거쳐도 유지한다.
    ...(input.productLinkLabel ? { productLinkLabel: String(input.productLinkLabel) } : {}),
    ...(input.productInfo && typeof input.productInfo === "object" ? { productInfo: input.productInfo } : {}),
    ...(input.monetization && typeof input.monetization === "object" ? { monetization: input.monetization } : {}),
    ...(input.productImageRights ? { productImageRights: String(input.productImageRights) } : {}),
    // 단일 운영 화면(주제 선택 → 자동 작성)이 남기는 출처 표시. 편집을 거쳐도 유지한다.
    ...(input.topicId ? { topicId: String(input.topicId) } : {}),
    ...(input.keyword ? { keyword: String(input.keyword) } : {}),
    ...(input.generatedBy ? { generatedBy: String(input.generatedBy) } : {}),
    ...(Array.isArray(input.productImageCandidates) ? { productImageCandidates: input.productImageCandidates } : {}),
    // 공개 라이선스 실사 사진의 출처·라이선스 기록(저작권 확인 근거)도 편집을 거쳐 유지한다.
    ...(Array.isArray(input.photoLicenses) ? { photoLicenses: input.photoLicenses } : {}),
    // 제휴 링크가 없는 정보글에는 제휴 고지를 만들지 않는다. 링크가 있을 때만 기본 문구를 채운다.
    affiliateDisclosure: String(
      input.affiliateDisclosure
        || (String(input.affiliateUrl || "").trim()
          ? "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다."
          : ""),
    ),
    character: "suho",
    recommendationMode: "DIRECT_RECOMMENDATION",
    bodyHtml: String(input.bodyHtml || ""),
    bodyText: String(input.bodyText || ""),
    images: Array.isArray(input.images)
      ? input.images.map((img, index) => ({
          id: String(img?.id || `img_${index + 1}`),
          role: String(img?.role || `body_${index + 1}`),
          src: String(img?.src || ""),
          alt: String(img?.alt || ""),
          placement: String(img?.placement || ""),
          anchorKeywords: Array.isArray(img?.anchorKeywords)
            ? img.anchorKeywords.map((keyword) => String(keyword || "").trim()).filter(Boolean)
            : [],
          // Keep the publish-gate flags through PATCH re-normalization so an
          // edit never silently re-requires (or un-requires) a Suho slot.
          ...(img?.optional === true ? { optional: true } : {}),
          ...(img?.required === false ? { required: false } : {}),
          // 슬롯별 무료 카드 문구(수호 마스터 카드 렌더러가 읽음)도 편집을 거쳐 보존한다.
          ...(img?.card && typeof img.card === "object" ? { card: img.card } : {}),
          ...(img?.blockedReason ? { blockedReason: String(img.blockedReason) } : {}),
          ...(img?.license ? { license: String(img.license) } : {}),
          ...(img?.sourceUrl ? { sourceUrl: String(img.sourceUrl) } : {}),
        }))
      : [],
    state: Object.values(KOREA_DRAFT_STATE).includes(input.state)
      ? input.state
      : KOREA_DRAFT_STATE.DRAFT,
    approvedAt: input.approvedAt || "",
    publishedAt: input.publishedAt || "",
    publishedUrl: String(input.publishedUrl || ""),
    lastError: String(input.lastError || ""),
    createdAt: input.createdAt || now,
    updatedAt: now,
  }, ATLAS_CHANNEL_ID.KOREA_NAVER);
}

export function validateKoreaDraft(draft = {}) {
  const issues = [];
  if (!draft.blogId) issues.push("blogId required");
  if (!draft.title) issues.push("title required");
  if (!draft.bodyHtml && !draft.bodyText) issues.push("body required");
  if (draft.contentType === KOREA_CONTENT_TYPE.EXISTING_POST_UPDATE && !draft.logNo) {
    issues.push("logNo required for existing post update");
  }
  if (draft.contentType === KOREA_CONTENT_TYPE.NEW_PRODUCT_REVIEW && !draft.productName) {
    issues.push("productName required for product review");
  }
  if (draft.affiliateUrl && !draft.affiliateDisclosure) {
    issues.push("affiliate disclosure required when affiliateUrl is present");
  }
  issues.push(...validateChannelIdentity(draft, ATLAS_CHANNEL_ID.KOREA_NAVER).issues);
  issues.push(...validateNaverWriteTarget(draft).issues);
  return { ok: issues.length === 0, issues };
}

export function canApproveKoreaDraft(draft = {}) {
  const validation = validateKoreaDraft(draft);
  return validation.ok && draft.state === KOREA_DRAFT_STATE.READY_FOR_REVIEW;
}

export function canPublishKoreaDraft(draft = {}) {
  return draft.state === KOREA_DRAFT_STATE.APPROVED;
}

// 실제 네이버 발행 직전 수익화 게이트.
// 파트너스 승인(approved) 후 신규 글은 제휴 링크가 있어야 발행한다. 승인 전(pending)에는 제휴 링크를
// 요구하지 않고 일반 상품 링크 또는 링크 없는 글을 허용한다. 연결된 이미지(src)는 상태와 관계없이 필요하다.
export function publishBlockers(draft = {}, status = coupangPartnersStatus()) {
  const blockers = [];
  // 정보글: 제휴 링크는 요구하지 않지만, 실제로 생성·연결된 이미지는 반드시 있어야 한다.
  if (draft.contentType === KOREA_CONTENT_TYPE.INFO_GUIDE) {
    const linked = (draft.images || []).filter((img) => String(img?.src || "").trim()).length;
    if (!linked) blockers.push("no image linked (src empty)");
  }
  if (draft.contentType === KOREA_CONTENT_TYPE.NEW_PRODUCT_REVIEW) {
    if (status.affiliateRequired && !String(draft.affiliateUrl || "").trim()) blockers.push("affiliate link missing");
    const linked = (draft.images || []).filter((img) => String(img?.src || "").trim()).length;
    if (!linked) blockers.push("no image linked (src empty)");
  }
  return blockers;
}

// 네이버 편집기는 발행 직후 PostView.naver?...&isAfterWrite=true 같은 긴 주소로 이동한다.
// 그 주소를 그대로 보관하면 공개 URL이 지저분해지고, 같은 글을 URL로 대조할 때도 어긋난다.
// logNo를 뽑아 정식 퍼머링크(https://blog.naver.com/<blogId>/<logNo>)로 정규화한다.
export function canonicalNaverUrl(url = "", blogId = "") {
  const value = String(url || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (!/(^|\.)blog\.naver\.com$/i.test(parsed.hostname)) return value;
    const logNo = parsed.searchParams.get("logNo")
      || (/\/(\d{6,})(?:$|[/?#])/.exec(parsed.pathname) || [])[1]
      || "";
    const blog = parsed.searchParams.get("blogId")
      || (/^\/([^/]+)\/\d{6,}/.exec(parsed.pathname) || [])[1]
      || String(blogId || "");
    if (!logNo || !blog) return value;
    return `https://blog.naver.com/${blog}/${logNo}`;
  } catch {
    return value;
  }
}

export function naverEditorTarget(draft = {}) {
  assertNaverWriteTarget(draft);
  if (draft.contentType === KOREA_CONTENT_TYPE.EXISTING_POST_UPDATE && draft.logNo) {
    return `https://blog.naver.com/PostUpdateForm.naver?blogId=${encodeURIComponent(draft.blogId)}&logNo=${encodeURIComponent(draft.logNo)}`;
  }
  return `https://blog.naver.com/PostWriteForm.naver?blogId=${encodeURIComponent(draft.blogId)}`;
}
