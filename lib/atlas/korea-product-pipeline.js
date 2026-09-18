import {
  ATLAS_CHANNEL_ID,
  assertNaverWriteTarget,
  stampChannelIdentity,
  validateChannelIdentity,
  validateNaverWriteTarget,
} from "./character-channel-policy.js";

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
    affiliateDisclosure:
      String(input.affiliateDisclosure || "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다."),
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

// 실제 네이버 발행 직전 수익화 게이트. 제휴링크와 연결된 이미지(src)가 없으면 발행을 막는다.
export function publishBlockers(draft = {}) {
  const blockers = [];
  if (draft.contentType === KOREA_CONTENT_TYPE.NEW_PRODUCT_REVIEW) {
    if (!String(draft.affiliateUrl || "").trim()) blockers.push("affiliate link missing");
    const linked = (draft.images || []).filter((img) => String(img?.src || "").trim()).length;
    if (!linked) blockers.push("no image linked (src empty)");
  }
  return blockers;
}

export function naverEditorTarget(draft = {}) {
  assertNaverWriteTarget(draft);
  if (draft.contentType === KOREA_CONTENT_TYPE.EXISTING_POST_UPDATE && draft.logNo) {
    return `https://blog.naver.com/PostUpdateForm.naver?blogId=${encodeURIComponent(draft.blogId)}&logNo=${encodeURIComponent(draft.logNo)}`;
  }
  return `https://blog.naver.com/PostWriteForm.naver?blogId=${encodeURIComponent(draft.blogId)}`;
}
