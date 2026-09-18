// 국내 초안(korea-drafts.json)의 shorts 블록을 Story Shorts AI(POST /api/shopping) 입력 JSON으로 변환한다.
// 렌더링/업로드는 하지 않는다. 검증되지 않은 가격·후기 수는 verified:false로만 넘긴다.

export const EXPORT_VERSION = "ATLAS_SHOPPING_SHORTS_EXPORT_V1";
export const MIN_SECONDS = 30;
export const MAX_SECONDS = 45;

const clean = (value) => String(value || "").trim();
const unverified = (value = null, source = "") => ({ value, verified: false, source });

export function shortsBlockers(draft = {}) {
  const shorts = draft.shorts || {};
  const blockers = [];
  if (!clean(draft.affiliateUrl)) blockers.push("affiliate link missing");
  const productImages = (shorts.sourceImages || []).filter((img) => img.role === "product");
  // 공식 상품 이미지는 최소 1장. 두 번째 슬롯은 있으면 쓰고 없으면 비워 둔다.
  if (!productImages.some((img) => clean(img.path))) blockers.push("official product image missing");
  const total = Number(shorts.durationSeconds);
  if (!(total >= MIN_SECONDS && total <= MAX_SECONDS)) blockers.push(`duration must be ${MIN_SECONDS}-${MAX_SECONDS}s`);
  if (!clean(shorts.hook)) blockers.push("hook missing");
  if (!(shorts.scenes || []).length) blockers.push("scenes missing");
  return blockers;
}

export function buildStoryShortsExport(draft = {}) {
  const shorts = draft.shorts || {};
  const scenes = (shorts.scenes || []).map((scene, index) => ({
    index: index + 1,
    beat: scene.beat,
    start: scene.start,
    end: scene.end,
    direction: scene.direction,
    vo: scene.vo,
    caption: scene.caption,
    imageId: scene.imageId || "",
  }));
  const subtitles = scenes.map((scene) => ({ start: scene.start, end: scene.end, text: scene.caption || scene.vo }));
  const blockers = shortsBlockers(draft);
  return {
    exportVersion: EXPORT_VERSION,
    target: "story-shorts-ai POST /api/shopping",
    draftId: draft.id,
    status: blockers.length ? "materials_ready_pending_assets" : "ready_for_review",
    blockers,
    renderedVideo: false,
    uploaded: false,
    product: {
      productName: clean(draft.productName),
      commerceMode: "MARKET_AFFILIATE",
      sourceMarket: "COUPANG",
      currency: "KRW",
      targetProblem: clean(shorts.targetProblem),
      summary: clean(shorts.summary),
      advantages: shorts.advantages || [],
      recommendedFor: clean(shorts.recommendedFor),
      usageScene: clean(shorts.usageScene),
      demoLine: clean(shorts.demoLine),
      resultLine: clean(shorts.resultLine),
      salesClaim: "",
      salePrice: unverified(null, draft.evidenceSnapshot?.priceText ? `${draft.evidenceSnapshot.source}: ${draft.evidenceSnapshot.priceText} (판매 페이지 미확인)` : ""),
      listPrice: unverified(),
      rating: unverified(),
      reviewCount: unverified(),
      shippingCost: unverified(),
      priceSource: "UNVERIFIED",
      demandEvidence: clean(draft.evidenceSnapshot?.popularity),
      selectionEvidence: draft.evidenceSnapshot || {},
      seller: "쿠팡",
      productUrl: clean(draft.productUrl),
      affiliateUrl: clean(draft.affiliateUrl),
      affiliateVerified: false,
      affiliatePossible: true,
      imageSource: "COUPANG_PARTNERS_OFFICIAL",
      photos: (shorts.sourceImages || []).map((img) => clean(img.path)).filter(Boolean),
      targetSeconds: shorts.durationSeconds,
      memo: clean(shorts.memo),
    },
    shorts: {
      hook: clean(shorts.hook),
      durationSeconds: shorts.durationSeconds,
      script: scenes.map((scene) => scene.vo).join("\n"),
      scenes,
      subtitles,
      sourceImages: shorts.sourceImages || [],
      cta: clean(shorts.cta),
      disclosure: clean(draft.affiliateDisclosure),
      character: draft.character,
      characterAsset: clean(draft.masterAssetPath),
    },
  };
}
