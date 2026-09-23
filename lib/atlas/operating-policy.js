// ATLAS Operating Policy — the single registry of rules that were settled once
// and must never regress silently. Every entry names the errorCode a gate
// returns when it fails, the channel it applies to, and where it is enforced.
//
// Adding a rule = add an entry here + a check in policy-validator.js + a test in
// operating-policy.test.mjs. The registry test fails when any of the three is
// missing, so a rule cannot exist as prose only.
//
// This module is pure (no fs, no env, no framework) so both server gates and
// client panels (Publisher, unified screen) can import it.
import { ATLAS_CHANNEL_ID, ATLAS_CHARACTERS, PROTECTED_NAVER_POSTS } from "./character-channel-policy.js";

export const POLICY_VERSION = "ATLAS_OPERATING_POLICY_V1";

// Rendering defaults for the global Blogger article body. The design engine
// reads these; the validator checks the assembled HTML carries them.
export const GLOBAL_LAYOUT = Object.freeze({
  maxWidthPx: 800, // desktop reading width (760–820 target)
  figureMargin: "28px 0 32px",
  figureRadiusPx: 12,
  mobileBreakpointPx: 480,
  layoutMarker: "atlas-layout-v1",
});

export const SHORTS_MODE = "export_only";

// Enforcement surfaces. "gate" blocks a publish/update; "render" is applied by
// the HTML assembler and re-checked by the validator; "warn" surfaces in the
// UI but does not block; "env" is an environment switch.
export const ENFORCEMENT = Object.freeze({ GATE: "gate", RENDER: "render", WARN: "warn", ENV: "env" });

const G = ATLAS_CHANNEL_ID.GLOBAL_BLOGGER;
const K = ATLAS_CHANNEL_ID.KOREA_NAVER;

export const ATLAS_POLICIES = Object.freeze([
  // ── Shared ────────────────────────────────────────────────────────────────
  {
    id: "channel_character_lock",
    code: "ATLAS_CHANNEL_ASSET_MISMATCH",
    scope: [G, K],
    enforcement: ENFORCEMENT.GATE,
    title: "국내=수호 / 해외=미지 캐릭터·자산 고정",
    detail: `해외 Blogger는 ${ATLAS_CHARACTERS.miji.masterFileName}, 국내 Naver는 ${ATLAS_CHARACTERS.suho.masterFileName}만 사용한다. 서로의 자산을 섞으면 발행이 차단된다.`,
    enforcedBy: ["app/api/publish/route.js", "app/api/atlas/korea-publish/route.js", "lib/atlas/unified-products.js#assertIdentity"],
  },
  {
    id: "no_duplicate_publish",
    code: "ALREADY_PUBLISHED",
    scope: [G, K],
    enforcement: ENFORCEMENT.GATE,
    title: "기발행 글·제품 중복 발행 금지",
    detail: "이미 공개된 글(publishState/succeeded job/publishedUrl)은 다시 insert 하지 않는다. 통합 TOP5는 기발행 상품을 후보에서 제외한다.",
    enforcedBy: ["app/api/publish/route.js", "app/api/atlas/korea-publish/route.js", "lib/atlas/unified-workflow.js#publishedExclusions"],
  },
  {
    id: "paid_api_forbidden",
    code: "PAID_API_FORBIDDEN",
    scope: [G, K],
    enforcement: ENFORCEMENT.ENV,
    title: "유료 생성 API 자동 호출 금지",
    detail: "이미지·본문 유료 API는 ATLAS_ALLOW_PAID_API=1 이 명시된 환경에서만 준비 상태가 된다. 기본값은 차단.",
    enforcedBy: ["lib/atlas/providers/image-provider.js#imageProviderReadiness"],
  },
  {
    id: "shorts_export_only",
    code: "SHORTS_EXPORT_ONLY",
    scope: [G, K],
    enforcement: ENFORCEMENT.GATE,
    title: "쇼핑쇼츠는 연결자료 export만",
    detail: "ATLAS는 상품·이미지·링크·요약 연결자료만 만든다. 영상 렌더·업로드 필드가 자료에 들어오면 거부한다.",
    enforcedBy: ["lib/atlas/policy-validator.js#evaluateUnifiedDraft"],
  },

  // ── Global Blogger (미지) ─────────────────────────────────────────────────
  {
    id: "global_required_images_public",
    code: "GLOBAL_IMAGE_ASSETS_REQUIRED",
    scope: [G],
    enforcement: ENFORCEMENT.GATE,
    title: "필수 미지 이미지에 공개 https URL 없으면 발행 금지",
    detail: "required:true 자산마다 Cloudinary 등 공개 https publicUrl이 있어야 한다. 로컬 경로·localhost는 인정하지 않는다.",
    enforcedBy: ["app/api/publish/route.js"],
  },
  {
    id: "global_images_render_once",
    code: "GLOBAL_IMAGE_DUPLICATE_RENDER",
    scope: [G],
    enforcement: ENFORCEMENT.GATE,
    title: "이미지 5장 각 1회만 렌더",
    detail: "hero·afterSection·본문 내장 이미지가 겹쳐 같은 자산이 두 번 나오면 발행을 막는다.",
    enforcedBy: ["lib/atlas/revenue-design-engine.js#injectSectionVisuals", "app/api/publish/route.js"],
  },
  {
    id: "global_no_duplicate_sections",
    code: "GLOBAL_DUPLICATE_SECTIONS",
    scope: [G],
    enforcement: ENFORCEMENT.GATE,
    title: "FAQ / Sources / Disclaimer 각 1회",
    detail: "본문이 이미 가진 섹션을 chrome이 다시 붙이지 않는다. 조립 결과에 FAQ·Sources 제목이 2개 이상이거나 disclaimer 문구가 2회 이상이면 차단.",
    enforcedBy: ["lib/atlas/revenue-design-engine.js#buildRevenueHtml", "app/api/publish/route.js"],
  },
  {
    id: "global_affiliate_surface_gated",
    code: "GLOBAL_AFFILIATE_SURFACE_WITHOUT_PLAN",
    scope: [G],
    enforcement: ENFORCEMENT.GATE,
    title: "affiliate 비활성 시 CTA/제휴 고지 출력 금지",
    detail: "affiliatePlan.status !== 'active' 이면 CTA 박스·Affiliate Disclosure가 HTML에 나타나면 안 된다.",
    enforcedBy: ["lib/atlas/revenue-layout-engine.js#isAffiliateActive", "app/api/publish/route.js"],
  },
  {
    id: "global_sources_clickable",
    code: "GLOBAL_BARE_URL_TEXT",
    scope: [G],
    enforcement: ENFORCEMENT.GATE,
    title: "Official Sources는 클릭 가능한 링크",
    detail: "본문에 https:// 문자열이 <a> 없이 그대로 노출되면 안 된다. 자동 링크는 target=_blank rel=noopener noreferrer.",
    enforcedBy: ["lib/atlas/revenue-layout-engine.js#autolinkUrls", "app/api/publish/route.js"],
  },
  {
    id: "global_layout_defaults",
    code: "GLOBAL_LAYOUT_MARKER_MISSING",
    scope: [G],
    enforcement: ENFORCEMENT.RENDER,
    title: "본문 폭·이미지 간격·모바일 기본값",
    detail: `조립 HTML은 max-width ${GLOBAL_LAYOUT.maxWidthPx}px 컨테이너(${GLOBAL_LAYOUT.layoutMarker})로 감싸고, 본문 figure는 ${GLOBAL_LAYOUT.figureMargin} 여백과 hairline 프레임을 쓴다.`,
    enforcedBy: ["lib/atlas/revenue-design-engine.js#buildRevenueHtml"],
  },
  {
    id: "global_single_disclaimer_note",
    code: "GLOBAL_TRUST_NOTE_INVALID",
    scope: [G],
    enforcement: ENFORCEMENT.GATE,
    title: "주의문구 1회 + independenceNote는 보조 설명",
    detail: "법적·정보성 disclaimer는 본문 또는 chrome 중 한 곳에만 있다. 활성 affiliate가 없는 글의 independenceNote는 제휴·구매 표현을 담지 않는다.",
    enforcedBy: ["lib/atlas/revenue-design-engine.js#buildTrustBox", "app/api/publish/route.js"],
  },
  {
    id: "global_character_identity_review",
    code: "GLOBAL_CHARACTER_IDENTITY_LOW",
    scope: [G],
    enforcement: ENFORCEMENT.WARN,
    title: "미지 얼굴 일치도 낮은 컷은 발행 전 검토 표시",
    detail: "visualAssets[].identityReview.level 이 low/medium 이면 Publisher에 경고를 띄운다. 자동 재생성은 하지 않는다.",
    enforcedBy: ["app/publisher/page.js#VisualAssetsPanel"],
  },
  {
    id: "global_character_face_match",
    code: "GLOBAL_CHARACTER_FACE_MISMATCH",
    scope: [G],
    enforcement: ENFORCEMENT.GATE,
    title: "미지 얼굴이 ATLAS-MIJI-MASTER와 일치해야 발행",
    detail: "필수 visualAssets 전부 faceMatch.status=pass(ArcFace 유사도 기준 이상)여야 한다. 기록이 없거나 fail이면 이미지 미완료이며 발행·공개 이미지 교체를 막는다(art_024 얼굴 불일치 사고, 2026-09-24).",
    enforcedBy: ["lib/atlas/policy-validator.js#evaluateGlobalArticle", "app/api/publish/route.js", "app/api/articles/upload-visuals/route.js", "lib/atlas/operate/scene-art.js#resolveSceneArt"],
  },
  {
    id: "global_editorial_first",
    code: "GLOBAL_EDITORIAL_FIRST",
    scope: [G],
    enforcement: ENFORCEMENT.GATE,
    title: "해외는 정보형 Publisher 흐름 우선",
    detail: "DealNews TOP5는 참고용이다. 통합 화면은 해외 상품 글을 자동 초안으로 만들지 않고, 실제 발행은 Publisher의 정보형 글만 거친다.",
    enforcedBy: ["app/api/atlas/unified-publish/route.js#preparePair"],
  },

  // ── Korea Naver (수호) ────────────────────────────────────────────────────
  {
    id: "naver_protected_post",
    code: "NAVER_PROTECTED_TARGET",
    scope: [K],
    enforcement: ENFORCEMENT.GATE,
    title: `Naver 보호글 logNo ${PROTECTED_NAVER_POSTS.join(", ")} 수정 금지`,
    detail: "보호글은 어떤 경로로도 PostUpdateForm 대상이 될 수 없다. 신규 글은 logNo 없이 PostWriteForm만 사용한다.",
    enforcedBy: ["lib/atlas/character-channel-policy.js#assertNaverWriteTarget", "app/api/atlas/korea-publish/route.js"],
  },
  {
    id: "naver_required_images",
    code: "NAVER_IMAGE_ASSETS_REQUIRED",
    scope: [K],
    enforcement: ENFORCEMENT.GATE,
    title: "신규 국내 글에 수호 본문 이미지 누락 금지",
    detail: "product_photo가 아닌 필수 이미지 슬롯(optional/required:false 제외)의 src가 비어 있으면 스테이징·발행을 막는다.",
    enforcedBy: ["app/api/atlas/korea-publish/route.js"],
  },
  {
    id: "naver_monetized_candidate_only",
    code: "NAVER_MONETIZATION_REQUIRED",
    scope: [K],
    enforcement: ENFORCEMENT.GATE,
    title: "국내 다음글은 수익화 확인된 후보만 자동 준비",
    detail: "통합 화면의 자동 준비는 쿠팡 근거가 확인된 후보만 초안으로 만든다. 실제 발행에는 연결된 이미지가 있어야 하며, 제휴 링크는 파트너스 승인(approved) 후 신규 글부터 필수다. 승인 전(pending)에는 일반 상품 링크 또는 링크 없는 글로 발행하고 제휴 고지를 넣지 않는다. 승인 후에도 기존 글은 수정하지 않는다.",
    enforcedBy: ["app/api/atlas/unified-publish/route.js#preparePair", "lib/atlas/korea-product-pipeline.js#publishBlockers", "lib/atlas/coupang-partners-status.js#koreaLinkPlan"],
  },
]);

export function getPolicy(id) {
  return ATLAS_POLICIES.find((p) => p.id === id) || null;
}

export function policiesForChannel(channelId) {
  return ATLAS_POLICIES.filter((p) => p.scope.includes(channelId));
}

// Compact, serialisable summary for UI lists (no functions, stable order).
export function summarizePolicies(channelId) {
  return policiesForChannel(channelId).map(({ id, code, title, enforcement }) => ({ id, code, title, enforcement }));
}
