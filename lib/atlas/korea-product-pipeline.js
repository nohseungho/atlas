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
  return {
    id,
    platform: KOREA_PLATFORM,
    contentType: input.contentType || KOREA_CONTENT_TYPE.NEW_PRODUCT_REVIEW,
    blogId: String(input.blogId || "who-ami"),
    logNo: String(input.logNo || ""),
    title: String(input.title || ""),
    productName: String(input.productName || ""),
    productUrl: String(input.productUrl || ""),
    affiliateUrl: String(input.affiliateUrl || ""),
    affiliateDisclosure:
      String(input.affiliateDisclosure || "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다."),
    character: input.character === "miji" ? "miji" : "suho",
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
  };
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
  return { ok: issues.length === 0, issues };
}

export function canApproveKoreaDraft(draft = {}) {
  const validation = validateKoreaDraft(draft);
  return validation.ok && draft.state === KOREA_DRAFT_STATE.READY_FOR_REVIEW;
}

export function canPublishKoreaDraft(draft = {}) {
  return draft.state === KOREA_DRAFT_STATE.APPROVED;
}

export function naverEditorTarget(draft = {}) {
  if (draft.contentType === KOREA_CONTENT_TYPE.EXISTING_POST_UPDATE && draft.logNo) {
    return `https://blog.naver.com/PostUpdateForm.naver?blogId=${encodeURIComponent(draft.blogId)}&logNo=${encodeURIComponent(draft.logNo)}`;
  }
  return `https://blog.naver.com/PostWriteForm.naver?blogId=${encodeURIComponent(draft.blogId)}`;
}
