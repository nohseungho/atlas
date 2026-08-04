import test from "node:test";
import assert from "node:assert/strict";
import {
  automationMode, buildHandoffRequest, validateImageBase64,
  validatePackageStructure, validatePackageHtml, checkPackageDedup,
  IMAGE_ROLES, PACKAGE_SCHEMA,
  buildKeywordRequest, validateKeywordCandidate, checkKeywordDedup, validateKeywordPackage,
  KEYWORD_PACKAGE_SCHEMA,
} from "./chatgpt-handoff.js";

function pngBase64(bytes = 400) {
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([head, Buffer.alloc(bytes, 1)]).toString("base64");
}

function validPackage() {
  return {
    schemaVersion: PACKAGE_SCHEMA, jobId: "pjob_010", blogId: "blog_001", moneyHunterId: "kw_x",
    title: "How to File a Travel Insurance Claim After a Medical Emergency Abroad",
    slug: "how-to-file-travel-insurance-claim-medical-emergency-abroad",
    metaDescription: "A step-by-step guide to filing a travel insurance claim after a medical emergency abroad, including the documents, timelines, and mistakes to avoid.",
    coreQuestion: "how to file a claim after a medical emergency abroad",
    searchIntentKey: "informational", topicEntities: ["insurance claim", "medical emergency"],
    desiredReaderAction: "file a claim", researchQuery: "travel insurance claim medical emergency abroad",
    researchedAt: "2026-07-27T00:00:00Z", trendEvidence: "rising searches", purchaseIntent: "high",
    affiliatePotential: "medium", contentGap: "no existing claim-filing guide",
    sources: [{ url: "https://content.naic.org/x" }, { url: "https://www.iii.org/y" }, { url: "https://travel.state.gov/z" }],
    faq: [1, 2, 3, 4, 5].map((n) => ({ question: `q${n}`, answer: `a${n}` })),
    articleHtml: masterHtml(),
    // Each image carries its own descriptive alt — the import no longer
    // substitutes a "<role> image" placeholder when alt is missing.
    images: IMAGE_ROLES.map((role) => ({
      role, mimeType: "image/png", filename: `${role}.png`, base64: pngBase64(),
      alt: `A distinct descriptive sentence about the ${role} visual`,
    })),
  };
}

// Minimal body that satisfies the MASTER contract: exactly one FAQ section,
// one Sources section, and one disclaimer.
function masterHtml(extra = "") {
  return `<h2>Quick Answer</h2><p>Medical disclaimer: informational only.</p>` +
    `<h2>FAQ</h2><h3>q1</h3><p>a1</p>` +
    `<h2>Sources &amp; References</h2><ul><li><a href="https://travel.state.gov/z">Source</a></li></ul>` +
    `<!--ATLAS_IMAGE:featured-->${extra}`;
}

test("automationMode defaults to CHATGPT_HANDOFF (no env)", () => {
  delete process.env.ATLAS_AUTOMATION_MODE;
  assert.equal(automationMode(), "CHATGPT_HANDOFF");
});

test("buildHandoffRequest carries no secrets and 5 image roles", () => {
  const req = buildHandoffRequest({ jobId: "pjob_010", blog: { id: "blog_001", name: "ATLAS Money Blog 01" }, candidate: { id: "kw_x", keyword: "travel insurance claim" }, existingArticles: [{ id: "art_002", title: "T", slug: "t", searchIntent: "informational", status: "published" }] });
  const json = JSON.stringify(req);
  assert.equal(req.schemaVersion, "atlas-request/1");
  assert.equal(req.imageRoles.length, 5);
  assert.ok(!/bloggerBlogId|access_token|refresh_token|CLOUDINARY_URL|cloudinary:\/\//i.test(json));
});

test("validateImageBase64: real PNG passes, garbage fails, mime mismatch fails", () => {
  assert.equal(validateImageBase64("image/png", pngBase64()).ok, true);
  assert.equal(validateImageBase64("image/png", Buffer.from("not an image at all").toString("base64")).ok, false);
  assert.equal(validateImageBase64("image/webp", pngBase64()).ok, false);
});

test("validatePackageStructure: valid package passes; jobId/blogId mismatch fails", () => {
  const pkg = validPackage();
  assert.equal(validatePackageStructure(pkg, { requestJobId: "pjob_010", blogId: "blog_001" }).ok, true);
  assert.equal(validatePackageStructure(pkg, { requestJobId: "pjob_999", blogId: "blog_001" }).ok, false);
  const bad = { ...validPackage(), faq: [1, 2, 3] };
  assert.ok(validatePackageStructure(bad, {}).issues.some((i) => i.includes("faq")));
});

test("validatePackageHtml: rejects fence/h1/data-url/placeholder and wrong disclaimer count", () => {
  assert.equal(validatePackageHtml(masterHtml()).ok, true);
  assert.equal(validatePackageHtml("```html").ok, false);
  assert.equal(validatePackageHtml(`<h1>x</h1>${masterHtml()}`).ok, false);
  assert.equal(validatePackageHtml(`<img src="data:image/png;base64,AAA">${masterHtml()}`).ok, false);
  assert.equal(validatePackageHtml("<p>no safety note here</p>").ok, false); // 0 disclaimer occurrences
  // A body missing its FAQ / Sources section is rejected before assembly.
  assert.ok(validatePackageHtml("<h2>x</h2><p>disclaimer</p>").issues.some((i) => i.includes("FAQ section")));
  assert.ok(validatePackageHtml("<h2>x</h2><p>disclaimer</p>").issues.some((i) => i.includes("Sources section")));
});

test("checkPackageDedup: exact title FAIL, semantic dup FAIL, borderline REVIEW, distinct PASS", () => {
  const existing = [{
    id: "art_003", title: "Travel Medical Insurance vs. Trip Insurance", slug: "travel-medical-insurance-vs-trip-insurance",
    searchIntentKey: "informational", topicEntities: ["travel insurance", "medical insurance"], desiredReaderAction: "compare",
    coreQuestion: "difference between travel medical and trip insurance",
  }];
  assert.equal(checkPackageDedup({ title: "Travel Medical Insurance vs. Trip Insurance", slug: "x" }, existing).verdict, "FAIL");
  const dup = checkPackageDedup({ title: "Medical vs trip insurance explained", slug: "y", searchIntentKey: "informational", topicEntities: ["travel insurance", "medical insurance"], desiredReaderAction: "compare", coreQuestion: "compare travel medical and trip insurance" }, existing);
  assert.equal(dup.verdict, "FAIL");
  const review = checkPackageDedup({ title: "When does travel insurance cover a cruise?", slug: "z", searchIntentKey: "informational", topicEntities: ["travel insurance"], desiredReaderAction: "learn", coreQuestion: "cruise coverage" }, existing);
  assert.equal(review.verdict, "DUPLICATE_REVIEW_REQUIRED");
  const pass = checkPackageDedup({ title: "How to pack a travel first-aid kit", slug: "kit", searchIntentKey: "informational", topicEntities: ["first-aid kit"], desiredReaderAction: "pack", coreQuestion: "what to pack" }, existing);
  assert.equal(pass.verdict, "PASS");
});

// ── Keyword discovery handoff ──
function kwCandidate(over = {}) {
  return {
    keyword: "does travel insurance cover a cruise medical evacuation",
    category: "Travel Insurance",
    coreQuestion: "does travel insurance cover cruise medical evacuation",
    searchIntentKey: "informational",
    topicEntities: ["cruise", "medical evacuation"],
    desiredReaderAction: "check coverage",
    commercialIntent: "medium", affiliatePotential: "medium", competitionLevel: "medium",
    trendEvidence: "seasonal rise", sources: ["https://content.naic.org/x"],
    ...over,
  };
}

test("buildKeywordRequest: English-only, Blog 01, no secrets", () => {
  const req = buildKeywordRequest({ jobId: "kwreq_1", blog: { id: "blog_001", name: "ATLAS Money Blog 01" }, existingArticles: [{ id: "art_002", title: "T", slug: "t" }], existingCandidates: [{ id: "kw_001", keyword: "자동차 보험 비교", category: "자동차 보험", status: "idea" }] });
  assert.equal(req.schemaVersion, "atlas-keyword-request/1");
  assert.equal(req.englishOnly, true);
  assert.ok(!/bloggerBlogId|access_token|refresh_token|CLOUDINARY_URL|cloudinary:\/\//i.test(JSON.stringify(req)));
});

test("validateKeywordCandidate: valid English travel candidate passes", () => {
  assert.equal(validateKeywordCandidate(kwCandidate()).ok, true);
});

test("validateKeywordCandidate: rejects Korean, K-Beauty, missing sources", () => {
  assert.equal(validateKeywordCandidate(kwCandidate({ keyword: "해외 여행자 보험 비교" })).ok, false);
  assert.equal(validateKeywordCandidate(kwCandidate({ keyword: "korean sunscreen for travel", category: "K-Beauty" })).ok, false);
  assert.equal(validateKeywordCandidate(kwCandidate({ keyword: "cheapest car insurance abroad", category: "Auto" })).ok, false);
  assert.equal(validateKeywordCandidate(kwCandidate({ sources: [] })).ok, false);
});

test("checkKeywordDedup: semantic dup FAIL, distinct PASS", () => {
  const existing = [{ id: "art_003", title: "Travel Medical Insurance vs. Trip Insurance", slug: "travel-medical-insurance-vs-trip-insurance", searchIntentKey: "informational", topicEntities: ["travel insurance", "medical insurance"], desiredReaderAction: "compare", coreQuestion: "difference travel medical vs trip" }];
  const dup = checkKeywordDedup({ keyword: "compare travel medical and trip insurance", searchIntentKey: "informational", topicEntities: ["travel insurance", "medical insurance"], desiredReaderAction: "compare", coreQuestion: "compare travel medical vs trip" }, existing, []);
  assert.equal(dup.verdict, "FAIL");
  assert.equal(checkKeywordDedup(kwCandidate(), existing, []).verdict, "PASS");
});

test("validateKeywordPackage: partitions accepted/rejected, idempotent on existing keyword", () => {
  const pkg = {
    schemaVersion: KEYWORD_PACKAGE_SCHEMA, jobId: "kwreq_1", blogId: "blog_001",
    candidates: [
      kwCandidate(), // valid
      kwCandidate({ keyword: "해외여행보험 추천" }), // Korean → rejected
      kwCandidate({ keyword: "travel first aid kit essentials", category: "Travel Health", topicEntities: ["first aid kit"], coreQuestion: "what to pack", desiredReaderAction: "pack" }), // valid distinct
    ],
  };
  const r1 = validateKeywordPackage(pkg, { requestJobId: "kwreq_1", blogId: "blog_001", existingArticles: [], existingCandidates: [] });
  assert.equal(r1.ok, true);
  assert.equal(r1.accepted.length, 2);
  assert.ok(r1.rejected.some((x) => /해외여행보험/.test(x.keyword)));

  // idempotency: the same keywords already in DB → none accepted on re-register.
  const existingCandidates = r1.accepted.map((c, i) => ({ id: `kw_${i}`, keyword: c.keyword, status: "idea" }));
  const r2 = validateKeywordPackage(pkg, { requestJobId: "kwreq_1", blogId: "blog_001", existingArticles: [], existingCandidates });
  assert.equal(r2.accepted.length, 0);

  // jobId mismatch is a package-level error.
  assert.equal(validateKeywordPackage(pkg, { requestJobId: "other" }).ok, false);
});
