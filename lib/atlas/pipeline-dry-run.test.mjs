// End-to-end dry run: IDEA → SELECTED → BRIEF_READY → DRAFT_READY → QA_PASSED
// against the REAL data/atlas files (read-only — this test writes nothing and
// never touches Blogger). It stops at QA_PASSED on purpose: APPROVED onward is
// a human action, and publishing is never triggered from a test.
//
// The draft used here is an explicit FIXTURE standing in for what ChatGPT would
// return. It is not presented as generated content anywhere.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { STATE, createEntry, transition } from "./content-pipeline-state.js";
import { prepareDailyBrief } from "./daily-brief.js";
import { buildSeoPackage } from "./seo-engine.js";
import { runContentQa } from "./content-qa.js";
import { validatePackageStructure, validatePackageHtml, checkPackageDedup, PACKAGE_SCHEMA } from "./chatgpt-handoff.js";

const DATA = path.join(process.cwd(), "data", "atlas");
const readData = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), "utf-8"));

const NOW = "2026-08-06T00:00:00.000Z";
const pngBase64 = (n = 400) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, 7)]).toString("base64");

// The stand-in for ChatGPT's reply, built to satisfy the prompt's contract.
function fixtureDraft({ jobId, brief, links }) {
  const alts = {
    featured: "Traveler comparing baggage delay paperwork at an airline service desk",
    context: "Airport carousel with unclaimed suitcases after a delayed flight",
    comparison: "Chart contrasting domestic and international baggage liability limits",
    action: "Passenger completing a written property irregularity report form",
    checklist: "Printed checklist of receipts to keep while waiting for a delayed bag",
  };
  const html = [
    "<h2>Quick Answer</h2><p>Carriers handle delayed bags under published rules, and what a traveler recovers usually depends on documented expenses.</p>",
    "<!--ATLAS_IMAGE:featured-->",
    "<h2>The Money at Risk</h2><p>Interim costs accumulate across the days a bag is missing.</p>",
    "<!--ATLAS_IMAGE:context-->",
    '<h2>Situation Comparison</h2><div style="overflow-x:auto;"><table><tr><th>Route</th><th>Rule set</th></tr><tr><td>Domestic</td><td>DOT rules</td></tr><tr><td>International</td><td>Montreal Convention</td></tr></table></div>',
    "<!--ATLAS_IMAGE:comparison-->",
    "<h2>What to Do Before You Travel</h2><p>Record contents and keep essentials in a carry-on.</p>",
    "<!--ATLAS_IMAGE:action-->",
    "<h2>Common Mistakes</h2><p>Discarding receipts typically limits what a carrier will reimburse.</p>",
    "<!--ATLAS_IMAGE:checklist-->",
    "<h2>FAQ</h2><p>Five questions follow below.</p>",
    "<h2>Sources &amp; References</h2><p>Read the disclaimer before acting on this guide.</p>",
    "<h2>Related ATLAS Guides</h2><ul></ul>",
  ].join("\n");

  return {
    schemaVersion: PACKAGE_SCHEMA,
    jobId,
    blogId: brief.blogId,
    moneyHunterId: brief.keywordId,
    title: "Delayed Baggage Claim Rules U.S. Travelers Should Know Before Departure",
    slug: "delayed-baggage-claim-rules-us-travelers",
    metaDescription:
      "How delayed baggage claims work for U.S. travelers: which rules apply on domestic and international routes, what carriers ask for, and which receipts to keep.".slice(0, 160),
    coreQuestion: brief.coreQuestion,
    searchIntentKey: "baggage-delay-claim-process",
    topicEntities: ["delayed baggage", "property irregularity report"],
    desiredReaderAction: "File a claim with the right documents",
    researchQuery: "delayed baggage claim rules DOT Montreal Convention",
    researchedAt: "2026-08-06",
    trendEvidence: "UNKNOWN",
    purchaseIntent: "low",
    affiliatePotential: "none",
    contentGap: "No ATLAS guide covers baggage delay claims yet.",
    tags: ["baggage", "passenger rights"],
    sources: [
      { title: "DOT — Baggage", url: "https://www.transportation.gov/individuals/aviation-consumer-protection/baggage" },
      { title: "TSA — Travel", url: "https://www.tsa.gov/travel/security-screening" },
      { title: "U.S. Dept of State", url: "https://travel.state.gov/en/international-travel/planning/guidance/insurance.html" },
    ],
    faq: Array.from({ length: 5 }, (_, i) => ({ question: `Baggage question ${i + 1}?`, answer: "Confirm the carrier's published conditions of carriage." })),
    articleHtml: html,
    images: ["featured", "context", "comparison", "action", "checklist"].map((role) => ({
      role, mimeType: "image/png", base64: pngBase64(), alt: alts[role],
    })),
    links,
  };
}

test("dry run: a real unused keyword walks IDEA → QA_PASSED without touching Blogger", () => {
  const keywords = readData("keywords.json").keywords || [];
  const articles = readData("articles.json").articles || [];

  // ── IDEA ────────────────────────────────────────────────────────────────
  let entry = createEntry({ id: "cp_dryrun", now: NOW });
  assert.equal(entry.state, STATE.IDEA);

  // ── SELECTED + BRIEF_READY ──────────────────────────────────────────────
  const prepared = prepareDailyBrief({ keywords, articles, jobId: "pjob_dryrun", now: NOW });
  assert.equal(prepared.ok, true, `no eligible keyword in the real DB: ${prepared.reason || ""}`);
  assert.ok(prepared.keyword.id, "a real keyword id was selected");
  assert.ok(prepared.promptText.includes(prepared.brief.keyword), "the prompt names the selected keyword");

  entry = transition(entry, STATE.SELECTED, { note: prepared.keyword.id, patch: { keywordId: prepared.keyword.id, keyword: prepared.brief.keyword }, now: NOW }).entry;
  const briefStep = transition(entry, STATE.BRIEF_READY, { patch: { brief: prepared.brief }, now: NOW });
  assert.equal(briefStep.ok, true);
  entry = briefStep.entry;

  // Internal-link targets must all be URLs that are genuinely live right now.
  const liveUrls = new Set(articles.filter((a) => a.status === "published" && a.publishedUrl).map((a) => a.publishedUrl));
  assert.ok(entry.brief.internalLinkTargets.length >= 2, "the real corpus offers at least 2 link targets");
  assert.ok(entry.brief.internalLinkTargets.every((l) => liveUrls.has(l.url)), "every brief link target is a real live URL");

  // ── DRAFT_READY (fixture stands in for the ChatGPT reply) ───────────────
  const draft = fixtureDraft({ jobId: "pjob_dryrun", brief: entry.brief, links: entry.brief.internalLinkTargets });

  const structure = validatePackageStructure(draft, { requestJobId: "pjob_dryrun", blogId: "blog_001" });
  assert.equal(structure.ok, true, structure.issues.join(" / "));
  const htmlQa = validatePackageHtml(draft.articleHtml);
  assert.equal(htmlQa.ok, true, htmlQa.issues.join(" / "));
  assert.equal(checkPackageDedup(draft, articles).verdict, "PASS");

  const draftStep = transition(entry, STATE.DRAFT_READY, { patch: { articleId: "art_dryrun" }, now: NOW });
  assert.equal(draftStep.ok, true);
  entry = draftStep.entry;

  // ── SEO derivation ──────────────────────────────────────────────────────
  const seo = buildSeoPackage(
    { title: draft.title, slug: draft.slug, keyword: prepared.brief.keyword, metaDescription: draft.metaDescription, tags: draft.tags },
    { articles },
  );
  assert.equal(seo.ok, true, seo.issues.join(" / "));
  assert.ok(seo.labels.length >= 2 && seo.labels.length <= 4);
  assert.ok(seo.internalLinks.length >= 2 && seo.internalLinks.length <= 4);
  assert.ok(seo.internalLinks.every((l) => liveUrls.has(l.url)));
  assert.ok(!articles.some((a) => a.slug === seo.slug), "the derived slug collides with nothing in the real corpus");

  // ── QA_PASSED ───────────────────────────────────────────────────────────
  const assembled = {
    id: "art_dryrun",
    title: draft.title,
    slug: seo.slug,
    metaDescription: seo.metaDescription,
    sources: draft.sources,
    internalLinks: seo.internalLinks,
    jsonLd: seo.jsonLd,
    bodyHtml: `${draft.articleHtml.replace(/<!--ATLAS_IMAGE:(\w+)-->/g, (_, role) =>
      `<img src="https://res.cloudinary.com/dmfbj4tu/image/upload/x/${role}" alt="${draft.images.find((i) => i.role === role).alt}" style="width:100%;height:auto;" />`,
    )}\n${seo.relatedGuidesHtml}`,
    visualAssets: draft.images.map((i) => ({
      key: i.role, alt: i.alt, publicUrl: `https://res.cloudinary.com/dmfbj4tu/image/upload/x/${i.role}`,
    })),
  };

  const qa = runContentQa(assembled, { articles });
  assert.equal(qa.pass, true, JSON.stringify(qa.blocking, null, 1));
  assert.equal(qa.gates.canApprove, true);
  assert.equal(qa.gates.canPublish, false, "the dry run never unlocks publishing");
  assert.ok(qa.needsHumanReview.length >= 1, "fact-checking is still handed to a human");

  const qaStep = transition(entry, STATE.QA_PASSED, { patch: { articleId: "art_dryrun" }, now: NOW });
  assert.equal(qaStep.ok, true);
  entry = qaStep.entry;

  assert.equal(entry.state, STATE.QA_PASSED);
  assert.deepEqual(
    entry.history.map((h) => h.state),
    [STATE.IDEA, STATE.SELECTED, STATE.BRIEF_READY, STATE.DRAFT_READY, STATE.QA_PASSED],
  );
});

test("dry run: a QA failure blocks the QA_PASSED transition and names the reason", () => {
  const articles = readData("articles.json").articles || [];
  const broken = {
    id: "art_broken",
    title: "Incomplete Guide",
    metaDescription: "too short",
    bodyHtml: "<h2>Quick Answer</h2><p>TODO: finish this. You will be covered for everything.</p>",
    sources: [{ url: "https://some-affiliate-blog.example/x" }],
    internalLinks: [],
    visualAssets: [],
  };
  const qa = runContentQa(broken, { articles });

  assert.equal(qa.pass, false);
  assert.equal(qa.gates.canApprove, false);
  const ids = qa.blocking.map((b) => b.id);
  for (const expected of ["metaDescription", "placeholder", "noGuarantee", "authoritySources", "internalLinks", "images"]) {
    assert.ok(ids.includes(expected), `${expected} must be reported as blocking`);
  }
  assert.ok(qa.blocking.every((b) => b.reason.length > 0), "every blocker states why");
});

test("dry run: the real live corpus is untouched by this test", () => {
  const articles = readData("articles.json").articles || [];
  const published = articles.filter((a) => a.status === "published");
  assert.equal(published.length, 8, "the 8 live posts are still recorded");
  assert.ok(published.every((a) => /^https:\/\/atlas-money-2026\.blogspot\.com\//.test(a.publishedUrl)));
  assert.ok(!articles.some((a) => a.id === "art_dryrun"), "the dry run wrote nothing");
});
