// Policy Validator — turns lib/atlas/operating-policy.js into checks that gates
// run right before a publish and that UI panels render as PASS/FAIL/WARN.
//
// Pure module: takes data (and, for Blogger, the already-assembled HTML) and
// returns results. It never reads files, env or the network, so the Publisher
// page can run the same checks the server gate runs.
//
// Result shape: { id, code, status: "pass" | "fail" | "warn" | "skip", detail }.
// A gate blocks on the first "fail"; "warn" never blocks.
import { ATLAS_POLICIES, GLOBAL_LAYOUT, getPolicy } from "./operating-policy.js";
import { coupangPartnersStatus, koreaLinkPlan, KOREA_LINK_MODE } from "./coupang-partners-status.js";
import { ATLAS_CHANNEL_ID, validateChannelIdentity, validateNaverWriteTarget } from "./character-channel-policy.js";
import { isPublicImageUrl, isAffiliateActive, normalizeImageSrc, hasBareUrlText, getChrome } from "./revenue-layout-engine.js";
import { PUBLISH_STATE, publishStateOf } from "./publisher-sync.js";

const FAQ_HEADING = /<h[23][^>]*>[^<]*(?:\bfaq\b|frequently asked questions|자주\s*묻는\s*질문)[^<]*<\/h[23]>/gi;
const SOURCES_HEADING = /<h[23][^>]*>[^<]*(?:\bsources\b|\breferences\b|출처)[^<]*<\/h[23]>/gi;
const SOURCES_LABEL = />\s*(?:Sources|출처)\s*<\/p>/gi;
const DISCLAIMER_WORD = /\bdisclaimer\b|안내\s*사항|주의\s*사항/gi;
// Words that betray an affiliate/purchase framing in a trust note.
const AFFILIATE_FRAMING = /affiliate|commission|sponsored|purchas|제휴|수수료|구매/i;
// Video production/upload fields that must never appear in shorts material.
const VIDEO_FIELDS = ["videoUrl", "videoPath", "renderJob", "renderedAt", "uploadedAt", "youtubeId", "mp4"];

const count = (html, re) => (String(html || "").match(re) || []).length;
const result = (id, status, detail = "") => ({ id, code: getPolicy(id).code, status, detail });

function requiredAssets(article) {
  return (Array.isArray(article?.visualAssets) ? article.visualAssets : []).filter((a) => a?.required !== false);
}

// ── Global Blogger (미지) ─────────────────────────────────────────────────────
// `html` is the publish-mode output of buildBloggerHtml(article). Without it the
// HTML-level checks report "skip" so the panel can still show data-level rules.
// `succeededJobCount` is the number of succeeded publishing jobs for this article
// on the target blog (the gate passes it; the panel may omit it).
export function evaluateGlobalArticle(article = {}, { html = "", succeededJobCount = 0 } = {}) {
  const results = [];
  const G = ATLAS_CHANNEL_ID.GLOBAL_BLOGGER;

  const identity = validateChannelIdentity(article, G);
  results.push(result("channel_character_lock", identity.ok ? "pass" : "fail", identity.issues.join("; ")));

  const state = publishStateOf(article);
  const duplicate = state === PUBLISH_STATE.PUBLISHED || succeededJobCount > 0;
  results.push(result("no_duplicate_publish", duplicate ? "fail" : "pass", duplicate ? `publishState=${state}, succeededJobs=${succeededJobCount}` : ""));

  const required = requiredAssets(article);
  const missing = required.filter((a) => !isPublicImageUrl(a.publicUrl)).map((a) => a.key || a.role || "image");
  results.push(result("global_required_images_public", missing.length ? "fail" : "pass", missing.length ? `missing: ${missing.join(", ")}` : `${required.length} required`));

  const lowIdentity = (article.visualAssets || []).filter((a) => a?.identityReview?.level && a.identityReview.level !== "high");
  results.push(result("global_character_identity_review", lowIdentity.length ? "warn" : "pass", lowIdentity.map((a) => `${a.key}: ${a.identityReview.level}`).join(", ")));

  const plan = article.affiliatePlan;
  const chrome = getChrome(article);
  if (!html) {
    for (const id of ["global_images_render_once", "global_no_duplicate_sections", "global_affiliate_surface_gated", "global_sources_clickable", "global_layout_defaults", "global_single_disclaimer_note"]) {
      results.push(result(id, "skip", "HTML not assembled"));
    }
    return finish(results);
  }

  const srcs = Array.from(String(html).matchAll(/<img[^>]+src=["']([^"']+)["']/gi), (m) => normalizeImageSrc(m[1]));
  const dupes = srcs.filter((s, i) => srcs.indexOf(s) !== i);
  results.push(result("global_images_render_once", dupes.length ? "fail" : "pass", dupes.length ? `repeated: ${[...new Set(dupes)].join(", ")}` : `${srcs.length} images`));

  const faq = count(html, FAQ_HEADING);
  const sources = count(html, SOURCES_HEADING) + count(html, SOURCES_LABEL);
  const disclaimers = count(html, DISCLAIMER_WORD);
  const sectionsOk = faq <= 1 && sources <= 1 && disclaimers <= 1;
  results.push(result("global_no_duplicate_sections", sectionsOk ? "pass" : "fail", `FAQ ${faq} / Sources ${sources} / Disclaimer ${disclaimers}`));

  if (isAffiliateActive(plan)) {
    results.push(result("global_affiliate_surface_gated", "pass", "affiliate active — CTA allowed"));
  } else {
    const leaked = html.includes(chrome.ctaHeading) || html.includes(chrome.affiliateDisclosureLabel) || html.includes(chrome.ctaButton);
    results.push(result("global_affiliate_surface_gated", leaked ? "fail" : "pass", leaked ? "CTA/affiliate disclosure rendered without an active plan" : "no affiliate surface"));
  }

  const bare = hasBareUrlText(html);
  results.push(result("global_sources_clickable", bare ? "fail" : "pass", bare ? "bare https:// text found outside <a>" : ""));

  const hasLayout = html.includes(`data-${GLOBAL_LAYOUT.layoutMarker}`) && html.includes(`max-width:${GLOBAL_LAYOUT.maxWidthPx}px`);
  results.push(result("global_layout_defaults", hasLayout ? "pass" : "fail", hasLayout ? `${GLOBAL_LAYOUT.maxWidthPx}px container` : "layout container missing"));

  const note = String(article.trust?.independenceNote || "");
  const noteBad = !isAffiliateActive(plan) && note && AFFILIATE_FRAMING.test(note) && !/no affiliate|제휴 링크가 없|contains no/i.test(note);
  results.push(result("global_single_disclaimer_note", disclaimers <= 1 && !noteBad ? "pass" : "fail", noteBad ? "independenceNote uses affiliate/purchase framing without an active plan" : `disclaimer x${disclaimers}`));

  return finish(results);
}

// ── Korea Naver (수호) ────────────────────────────────────────────────────────
// Required body slots: everything that is not a product photo and not marked
// optional/required:false. Shared by the gate and the panel so the rule lives
// in exactly one place.
export function koreaMissingRequiredImages(draft = {}) {
  return (draft.images || [])
    .filter((img) => img.role !== "product_photo" && img.optional !== true && img.required !== false && !String(img.src || "").trim())
    .map((img) => img.id || img.role || "image");
}

// `partners` defaults to the server-side env reading (coupang-partners-status.js); pass it explicitly
// from a client that cannot read env.
export function evaluateKoreaDraft(draft = {}, { partners = coupangPartnersStatus() } = {}) {
  const results = [];
  const K = ATLAS_CHANNEL_ID.KOREA_NAVER;

  const identity = validateChannelIdentity(draft, K);
  results.push(result("channel_character_lock", identity.ok ? "pass" : "fail", identity.issues.join("; ")));

  const target = validateNaverWriteTarget(draft);
  results.push(result("naver_protected_post", target.ok ? "pass" : "fail", target.issues.join("; ")));

  const published = draft.state === "published" || Boolean(String(draft.publishedUrl || "").trim());
  results.push(result("no_duplicate_publish", published ? "fail" : "pass", published ? `state=${draft.state}` : ""));

  const missing = koreaMissingRequiredImages(draft);
  results.push(result("naver_required_images", missing.length ? "fail" : "pass", missing.length ? `missing: ${missing.join(", ")}` : ""));

  // 파트너스 승인 전(pending)에는 제휴 링크 없이도 통과한다(일반 상품 링크 또는 링크 없음).
  // 승인 후(approved) 신규 글은 제휴 링크가 있어야 발행 게이트를 지난다.
  const plan = koreaLinkPlan(draft, partners);
  const monetized = plan.linkMode === KOREA_LINK_MODE.AFFILIATE;
  results.push(result(
    "naver_monetized_candidate_only",
    monetized ? "pass" : partners.affiliateRequired ? "warn" : "pass",
    monetized
      ? "affiliate link present"
      : partners.affiliateRequired
        ? "partners approved — publish gate will require an affiliate link"
        : `partners pending — publishing without affiliate link (linkMode=${plan.linkMode})`,
  ));

  return finish(results);
}

// ── Unified product drafts (both channels) ───────────────────────────────────
export function evaluateUnifiedDraft(draft = {}) {
  const results = [];
  const knownChannel = Object.values(ATLAS_CHANNEL_ID).includes(draft.channelId);
  const identity = knownChannel ? validateChannelIdentity(draft, draft.channelId) : { ok: false, issues: [`unknown channel ${draft.channelId}`] };
  results.push(result("channel_character_lock", identity.ok ? "pass" : "fail", identity.issues.join("; ")));

  const attempted = Boolean(draft.publishedUrl || draft.externalId || draft.logNo);
  results.push(result("no_duplicate_publish", attempted ? "fail" : "pass", attempted ? "draft already points at a live post" : ""));

  const shorts = draft.shorts && typeof draft.shorts === "object" ? draft.shorts : {};
  const videoKeys = Object.keys(shorts).filter((k) => VIDEO_FIELDS.some((f) => k.toLowerCase().includes(f.toLowerCase())));
  results.push(result("shorts_export_only", videoKeys.length ? "fail" : "pass", videoKeys.length ? `video fields present: ${videoKeys.join(", ")}` : ""));

  if (draft.channelId === ATLAS_CHANNEL_ID.KOREA_NAVER) {
    const target = validateNaverWriteTarget(draft);
    results.push(result("naver_protected_post", target.ok ? "pass" : "fail", target.issues.join("; ")));
  } else if (draft.channelId === ATLAS_CHANNEL_ID.GLOBAL_BLOGGER) {
    // Editorial-first: a global product draft is reference material and must
    // never be flagged as an approved publish target from this screen.
    results.push(result("global_editorial_first", draft.state === "approved" ? "fail" : "pass", draft.state === "approved" ? "global product draft approved outside Publisher" : "reference only"));
  }
  return finish(results);
}

function finish(results) {
  const blocking = results.filter((r) => r.status === "fail");
  const warnings = results.filter((r) => r.status === "warn");
  return { ok: blocking.length === 0, blocking, warnings, results, errorCode: blocking[0]?.code || null };
}

// Registry integrity helper for tests: every policy must be produced by at
// least one evaluator (or be an env/render rule enforced elsewhere).
export function coveredPolicyIds() {
  const ids = new Set();
  for (const r of evaluateGlobalArticle({}, { html: "<div></div>" }).results) ids.add(r.id);
  for (const r of evaluateKoreaDraft({}).results) ids.add(r.id);
  for (const r of evaluateUnifiedDraft({ channelId: ATLAS_CHANNEL_ID.GLOBAL_BLOGGER }).results) ids.add(r.id);
  for (const r of evaluateUnifiedDraft({ channelId: ATLAS_CHANNEL_ID.KOREA_NAVER }).results) ids.add(r.id);
  return ids;
}

export { ATLAS_POLICIES };
