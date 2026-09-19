// Operating Policy — every settled rule has (1) a registry entry, (2) a validator
// check, (3) a test here that shows it failing and passing. The registry test at
// the bottom fails if a rule is added without the other two.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ATLAS_POLICIES, GLOBAL_LAYOUT, getPolicy, policiesForChannel, summarizePolicies, ENFORCEMENT } from "./operating-policy.js";
import { evaluateGlobalArticle, evaluateKoreaDraft, evaluateUnifiedDraft, koreaMissingRequiredImages, coveredPolicyIds } from "./policy-validator.js";
import { buildRevenueHtml } from "./revenue-design-engine.js";
import { autolinkUrls, hasBareUrlText } from "./revenue-layout-engine.js";
import { imageProviderReadiness, paidApiAllowed } from "./providers/image-provider.js";
import { ATLAS_CHANNEL_ID } from "./character-channel-policy.js";

const CLOUD = "https://res.cloudinary.com/demo/image/upload/v1/atlas/articles/slug";
const keys = ["featured", "border", "comparison", "offline", "checklist"];
const statusOf = (evaluation, id) => evaluation.results.find((r) => r.id === id)?.status;

// A clean global article: 5 public assets, markdown body with its own FAQ /
// Sources / Disclaimer, no affiliate plan, neutral trust note.
function globalArticle(overrides = {}) {
  return {
    id: "art_policy",
    title: "Policy Fixture Article",
    category: "Travel",
    language: "en",
    channelId: ATLAS_CHANNEL_ID.GLOBAL_BLOGGER,
    character: "miji",
    assetScope: "global",
    assetNamespace: "atlas/articles",
    masterAssetPath: "public/atlas/characters/ATLAS-MIJI-MASTER.png",
    status: "written",
    publishState: "written",
    quickAnswer: "Direct answer.",
    bodyMarkdown: [
      "## Quick Answer", "Direct answer.",
      "## Section Two", "Text.",
      "## Section Three", "Text.",
      "## Section Four", "Text.",
      "## Section Five", "Text.",
      "## FAQ", "### Q?", "A.",
      "## Official Sources", "- Source A: https://example.org/a",
      "Disclaimer: General information only.",
    ].join("\n\n"),
    faq: [{ question: "Q?", answer: "A." }],
    sources: [{ title: "Source A", url: "https://example.org/a" }],
    affiliatePlan: { status: "pending", url: "", cta: {} },
    trust: { methodology: "Official sources only.", independenceNote: "Based on official sources. No affiliate links." },
    heroImage: { url: `${CLOUD}/featured`, alt: "Miji featured", aspectRatio: "16:9" },
    visualAssets: keys.map((k, i) => ({
      key: k,
      placement: `afterSection:${["Quick Answer", "Section Two", "Section Three", "Section Four", "Section Five"][i]}`,
      alt: `Miji ${k} scene`,
      required: true,
      localSrc: `/images/articles/slug/${k}.png`,
      publicUrl: `${CLOUD}/${k}`,
      channelId: ATLAS_CHANNEL_ID.GLOBAL_BLOGGER,
      characterId: "miji",
    })),
    ...overrides,
  };
}

// Mirrors lib/html-exporter.js markdownToHtml closely enough (H2 ids + autolink).
function md(markdown) {
  let h2 = 0;
  return String(markdown || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const esc = line.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    if (line.startsWith("### ")) return `<h3>${esc.slice(4)}</h3>`;
    if (line.startsWith("## ")) return `<h2 id="atlas-h2-${h2++}">${esc.slice(3)}</h2>`;
    if (line.startsWith("- ")) return `<ul><li>${autolinkUrls(esc.slice(2))}</li></ul>`;
    return `<p>${autolinkUrls(esc)}</p>`;
  }).join("\n");
}

function render(article) {
  return buildRevenueHtml(article, md(article.bodyMarkdown), { mode: "publish" }).html;
}

function evalGlobal(article, extra = {}) {
  return evaluateGlobalArticle(article, { html: render(article), ...extra });
}

// ── Global: clean fixture passes every gate ──────────────────────────────────
test("clean global article passes every blocking policy", () => {
  const r = evalGlobal(globalArticle());
  assert.equal(r.ok, true, JSON.stringify(r.blocking));
  assert.equal(r.errorCode, null);
  assert.equal(r.results.filter((x) => x.status === "skip").length, 0, "HTML-level checks ran");
});

test("channel_character_lock: Suho master inside a global article is blocked", () => {
  const r = evalGlobal(globalArticle({ masterAssetPath: "public/atlas/characters/ATLAS-SUO-MASTER.png" }));
  assert.equal(statusOf(r, "channel_character_lock"), "fail");
  assert.equal(r.errorCode, "ATLAS_CHANNEL_ASSET_MISMATCH");
});

test("no_duplicate_publish: published state or a succeeded job blocks", () => {
  assert.equal(statusOf(evalGlobal(globalArticle({ publishState: "published", status: "published" })), "no_duplicate_publish"), "fail");
  assert.equal(statusOf(evalGlobal(globalArticle(), { succeededJobCount: 1 }), "no_duplicate_publish"), "fail");
  assert.equal(statusOf(evalGlobal(globalArticle()), "no_duplicate_publish"), "pass");
});

test("global_required_images_public: a required asset without https publicUrl blocks", () => {
  const article = globalArticle();
  article.visualAssets[2].publicUrl = "";
  const r = evalGlobal(article);
  assert.equal(r.errorCode, "GLOBAL_IMAGE_ASSETS_REQUIRED");
  assert.match(r.blocking[0].detail, /comparison/);
  // localhost is not public
  article.visualAssets[2].publicUrl = "http://localhost:3002/images/x.png";
  assert.equal(statusOf(evalGlobal(article), "global_required_images_public"), "fail");
  // required:false assets are not demanded
  article.visualAssets[2].required = false;
  article.visualAssets[2].publicUrl = "";
  assert.equal(statusOf(evalGlobal(article), "global_required_images_public"), "pass");
});

test("global_images_render_once: hero asset is not injected a second time; a duplicated src is caught", () => {
  const r = evalGlobal(globalArticle());
  assert.equal(statusOf(r, "global_images_render_once"), "pass");
  assert.match(r.results.find((x) => x.id === "global_images_render_once").detail, /^5 images/);
  const dup = `${render(globalArticle())}<img src="${CLOUD}/border" alt="again" />`;
  assert.equal(statusOf(evaluateGlobalArticle(globalArticle(), { html: dup }), "global_images_render_once"), "fail");
});

test("global_no_duplicate_sections: assembler never doubles FAQ/Sources/Disclaimer; doubled HTML is caught", () => {
  const html = render(globalArticle());
  assert.equal(statusOf(evaluateGlobalArticle(globalArticle(), { html }), "global_no_duplicate_sections"), "pass");
  const doubled = `${html}\n<h2>FAQ</h2><h3>Q</h3><p>A</p>`;
  const r = evaluateGlobalArticle(globalArticle(), { html: doubled });
  assert.equal(statusOf(r, "global_no_duplicate_sections"), "fail");
  assert.equal(r.errorCode, "GLOBAL_DUPLICATE_SECTIONS");
});

test("global_affiliate_surface_gated: pending plan renders no CTA; a leaked CTA is caught; active plan allows it", () => {
  const pending = evalGlobal(globalArticle());
  assert.equal(statusOf(pending, "global_affiliate_surface_gated"), "pass");
  const leaked = `${render(globalArticle())}<p>Check the Latest Details</p>`;
  assert.equal(statusOf(evaluateGlobalArticle(globalArticle(), { html: leaked }), "global_affiliate_surface_gated"), "fail");
  const active = globalArticle({ affiliatePlan: { status: "active", url: "https://partner.example.com/x", cta: { topLabel: "Compare" } } });
  assert.equal(statusOf(evalGlobal(active), "global_affiliate_surface_gated"), "pass");
});

test("global_sources_clickable: bare URL text blocks; autolinked sources pass", () => {
  assert.equal(hasBareUrlText("<li>Source: https://example.org/a</li>"), true);
  assert.equal(hasBareUrlText(autolinkUrls("Source: https://example.org/a")), false);
  assert.match(autolinkUrls("https://example.org/a"), /target="_blank" rel="noopener noreferrer"/);
  const r = evalGlobal(globalArticle());
  assert.equal(statusOf(r, "global_sources_clickable"), "pass");
  const bare = render(globalArticle()).replace(/<a [^>]*>https:\/\/example\.org\/a<\/a>/, "https://example.org/a");
  const bad = evaluateGlobalArticle(globalArticle(), { html: bare });
  assert.equal(statusOf(bad, "global_sources_clickable"), "fail");
  assert.equal(bad.errorCode, "GLOBAL_BARE_URL_TEXT");
});

test("global_layout_defaults: assembler wraps output in the reading-width container", () => {
  const html = render(globalArticle());
  assert.ok(html.startsWith(`<div data-${GLOBAL_LAYOUT.layoutMarker}`));
  assert.ok(html.includes(`max-width:${GLOBAL_LAYOUT.maxWidthPx}px`));
  assert.ok(GLOBAL_LAYOUT.maxWidthPx >= 760 && GLOBAL_LAYOUT.maxWidthPx <= 820, "desktop reading width stays in the 760–820 band");
  assert.ok(html.includes(`margin:${GLOBAL_LAYOUT.figureMargin}`), "in-body figures use the policy spacing");
  assert.equal(statusOf(evaluateGlobalArticle(globalArticle(), { html: "<p>no wrapper</p>" }), "global_layout_defaults"), "fail");
});

test("global_single_disclaimer_note: affiliate-framed independence note without an active plan blocks", () => {
  const bad = globalArticle({ trust: { methodology: "M.", independenceNote: "Any affiliate relationship does not influence this review; confirm before purchasing." } });
  const r = evalGlobal(bad);
  assert.equal(statusOf(r, "global_single_disclaimer_note"), "fail");
  assert.equal(r.errorCode, "GLOBAL_TRUST_NOTE_INVALID");
  assert.equal(statusOf(evalGlobal(globalArticle()), "global_single_disclaimer_note"), "pass");
});

test("global_character_identity_review: low/medium identity is a warning, never a block", () => {
  const article = globalArticle();
  article.visualAssets[1].identityReview = { level: "low", note: "hair up" };
  const r = evalGlobal(article);
  assert.equal(statusOf(r, "global_character_identity_review"), "warn");
  assert.equal(r.ok, true, "warnings do not block");
  assert.match(r.warnings[0].detail, /border: low/);
});

// ── Korea Naver ──────────────────────────────────────────────────────────────
function koreaDraft(overrides = {}) {
  return {
    id: "kr_policy",
    platform: "naver",
    contentType: "new_product_review",
    blogId: "who-ami",
    logNo: "",
    title: "T",
    productName: "P",
    affiliateUrl: "https://link.coupang.com/a/x",
    character: "suho",
    channelId: ATLAS_CHANNEL_ID.KOREA_NAVER,
    assetScope: "korea",
    assetNamespace: ".atlas-data/korea-assets",
    masterAssetPath: "public/atlas/characters/ATLAS-SUO-MASTER.png",
    state: "approved",
    images: [
      { id: "img_product_photo_1", role: "product_photo", src: "" },
      { id: "img_suho_usage", role: "body_usage", src: "atlas-generated://kr_policy/img_suho_usage" },
    ],
    ...overrides,
  };
}

test("clean Korea draft passes every blocking policy", () => {
  const r = evaluateKoreaDraft(koreaDraft());
  assert.equal(r.ok, true, JSON.stringify(r.blocking));
});

test("naver_protected_post: logNo 224407589323 is immutable through every path", () => {
  const r = evaluateKoreaDraft(koreaDraft({ contentType: "existing_post_update", logNo: "224407589323" }));
  assert.equal(statusOf(r, "naver_protected_post"), "fail");
  assert.equal(r.errorCode, "NAVER_PROTECTED_TARGET");
  const u = evaluateUnifiedDraft({ channelId: ATLAS_CHANNEL_ID.KOREA_NAVER, character: "suho", logNo: "224407589323" });
  assert.equal(statusOf(u, "naver_protected_post"), "fail");
});

test("naver_required_images: empty Suho body slot blocks; product_photo and optional slots do not", () => {
  const missing = koreaDraft();
  missing.images[1].src = "";
  const r = evaluateKoreaDraft(missing);
  assert.equal(r.errorCode, "NAVER_IMAGE_ASSETS_REQUIRED");
  assert.deepEqual(koreaMissingRequiredImages(missing), ["img_suho_usage"]);
  missing.images[1].optional = true;
  assert.deepEqual(koreaMissingRequiredImages(missing), []);
  missing.images[1].optional = undefined;
  missing.images[1].required = false;
  assert.deepEqual(koreaMissingRequiredImages(missing), []);
});

test("channel_character_lock (Korea): a global Cloudinary asset in a Suho draft blocks", () => {
  const draft = koreaDraft();
  draft.images[1].src = "https://res.cloudinary.com/demo/image/upload/atlas/articles/x/y.webp";
  const r = evaluateKoreaDraft(draft);
  assert.equal(statusOf(r, "channel_character_lock"), "fail");
  assert.equal(r.errorCode, "ATLAS_CHANNEL_ASSET_MISMATCH");
});

test("no_duplicate_publish (Korea): published drafts block re-staging", () => {
  const r = evaluateKoreaDraft(koreaDraft({ state: "published", publishedUrl: "https://blog.naver.com/who-ami/224416535205" }));
  assert.equal(r.errorCode, "ALREADY_PUBLISHED");
});

test("naver_monetized_candidate_only: missing affiliate link is a warning at draft time", () => {
  const r = evaluateKoreaDraft(koreaDraft({ affiliateUrl: "" }));
  assert.equal(statusOf(r, "naver_monetized_candidate_only"), "warn");
  assert.equal(statusOf(evaluateKoreaDraft(koreaDraft()), "naver_monetized_candidate_only"), "pass");
});

// ── Unified drafts ───────────────────────────────────────────────────────────
function unifiedDraft(channelId, overrides = {}) {
  const korea = channelId === ATLAS_CHANNEL_ID.KOREA_NAVER;
  return {
    id: "u1",
    channelId,
    character: korea ? "suho" : "miji",
    assetScope: korea ? "korea" : "global",
    masterAssetPath: korea ? "public/atlas/characters/ATLAS-SUO-MASTER.png" : "public/atlas/characters/ATLAS-MIJI-MASTER.png",
    state: "draft",
    shorts: { script: "text", hook: "h" },
    ...overrides,
  };
}

test("shorts_export_only: video render/upload fields in shorts material block", () => {
  const ok = evaluateUnifiedDraft(unifiedDraft(ATLAS_CHANNEL_ID.KOREA_NAVER));
  assert.equal(statusOf(ok, "shorts_export_only"), "pass");
  const bad = evaluateUnifiedDraft(unifiedDraft(ATLAS_CHANNEL_ID.KOREA_NAVER, { shorts: { script: "t", videoUrl: "https://x/y.mp4" } }));
  assert.equal(statusOf(bad, "shorts_export_only"), "fail");
  assert.equal(bad.errorCode, "SHORTS_EXPORT_ONLY");
});

test("global_editorial_first: a global product draft approved outside Publisher is flagged", () => {
  assert.equal(statusOf(evaluateUnifiedDraft(unifiedDraft(ATLAS_CHANNEL_ID.GLOBAL_BLOGGER)), "global_editorial_first"), "pass");
  const r = evaluateUnifiedDraft(unifiedDraft(ATLAS_CHANNEL_ID.GLOBAL_BLOGGER, { state: "approved" }));
  assert.equal(r.errorCode, "GLOBAL_EDITORIAL_FIRST");
});

test("channel_character_lock (unified): Miji on the Korea channel blocks", () => {
  const r = evaluateUnifiedDraft(unifiedDraft(ATLAS_CHANNEL_ID.KOREA_NAVER, { character: "miji" }));
  assert.equal(r.errorCode, "ATLAS_CHANNEL_ASSET_MISMATCH");
});

// ── Env-enforced ─────────────────────────────────────────────────────────────
test("paid_api_forbidden: image provider is blocked unless ATLAS_ALLOW_PAID_API=1", () => {
  assert.equal(paidApiAllowed({}), false);
  assert.equal(paidApiAllowed({ ATLAS_ALLOW_PAID_API: "1" }), true);
  assert.equal(paidApiAllowed({ ATLAS_ALLOW_PAID_API: "true" }), false, "only the explicit literal 1 opts in");
  const prev = process.env.ATLAS_ALLOW_PAID_API;
  delete process.env.ATLAS_ALLOW_PAID_API;
  try {
    const r = imageProviderReadiness();
    assert.equal(r.ready, false);
    assert.equal(r.errorCode, "PAID_API_FORBIDDEN");
  } finally {
    if (prev !== undefined) process.env.ATLAS_ALLOW_PAID_API = prev;
  }
});

// ── Stored LIVE article: art_021 satisfies every rule except re-publish ─────
test("stored art_021 passes all policies except the re-publish block", () => {
  const file = path.join(process.cwd(), "data", "atlas", "articles.json");
  const article = JSON.parse(fs.readFileSync(file, "utf-8")).articles.find((a) => a.id === "art_021");
  const r = evalGlobal(article);
  assert.deepEqual(r.blocking.map((b) => b.code), ["ALREADY_PUBLISHED"], JSON.stringify(r.blocking));
  assert.equal(statusOf(r, "global_character_identity_review"), "warn");
});

// ── Registry integrity ───────────────────────────────────────────────────────
test("registry: ids and codes are unique, every entry names scope/enforcement/enforcedBy", () => {
  const ids = ATLAS_POLICIES.map((p) => p.id);
  const codes = ATLAS_POLICIES.map((p) => p.code);
  assert.equal(new Set(ids).size, ids.length, "duplicate policy id");
  assert.equal(new Set(codes).size, codes.length, "duplicate errorCode");
  for (const p of ATLAS_POLICIES) {
    assert.ok(p.scope.length > 0, `${p.id} scope`);
    assert.ok(Object.values(ENFORCEMENT).includes(p.enforcement), `${p.id} enforcement`);
    assert.ok(p.enforcedBy.length > 0 && p.title && p.detail, `${p.id} metadata`);
    for (const ref of p.enforcedBy) {
      const filePath = ref.split("#")[0];
      assert.ok(fs.existsSync(path.join(process.cwd(), filePath)), `${p.id}: enforcedBy file missing ${filePath}`);
    }
  }
  assert.equal(getPolicy("nope"), null);
  assert.ok(policiesForChannel(ATLAS_CHANNEL_ID.KOREA_NAVER).some((p) => p.id === "naver_protected_post"));
  assert.ok(summarizePolicies(ATLAS_CHANNEL_ID.GLOBAL_BLOGGER).every((p) => p.id && p.code && p.title && p.enforcement));
});

test("registry: every non-env policy is produced by a validator, and every policy has a test in this file", () => {
  const covered = coveredPolicyIds();
  const source = fs.readFileSync(new URL(import.meta.url), "utf-8");
  for (const p of ATLAS_POLICIES) {
    if (p.enforcement !== ENFORCEMENT.ENV) assert.ok(covered.has(p.id), `${p.id} has no validator check`);
    assert.ok(source.includes(`"${p.id}"`) || source.includes(`${p.id}:`), `${p.id} has no test`);
  }
});
