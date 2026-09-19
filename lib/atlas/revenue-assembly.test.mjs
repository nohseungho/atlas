// Article Assembly Integrity — guards the defect found on art_010 (pjob_004):
// a CHATGPT_HANDOFF body already carries its own figures, FAQ, Sources, and
// disclaimer, and the chrome assembler used to add all of them a second time
// (8 images for a 5-image article, FAQ x2, Sources x2). These tests assert the
// assembled output owns exactly one of each, for the real stored article as
// well as for synthetic bodies, without disabling chrome for classic articles.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildRevenueHtml } from "./revenue-design-engine.js";
import {
  inspectBodyHtml,
  normalizeImageSrc,
  resolveVisualAssetsByPlacement,
  EMBEDDED_PLACEMENT,
} from "./revenue-layout-engine.js";
import { isMeaningfulAlt, validatePackageStructure, validatePackageHtml } from "./chatgpt-handoff.js";

const CLOUD = "https://res.cloudinary.com/demo/image/upload";
const url = (role) => `${CLOUD}/c_fill,f_webp,h_900,q_auto,w_1600/v1785328079/atlas/articles/slug/${role}?_a=BAMAAAX00`;

const countImgs = (html) => (html.match(/<img\b/gi) || []).length;
const countFaq = (html) => (html.match(/<h[23][^>]*>[^<]*(?:\bFAQ\b|Frequently Asked Questions)[^<]*<\/h[23]>/gi) || []).length;
const countSources = (html) => (html.match(/<h[23][^>]*>[^<]*(?:\bSources\b|\bReferences\b)[^<]*<\/h[23]>/gi) || []).length;
const countDisclaimer = (html) => (html.match(/disclaimer/gi) || []).length;

function handoffBody() {
  const figures = ["featured", "context", "comparison", "action", "checklist"]
    .map((r) => `<figure><img src="${url(r)}" alt="A real sentence describing the ${r} visual" /></figure>`)
    .join("\n");
  return `${figures}
<h2>Quick Answer</h2><p>Short direct answer.</p>
<h2>Body Section</h2><p>Prose.</p>
<h2>FAQ</h2><h3>Q one?</h3><p>A one.</p>
<p><em><strong>Disclaimer:</strong> General information only.</em></p>
<h2>Sources &amp; References</h2><ul><li><a href="https://example.org/a">Source A</a></li></ul>`;
}

function handoffArticle() {
  return {
    id: "art_test",
    title: "Emergency Medical Evacuation Insurance",
    category: "Travel Insurance",
    language: "en",
    quickAnswer: "Short direct answer.",
    bodyMarkdown: "",
    faq: [{ question: "Q one?", answer: "A one." }],
    sources: [{ title: "Source A", url: "https://example.org/a" }],
    affiliatePlan: { status: "pending" },
    visualAssets: ["featured", "context", "comparison", "action", "checklist"].map((r) => ({
      key: r,
      placement: EMBEDDED_PLACEMENT,
      alt: `A real sentence describing the ${r} visual`,
      width: 1600,
      height: 900,
      fit: "cover",
      publicUrl: url(r),
    })),
  };
}

test("normalizeImageSrc matches the same asset across transforms and cache busters", () => {
  assert.equal(
    normalizeImageSrc(`${CLOUD}/c_fill,w_1600/v1785328079/atlas/articles/slug/featured?_a=X`),
    normalizeImageSrc(`${CLOUD}/q_auto/v1999999999/atlas/articles/slug/featured`)
  );
  assert.notEqual(normalizeImageSrc(url("featured")), normalizeImageSrc(url("action")));
});

test("inspectBodyHtml reports the sections a handoff body already carries", () => {
  const body = inspectBodyHtml(handoffBody());
  assert.equal(body.hasFaq, true);
  assert.equal(body.hasSources, true);
  assert.equal(body.hasQuickAnswer, true);
  assert.equal(body.hasDisclaimer, true);
  assert.equal(body.imageCount, 5);
  assert.equal(body.hasImage(url("checklist")), true);
  assert.equal(body.hasImage(url("unrelated")), false);
});

test("inspectBodyHtml reports nothing for a plain prose body", () => {
  const body = inspectBodyHtml("<h2>Only Prose</h2><p>No sections here.</p>");
  assert.deepEqual(
    { faq: body.hasFaq, sources: body.hasSources, quick: body.hasQuickAnswer, disc: body.hasDisclaimer, imgs: body.imageCount },
    { faq: false, sources: false, quick: false, disc: false, imgs: 0 }
  );
});

test("placement collisions resolve first-wins instead of silently dropping assets", () => {
  const article = {
    visualAssets: [
      { key: "featured", placement: "afterByline", publicUrl: url("featured") },
      { key: "action", placement: "afterByline", publicUrl: url("action") },
    ],
  };
  const map = resolveVisualAssetsByPlacement(article, "publish");
  assert.equal(map.afterByline.key, "featured");
});

test("embedded assets never enter the placement map", () => {
  const map = resolveVisualAssetsByPlacement(handoffArticle(), "publish");
  assert.deepEqual(Object.keys(map), []);
});

test("handoff article assembles to exactly 5 images / 1 FAQ / 1 Sources / 1 disclaimer", () => {
  const { html } = buildRevenueHtml(handoffArticle(), handoffBody(), { mode: "publish" });
  assert.equal(countImgs(html), 5);
  assert.equal(countFaq(html), 1);
  assert.equal(countSources(html), 1);
  assert.equal(countDisclaimer(html), 1);
});

test("legacy colliding placements still assemble to 5 images (body-scan guard)", () => {
  // art_010 as originally stored: fixed-slot placements that collide AND
  // duplicate images already present in the body.
  const article = handoffArticle();
  const collide = { featured: "afterByline", context: "afterComparisonCriteria", comparison: "afterFaq", action: "afterByline", checklist: "afterFaq" };
  article.visualAssets = article.visualAssets.map((a) => ({ ...a, placement: collide[a.key] }));
  const { html } = buildRevenueHtml(article, handoffBody(), { mode: "publish" });
  assert.equal(countImgs(html), 5);
  assert.equal(countFaq(html), 1);
  assert.equal(countSources(html), 1);
});

test("classic prose article still receives the full FAQ and Sources chrome", () => {
  const article = {
    id: "art_classic",
    title: "Classic Guide",
    category: "Travel Insurance",
    language: "en",
    bodyMarkdown: "## One\n\nText.\n\n## Two\n\nMore text.",
    quickAnswer: "The direct answer.",
    faq: [{ question: "Q?", answer: "A." }],
    sources: [{ title: "Source A", url: "https://example.org/a" }],
    affiliatePlan: { status: "pending" },
    visualAssets: [],
  };
  const { html } = buildRevenueHtml(article, "<h2 id=\"atlas-h2-0\">One</h2><p>Text.</p>", { mode: "publish" });
  assert.equal(countFaq(html), 1, "FAQ chrome still renders for a plain body");
  // The chrome Sources box labels itself with a <p>, not a heading, so it is
  // matched by its label and link rather than by countSources().
  assert.ok(html.includes(">Sources</p>"), "Sources chrome still renders");
  assert.ok(html.includes("https://example.org/a"), "source link still renders");
  assert.ok(html.includes("The direct answer."), "quick answer chrome still renders");
});

test("isMeaningfulAlt rejects role placeholders and accepts real descriptions", () => {
  for (const bad of ["featured image", "context image", "comparison", "image", "photo 2", "", "img"]) {
    assert.equal(isMeaningfulAlt(bad), false, `expected "${bad}" to be rejected`);
  }
  assert.equal(isMeaningfulAlt("Checklist of the eight policy terms to verify before buying coverage"), true);
});

test("validatePackageStructure rejects placeholder and duplicate alt text", () => {
  const base = {
    schemaVersion: "atlas-package/1", jobId: "pjob_x", blogId: "blog_001", moneyHunterId: "kw_x",
    title: "T", slug: "t", metaDescription: "x".repeat(155), coreQuestion: "c", searchIntentKey: "s",
    topicEntities: ["a"], desiredReaderAction: "d", researchQuery: "q", researchedAt: "2026-07-29",
    trendEvidence: "t", purchaseIntent: "p", affiliatePotential: "a", contentGap: "g",
    sources: [{ url: "https://a.org" }, { url: "https://b.org" }, { url: "https://c.org" }],
    faq: [1, 2, 3, 4, 5].map((n) => ({ question: `q${n}`, answer: `a${n}` })),
    articleHtml: "<p>x</p>",
  };
  const roles = ["featured", "context", "comparison", "action", "checklist"];

  const placeholder = validatePackageStructure({ ...base, images: roles.map((r) => ({ role: r, alt: `${r} image` })) });
  assert.equal(placeholder.ok, false);
  assert.equal(placeholder.issues.filter((i) => i.includes("alt must be descriptive")).length, 5);

  const dupes = validatePackageStructure({ ...base, images: roles.map((r) => ({ role: r, alt: "The same descriptive sentence for every slot" })) });
  assert.equal(dupes.ok, false);
  assert.ok(dupes.issues.some((i) => i.includes("unique per image")));

  const good = validatePackageStructure({ ...base, images: roles.map((r) => ({ role: r, alt: `A distinct descriptive sentence about the ${r} visual` })) });
  assert.equal(good.ok, true, good.issues.join(" | "));
});

test("validatePackageHtml requires exactly one FAQ and one Sources section", () => {
  const twice = validatePackageHtml(`${handoffBody()}<h2>FAQ</h2><h2>Sources</h2>`);
  assert.equal(twice.ok, false);
  assert.ok(twice.issues.some((i) => i.includes("FAQ section must appear exactly once")));
  assert.ok(twice.issues.some((i) => i.includes("Sources section must appear exactly once")));
  assert.equal(validatePackageHtml(handoffBody()).ok, true);
});

// ─── Real stored articles (pjob_003 → art_009, pjob_004 → art_010) ───────────
// Both were imported through the CHATGPT_HANDOFF route, so both shipped a body
// that already carried its own figures/FAQ/Sources. The assertions below are
// the finished-article contract, applied identically to each — no per-id rules.
for (const id of ["art_009", "art_010"]) {
  test(`stored ${id} assembles to exactly 5 images / 1 FAQ / 1 Sources / 1 disclaimer`, () => {
    const file = path.join(process.cwd(), "data", "atlas", "articles.json");
    const article = JSON.parse(fs.readFileSync(file, "utf-8")).articles.find((a) => a.id === id);
    assert.ok(article, `${id} must exist`);

    const bodyHtml = article.bodyMarkdown ? "" : article.bodyHtml;
    const { html } = buildRevenueHtml(article, bodyHtml, { mode: "publish" });
    assert.equal(countImgs(html), 5, `assembled ${id} must carry exactly 5 images`);
    assert.equal(countFaq(html), 1, `assembled ${id} must carry exactly 1 FAQ section`);
    assert.equal(countSources(html), 1, `assembled ${id} must carry exactly 1 Sources section`);
    assert.equal(countDisclaimer(html), 1, `assembled ${id} must carry exactly 1 disclaimer`);
    assert.equal((html.match(/<h1\b/gi) || []).length, 0, `assembled ${id} must carry no <h1>`);

    const alts = Array.from(html.matchAll(/<img[^>]*\balt=["']([^"']*)["']/gi), (m) => m[1]);
    assert.equal(alts.length, 5);
    for (const alt of alts) assert.equal(isMeaningfulAlt(alt), true, `alt not descriptive: "${alt}"`);
    assert.equal(new Set(alts).size, 5, "each image needs its own alt text");

    assert.equal(article.visualAssets.length, 5);
    assert.equal(new Set(article.visualAssets.map((a) => a.publicUrl)).size, 5, "5 distinct Cloudinary URLs");
  });
}

// ─── art_021 (classic markdown body, section-placed Miji assets) ─────────────
// Unlike the handoff articles above, art_021 keeps its figures out of the body
// and relies on afterByline / afterSection:<H2> placements. This mirrors what
// lib/html-exporter.js does (bodyMarkdown → markdownToHtml → buildRevenueHtml)
// closely enough to check placement, dedupe and the trust note before publish.
function minimalMarkdownToHtml(markdown) {
  let h2 = 0;
  return String(markdown || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.startsWith("### ") ? `<h3>${line.slice(4)}</h3>`
        : line.startsWith("## ") ? `<h2 id="atlas-h2-${h2++}">${line.slice(3)}</h2>`
        : `<p>${line}</p>`
    )
    .join("\n");
}

test("stored art_021 assembles to 5 placed images / 1 FAQ / 1 Sources / 1 disclaimer and no affiliate surface", () => {
  const file = path.join(process.cwd(), "data", "atlas", "articles.json");
  const article = JSON.parse(fs.readFileSync(file, "utf-8")).articles.find((a) => a.id === "art_021");
  assert.ok(article, "art_021 must exist");
  assert.equal(article.affiliatePlan?.status, "pending", "art_021 has no active affiliate plan");
  assert.equal(article.visualAssets.length, 5);
  for (const asset of article.visualAssets) {
    assert.equal(asset.required, true, `${asset.key} stays required`);
    assert.match(asset.localSrc, /^\/images\/articles\/europe-ees-travel-checklist-2026\/[a-z]+\.png$/, `${asset.key} localSrc`);
  }

  // art_021 is LIVE: every asset carries its real Cloudinary URL, so publish mode renders as stored.
  for (const asset of article.visualAssets) assert.match(asset.publicUrl, /^https:\/\/res\.cloudinary\.com\//, `${asset.key} publicUrl`);
  const { html } = buildRevenueHtml(article, minimalMarkdownToHtml(article.bodyMarkdown), { mode: "publish" });

  const srcs = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi), (m) => m[1]);
  assert.equal(srcs.length, 5, "every placed asset renders exactly once");
  assert.equal(new Set(srcs).size, 5, "no image is injected twice");
  assert.equal(countFaq(html), 1);
  assert.equal(countSources(html), 1);
  assert.equal(countDisclaimer(html), 1);
  assert.equal(/See Details|Check the Latest Details|Affiliate Disclosure/.test(html), false, "no CTA or affiliate disclosure without an active plan");
  assert.equal(/Any affiliate relationship/.test(html), false, "default affiliate-flavoured trust note is replaced");
  assert.ok(html.includes("European Commission sources"), "article-level independence note renders");

  // featured is the hero (heroImage) and must not repeat as its section figure; the rest land in their own section.
  const order = srcs.map((s) => s.replace(/\?.*$/, "").split("/").pop().replace(/\.\w+$/, ""));
  assert.deepEqual(order, ["featured", "border", "comparison", "offline", "checklist"]);

  // Local preview resolves assets to localSrc; the hero dedupe must hold there too.
  const local = buildRevenueHtml(article, minimalMarkdownToHtml(article.bodyMarkdown), { mode: "local" }).html;
  const localSrcs = Array.from(local.matchAll(/<img[^>]+src=["']([^"']+)["']/gi), (m) => m[1]);
  assert.equal(localSrcs.length, 5, "local preview renders each asset once (hero + 4 sections)");
  assert.equal(localSrcs.filter((s) => /featured/.test(s)).length, 1, "featured appears once in local preview");
});

test("trust.independenceNote falls back to the chrome default when absent", () => {
  const article = { id: "art_x", title: "T", category: "Travel Insurance", language: "en", bodyMarkdown: "## One\n\nText.", faq: [], sources: [], affiliatePlan: { status: "pending" }, visualAssets: [], trust: { methodology: "Method." } };
  const { html } = buildRevenueHtml(article, '<h2 id="atlas-h2-0">One</h2><p>Text.</p>', { mode: "publish" });
  assert.ok(html.includes("Any affiliate relationship"), "chrome default still used when no override");
});

// ─── Snippet quality: the body's own Quick Answer leads the post ─────────────
// Blogger builds og:description and the home excerpt from the first text in
// the post, so a body that opens with "## Quick Answer" must render that
// section before the TOC/Key Takeaways chrome. Hand-off bodies (no atlas-h2
// ids) and bodies without a Quick Answer keep their order.
test("markdown body opening with Quick Answer is hoisted above the TOC chrome", () => {
  const article = {
    id: "art_lead", title: "Lead Test", category: "Travel", language: "en",
    bodyMarkdown: "## Quick Answer\n\nThe direct answer.\n\n## Second\n\nMore.\n\n## Third\n\nEnd.",
    keyTakeaways: ["One takeaway."], faq: [], sources: [], affiliatePlan: { status: "pending" }, visualAssets: [],
  };
  const body = '<h2 id="atlas-h2-0">Quick Answer</h2>\n<p>The direct answer.</p>\n<h2 id="atlas-h2-1">Second</h2>\n<p>More.</p>\n<h2 id="atlas-h2-2">Third</h2>\n<p>End.</p>';
  const { html, sections } = buildRevenueHtml(article, body, { mode: "publish" });
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.ok(text.startsWith("Quick Answer The direct answer."), `post text must open with the answer, got: ${text.slice(0, 60)}`);
  assert.ok(html.indexOf("The direct answer.") < html.indexOf("Table of Contents"), "answer precedes TOC");
  assert.ok(html.indexOf("Table of Contents") < html.indexOf('<h2 id="atlas-h2-1"'), "TOC precedes the second section");
  assert.equal((html.match(/The direct answer\./g) || []).length, 1, "lead section is not duplicated");
  assert.ok(sections.includes("leadSection"));
});

test("bodies without a leading Quick Answer are not split", () => {
  const article = { id: "art_nolead", title: "T", category: "Travel", language: "en", bodyMarkdown: "## One\n\nText.\n\n## Two\n\nMore.", quickAnswer: "Chrome answer.", faq: [], sources: [], affiliatePlan: { status: "pending" }, visualAssets: [] };
  const body = '<h2 id="atlas-h2-0">One</h2><p>Text.</p><h2 id="atlas-h2-1">Two</h2><p>More.</p>';
  const { html, sections } = buildRevenueHtml(article, body, { mode: "publish" });
  assert.equal(sections.includes("leadSection"), false);
  assert.ok(html.indexOf("Chrome answer.") < html.indexOf('<h2 id="atlas-h2-0"'), "chrome quick answer box still leads");
});
