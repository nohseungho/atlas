import test from "node:test";
import assert from "node:assert/strict";
import {
  DISASTER_AXES,
  DISASTER_SEEDS,
  DISASTER_CATEGORY_LABEL,
  DISASTER_MASTER_SECTIONS,
  DISASTER_PIN_TEMPLATES,
  DISASTER_PRODUCT_CATEGORIES,
  DONATION_DISCLOSURE,
  DONATION_MATCHING,
  OFFICIAL_RELIEF_ORGS,
  AFFILIATE_FORBIDDEN_SECTIONS,
  DONATION_FORBIDDEN_SECTIONS,
  detectDisasterAxis,
  isDisasterText,
  disasterAxis,
  donationMatchingActive,
  splitDisasterSections,
  suggestProductCategories,
  suggestProductsForTopic,
  suggestPinBoards,
  checkDisasterSafety,
} from "./disaster-scope.js";
import { CONTENT_AXES, AXIS_IDS, EDITORIAL_SEEDS, detectScope } from "./atlas-scope.js";
import { buildRecommendations, topicSignature, signatureCollision } from "./recommendation-engine.js";
import { nicheMatches } from "./money-hunter-select.js";
import { buildHandoffRequest, MASTER_SECTIONS } from "./chatgpt-handoff.js";
import { classifyCluster, isAuthoritySource } from "./seo-engine.js";
import { buildVariants, VARIANTS, DISASTER_VARIANTS, isDisasterArticle } from "./traffic-kit.js";
import { runContentQa } from "./content-qa.js";

// ─── the category exists in the system ───────────────────────────────────────

test("the 6 disaster axes are registered as real ATLAS content axes", () => {
  assert.equal(DISASTER_AXES.length, 6);
  for (const axis of DISASTER_AXES) {
    assert.ok(AXIS_IDS.has(axis.id), `${axis.id} missing from AXIS_IDS`);
    assert.ok(CONTENT_AXES.some((a) => a.id === axis.id && a.label === axis.label));
  }
  // 10 travel + 5 wellness + 6 disaster; nothing displaced.
  assert.equal(CONTENT_AXES.length, 21);
  assert.ok(AXIS_IDS.has("international-travel-insurance"));
  assert.ok(AXIS_IDS.has("wellness-travel-fitness"));
});

test("every launch seed is in the shared catalog and sits on a disaster axis", () => {
  assert.ok(DISASTER_SEEDS.length >= 15);
  for (const seed of DISASTER_SEEDS) {
    assert.ok(EDITORIAL_SEEDS.includes(seed), `${seed.title} not merged`);
    assert.ok(AXIS_IDS.has(seed.axis), `${seed.title} has unknown axis ${seed.axis}`);
    assert.ok(seed.searchIntent && seed.reason && seed.type);
  }
  assert.equal(new Set(DISASTER_SEEDS.map((s) => s.title)).size, DISASTER_SEEDS.length);
  // Every axis has at least one way in.
  for (const axis of DISASTER_AXES.filter((a) => a.id !== "disaster-wildfire-evacuation")) {
    assert.ok(DISASTER_SEEDS.some((s) => s.axis === axis.id), `${axis.id} has no seed`);
  }
});

// ─── detection never steals an existing cluster ──────────────────────────────

test("detectScope routes preparedness topics to a disaster axis", () => {
  assert.equal(detectScope("How to Build a Go-Bag You Can Grab in Two Minutes").axis, "disaster-emergency-kits");
  assert.equal(detectScope("A Household Checklist for Hurricane and Typhoon Season").axis, "disaster-storm-hurricane");
  assert.equal(detectScope("How to Get Through a Multi-Day Power Outage at Home").axis, "disaster-power-outage");
  assert.equal(detectScope("How to Build a Wildfire Evacuation Plan for Your Family").axis, "disaster-wildfire-evacuation");
  assert.equal(detectScope("How to Secure Furniture and Fixtures Before an Earthquake").axis, "disaster-earthquake");
  assert.equal(detectScope("Landslide Warning Signs and What to Do About Them").axis, "disaster-flood-landslide");
});

test("an insurance article naming a hazard stays on its insurance axis", () => {
  // art_014 is published. Re-routing it would break the live travel cluster.
  assert.equal(isDisasterText("When to Buy Travel Insurance for Hurricane Season"), false);
  assert.equal(detectScope("When to Buy Travel Insurance for Hurricane Season").axis, "international-travel-insurance");
  assert.equal(detectScope("Emergency Medical Evacuation Insurance for Remote Travel").axis, "emergency-medical-evacuation");
  assert.equal(detectScope("How Medical Evacuation Coverage Works on an International Trip").axis, "emergency-medical-evacuation");
  assert.equal(detectScope("Travel Insurance for Adventure and Outdoor Activities Abroad").axis, "adventure-outdoor-safety");
});

test("the wellness and travel clusters are untouched by the new detector", () => {
  assert.equal(detectScope("How to Stretch After a Long Flight").axis, "wellness-travel-fitness");
  assert.equal(detectScope("Resistance Band Exercises for Desk Workers").axis, "wellness-home-fitness-pilates");
  assert.equal(detectScope("A Pre-Trip Safety Checklist for International Travelers").axis, "trip-preparation-safety");
  assert.equal(detectScope("travel insurance for baggage delay").axis, "baggage-travel-disruption");
});

// ─── duplicate protection ────────────────────────────────────────────────────

test("the same preparedness topic reworded collides; two real seeds do not", () => {
  const sig = (...p) => topicSignature(...p);
  const seed = "What to Put in a Home Emergency Kit";
  assert.ok(signatureCollision(sig(seed), sig(seed)));
  // Same hazard, different artifact.
  assert.equal(
    signatureCollision(
      sig("How to Prepare Your Home Before a Flood Warning Expires"),
      sig("How to Protect Important Documents From Water Damage"),
    ),
    null,
  );
});

test("no two disaster seeds collide with each other", () => {
  const sigs = DISASTER_SEEDS.map((s) => ({ title: s.title, sig: topicSignature(s.title, s.searchIntent) }));
  for (let i = 0; i < sigs.length; i += 1) {
    for (let j = i + 1; j < sigs.length; j += 1) {
      assert.equal(signatureCollision(sigs[i].sig, sigs[j].sig), null, `${sigs[i].title} <-> ${sigs[j].title}`);
    }
  }
});

test("a disaster topic never collides with an insurance or wellness topic", () => {
  const disaster = topicSignature("A Household Checklist for Hurricane and Typhoon Season");
  const insurance = topicSignature("When to Buy Travel Insurance for Hurricane Season");
  const wellness = topicSignature("How to Stretch After a Long Flight");
  for (const [a, b] of [[disaster, insurance], [insurance, disaster], [disaster, wellness], [wellness, disaster]]) {
    assert.equal(signatureCollision(a, b), null);
  }
});

test("buildRecommendations offers all three categories at once", () => {
  const out = buildRecommendations({ articles: [], jobs: [], keywords: [], categories: [] });
  const axes = out.candidates.map((c) => c.contentAxis.id);
  assert.ok(axes.some((a) => a.startsWith("disaster-")), "no disaster candidate offered");
  assert.ok(axes.some((a) => a.startsWith("wellness-")), "wellness candidates disappeared");
  assert.ok(axes.some((a) => !a.startsWith("disaster-") && !a.startsWith("wellness-")), "travel candidates disappeared");
  for (const c of out.candidates) assert.equal(c.eligibility.canGenerate, true);
});

test("a disaster topic already written is not recommended again", () => {
  const seed = DISASTER_SEEDS[0];
  const articles = [{ id: "art_950", status: "written", title: seed.title, slug: "x", keyword: seed.title }];
  const out = buildRecommendations({ articles, jobs: [], keywords: [], categories: [] });
  assert.ok(!out.candidates.some((c) => c.title === seed.title));
});

test("nicheMatches accepts disaster for blog_001 and still refuses K-Beauty", () => {
  assert.equal(nicheMatches("blog_001", { category: DISASTER_CATEGORY_LABEL, keyword: "home emergency kit" }), true);
  assert.equal(nicheMatches("blog_001", { category: "K-Beauty", keyword: "korean skincare routine" }), false);
});

// ─── the fixed article order + donation policy in the request file ───────────

test("a disaster job gets the fixed 8-section order and both forbidden zones", () => {
  const req = buildHandoffRequest({
    jobId: "pjob_test",
    blog: { id: "blog_001" },
    candidate: { id: "rec_d", keyword: "what to put in a home emergency kit", category: "Emergency Kits & Supplies" },
  });
  const cc = req.contentCategory;
  assert.equal(cc.category, DISASTER_CATEGORY_LABEL);
  assert.equal(cc.sectionOrderIsFixed, true);
  assert.deepEqual(req.masterSections, DISASTER_MASTER_SECTIONS);
  assert.equal(req.masterSections.length, 8);
  // Order is the ethic: condolence first, products sixth.
  assert.match(req.masterSections[0], /^1\. Condolence/);
  assert.match(req.masterSections[1], /^2\. Current Situation/);
  assert.match(req.masterSections[2], /^3\. How to Help/);
  assert.match(req.masterSections[3], /^4\. What Affected Communities Need/);
  assert.match(req.masterSections[4], /^5\. Prepare Your Own Household/);
  assert.match(req.masterSections[5], /^6\. Emergency Products/);
  assert.match(req.masterSections[6], /^7\. Sources/);
  assert.match(req.masterSections[7], /^8\. Related ATLAS Guides/);

  assert.deepEqual(cc.donationPolicy.affiliateForbiddenSections, AFFILIATE_FORBIDDEN_SECTIONS);
  assert.deepEqual(cc.donationPolicy.donationForbiddenSections, DONATION_FORBIDDEN_SECTIONS);
  assert.equal(cc.donationPolicy.disclosure, DONATION_DISCLOSURE);
  assert.equal(cc.donationPolicy.matchingProgram.enabled, false);
  assert.ok(cc.donationPolicy.verifiedReliefOrganizations.length >= 5);
  assert.match(cc.donationPolicy.noVerifiedLinkFallback, /never substitute a shop link/i);
  assert.match(cc.imageDirection, /NEVER an image of victims/);
  assert.equal(cc.pinDirections.length, 5);
  assert.match(req.note, /sections 1-4 carry no product/i);
});

test("the wellness and travel request files are unaffected", () => {
  const well = buildHandoffRequest({
    jobId: "p", blog: { id: "blog_001" },
    candidate: { id: "rec_w", keyword: "how to stretch after a long flight", category: "Travel Fitness" },
  });
  assert.equal(well.contentCategory.axisId, "wellness-travel-fitness");
  assert.match(well.masterSections[0], /^Miji's Situation/);

  const trav = buildHandoffRequest({
    jobId: "p", blog: { id: "blog_001" },
    candidate: { id: "rec_t", keyword: "travel insurance for baggage delay", category: "Baggage Delay, Loss and Travel Disruption" },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(trav, "contentCategory"), false);
  assert.deepEqual(trav.masterSections, MASTER_SECTIONS);
});

// ─── the donation-matching feature stays off ─────────────────────────────────

test("donation matching is disabled until every field is real", () => {
  assert.equal(DONATION_MATCHING.enabled, false);
  assert.equal(donationMatchingActive(), false);
  for (const field of ["ratio", "recipientOrg", "period", "remittanceRecordUrl"]) {
    assert.equal(DONATION_MATCHING[field], null, `${field} must not be pre-filled`);
  }
});

test("relief organisations are named hosts, not invented names", () => {
  for (const org of OFFICIAL_RELIEF_ORGS) {
    assert.ok(org.name && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(org.host), JSON.stringify(org));
  }
});

// ─── SEO surfaces ────────────────────────────────────────────────────────────

test("preparedness titles cluster separately; insurance titles keep theirs", () => {
  assert.equal(classifyCluster("What to Put in a Home Emergency Kit").id, "disaster-preparedness");
  assert.equal(classifyCluster("How to Build a Wildfire Evacuation Plan for Your Family").id, "disaster-preparedness");
  assert.equal(classifyCluster("When to Buy Travel Insurance for Hurricane Season").id, "travel-insurance");
  assert.equal(classifyCluster("Travel Insurance for Baggage Delay").id, "travel-insurance");
  assert.equal(classifyCluster("How to Stretch After a Long Flight").id, "travel-wellness");
});

test("emergency-management and relief domains count as authority sources", () => {
  for (const url of [
    "https://www.ready.gov/kit", "https://www.fema.gov/x", "https://www.weather.gov/y",
    "https://earthquake.usgs.gov/z", "https://www.redcross.org/a", "https://reliefweb.int/b",
    "https://www.unicef.org/c",
  ]) assert.equal(isAuthoritySource(url), true, url);
  assert.equal(isAuthoritySource("https://some-prepper-store.com/kit"), false);
});

// ─── Product Center ──────────────────────────────────────────────────────────

test("the 12 product families are all matchable", () => {
  assert.equal(DISASTER_PRODUCT_CATEGORIES.length, 12);
  assert.ok(suggestProductCategories("disaster-emergency-kits").includes("emergency first aid kits"));
  assert.ok(suggestProductCategories("How to Get Through a Multi-Day Power Outage at Home").includes("portable power banks"));
});

test("suggestProductsForTopic ranks real matches and stays out of other categories", () => {
  const products = [
    { id: "p1", name: "NOAA Weather Emergency Radio", category: "Emergency" },
    { id: "p2", name: "20000mAh Portable Power Bank", category: "Electronics" },
    { id: "p3", name: "Neoprene Light Dumbbell Set", category: "Fitness" },
  ];
  const ranked = suggestProductsForTopic("How to Get Through a Multi-Day Power Outage at Home", products);
  assert.ok(ranked.length === 2, JSON.stringify(ranked));
  assert.ok(ranked.every((m) => m.recommended));
  assert.ok(!ranked.some((m) => m.productId === "p3"));

  assert.deepEqual(suggestProductsForTopic("When to Buy Travel Insurance for Hurricane Season", products), []);
  assert.deepEqual(suggestProductsForTopic("How to Stretch After a Long Flight", products), []);
});

// ─── Pinterest ───────────────────────────────────────────────────────────────

test("the five allowed pin directions, and no disaster-imagery direction", () => {
  assert.deepEqual(DISASTER_PIN_TEMPLATES.map((t) => t.id), [
    "emergency-kit-checklist", "flood-preparedness-checklist", "go-bag", "family-evacuation", "before-during-after",
  ]);
  assert.equal(DISASTER_VARIANTS.length, 5);
  assert.equal(VARIANTS.length, 3);
  for (const t of DISASTER_PIN_TEMPLATES) assert.ok(t.tone && t.cta && t.imageRole && t.boards.length);
  assert.ok(DISASTER_PIN_TEMPLATES.some((t) => /never a photograph|Never an image|not of a flooded street|not disaster footage/i.test(t.tone)));
});

const disasterArticle = {
  id: "art_950",
  title: "What to Put in a Home Emergency Kit",
  category: DISASTER_CATEGORY_LABEL,
  publishedUrl: "https://example.blogspot.com/kit.html",
  metaDescription: "A 72-hour home emergency kit list built from official guidance, with the water, light and first aid a household actually needs.",
  quickAnswer: "Build for 72 hours: one gallon of water per person per day, light, a radio, and a first aid kit.",
  desiredReaderAction: "Assemble the kit this weekend and set a rotation reminder.",
  visualAssets: ["featured", "context", "comparison", "action", "checklist"].map((k) => ({
    key: k, publicUrl: `https://res.cloudinary.com/d/image/upload/v1/a/${k}`,
  })),
  bodyHtml: `
<h2>Condolence and Human Impact</h2><p>Our thoughts are with the families who lost someone in this week's flooding.</p>
<h2>Current Situation</h2><p>According to the national disaster agency, 24 people died and 11 remain missing as of 28 August.</p>
<h2>How to Help</h2><p>The American Red Cross has an active appeal for this event. <a href="https://www.redcross.org/donate">Donate through the Red Cross appeal page</a>. ${DONATION_DISCLOSURE}</p>
<h2>What Affected Communities Need</h2><p>Relief agencies have asked for cash rather than goods, because cash can be spent locally and arrives faster.</p>
<h2>Prepare Your Own Household</h2><ul><li>Store one gallon of drinking water per person per day for at least three days.</li><li>Keep a headlamp and spare batteries somewhere you can reach in the dark.</li></ul>
<h2>Emergency Products</h2><p>Affiliate disclosure: ATLAS may earn a commission from the links in this section. A basic first aid kit covers ordinary injuries.</p>
<h2>Sources and Official Relief Links</h2><ul><li>https://www.ready.gov/kit</li></ul>
<h2>Related ATLAS Guides</h2><ul></ul>`,
};

test("a disaster article gets 5 pins, distinct dates and distinct images", () => {
  assert.equal(isDisasterArticle(disasterArticle), true);
  const { variants, boards } = buildVariants({ article: disasterArticle, now: new Date("2026-09-01T00:00:00Z") });
  assert.deepEqual(variants.map((v) => v.id), DISASTER_PIN_TEMPLATES.map((t) => t.id));
  assert.equal(new Set(variants.map((v) => v.suggestedDate)).size, 5);
  assert.equal(new Set(variants.map((v) => v.imageSource)).size, 5);
  for (const v of variants) {
    assert.ok(v.title && v.overlay && v.description);
    assert.equal(v.link, disasterArticle.publishedUrl, "every pin links to the ATLAS guide");
  }
  assert.ok(boards.length > 0);
});

test("pin routing: insurance keeps 3 pins even when the title names a hazard", () => {
  const ins = { ...disasterArticle, title: "When to Buy Travel Insurance for Hurricane Season", category: "Travel", bodyHtml: "<h2>Common Mistakes</h2><ul><li>Buying after the storm is named, when coverage no longer applies.</li></ul>" };
  assert.equal(isDisasterArticle(ins), false);
  assert.deepEqual(buildVariants({ article: ins, now: new Date() }).variants.map((v) => v.id), ["question", "mistake", "checklist"]);
});

test("board suggestions come from the article's own axis", () => {
  assert.ok(suggestPinBoards({ title: "How to Build a Wildfire Evacuation Plan for Your Family" }).includes("Family Evacuation Planning"));
});

// ─── section parsing + the five QA gates ─────────────────────────────────────

test("splitDisasterSections finds the canonical sections", () => {
  const s = splitDisasterSections(disasterArticle.bodyHtml);
  for (const id of ["condolence", "situation", "howToHelp", "communityNeeds", "household", "products", "sources", "related"]) {
    assert.ok(s[id] !== undefined, `${id} not parsed`);
  }
});

test("a correctly structured disaster article passes all five gates", () => {
  const r = checkDisasterSafety(disasterArticle);
  assert.equal(r.applies, true);
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.checks.map((c) => c.id), [
    "sensationalDisasterClaims", "unverifiedCasualtyClaims", "donationAffiliateMixing", "fakeDonationClaim", "exploitativeCTA",
  ]);
});

test("sensationalDisasterClaims: spectacle language fails", () => {
  const r = checkDisasterSafety({ ...disasterArticle, title: "Shocking Footage: You Won't Believe the Damage" });
  assert.ok(r.violations.includes("sensationalDisasterClaims"));
});

test("unverifiedCasualtyClaims: an unattributed number and a rumour both fail", () => {
  const noSource = checkDisasterSafety({
    ...disasterArticle,
    bodyHtml: disasterArticle.bodyHtml.replace(
      "According to the national disaster agency, 24 people died and 11 remain missing as of 28 August.",
      "More than 300 people are dead.",
    ),
  });
  assert.ok(noSource.violations.includes("unverifiedCasualtyClaims"));

  const rumour = checkDisasterSafety({
    ...disasterArticle,
    bodyHtml: `${disasterArticle.bodyHtml}<p>Reports say the toll is far higher.</p>`,
  });
  assert.ok(rumour.violations.includes("unverifiedCasualtyClaims"));
});

test("donationAffiliateMixing: an affiliate link in How to Help fails", () => {
  const r = checkDisasterSafety({
    ...disasterArticle,
    bodyHtml: disasterArticle.bodyHtml.replace(
      "<h2>What Affected Communities Need</h2>",
      '<p><a href="https://amzn.to/x">Buy now</a></p><h2>What Affected Communities Need</h2>',
    ),
  });
  assert.ok(r.violations.includes("donationAffiliateMixing"));
});

test("donationAffiliateMixing: a donation link inside Emergency Products fails", () => {
  const r = checkDisasterSafety({
    ...disasterArticle,
    bodyHtml: disasterArticle.bodyHtml.replace(
      "A basic first aid kit covers ordinary injuries.",
      'A basic first aid kit covers ordinary injuries. <a href="https://www.redcross.org/donate">Donate here too</a>.',
    ),
  });
  assert.ok(r.violations.includes("donationAffiliateMixing"));
});

test("donationAffiliateMixing: the no-commission disclosure is required", () => {
  const r = checkDisasterSafety({
    ...disasterArticle,
    bodyHtml: disasterArticle.bodyHtml.replace(DONATION_DISCLOSURE, ""),
  });
  assert.ok(r.violations.includes("donationAffiliateMixing"));
  assert.match(r.checks.find((c) => c.id === "donationAffiliateMixing").reason, /문장 누락/);
});

test("fakeDonationClaim: 'every purchase helps' fails while matching is disabled", () => {
  for (const claim of [
    "Every purchase helps the families affected.",
    "A portion of every sale is donated to relief.",
    "Buying this sends a kit to a family in the flood zone.",
    "Proceeds go to the recovery fund.",
  ]) {
    const r = checkDisasterSafety({ ...disasterArticle, bodyHtml: `${disasterArticle.bodyHtml}<p>${claim}</p>` });
    assert.ok(r.violations.includes("fakeDonationClaim"), claim);
  }
});

test("exploitativeCTA: urgency and scarcity built on the disaster fail", () => {
  for (const cta of [
    "Stock up now before the next storm.",
    "Order before it's too late.",
    "Limited time offer on emergency kits.",
  ]) {
    const r = checkDisasterSafety({ ...disasterArticle, bodyHtml: `${disasterArticle.bodyHtml}<p>${cta}</p>` });
    assert.ok(r.violations.includes("exploitativeCTA"), cta);
  }
});

test("the disaster gate does not apply to other categories", () => {
  for (const a of [
    { category: "Travel", title: "Travel Insurance for Baggage Delay", bodyHtml: "<p>Policies vary by insurer.</p>" },
    { category: "Travel Wellness & Everyday Fitness", title: "How to Stretch After a Long Flight", bodyHtml: "<p>Mild tension only.</p>" },
    { category: "Travel", title: "When to Buy Travel Insurance for Hurricane Season", bodyHtml: "<p>Buy before the storm is named.</p>" },
  ]) {
    const r = checkDisasterSafety(a);
    assert.equal(r.applies, false, a.title);
    assert.deepEqual(r.violations, []);
  }
});

// ─── the gates reach runContentQa and block publishing ───────────────────────

test("runContentQa blocks a disaster article that mixes donation and affiliate", () => {
  const qa = runContentQa({
    ...disasterArticle,
    bodyHtml: disasterArticle.bodyHtml.replace(
      "<h2>What Affected Communities Need</h2>",
      '<p><a href="https://amzn.to/x">Shop now</a> — every purchase helps.</p><h2>What Affected Communities Need</h2>',
    ),
  }, { articles: [] });
  const ids = qa.blocking.map((b) => b.id);
  assert.ok(ids.includes("donationAffiliateMixing"), JSON.stringify(ids));
  assert.ok(ids.includes("fakeDonationClaim"), JSON.stringify(ids));
  assert.equal(qa.pass, false);
  assert.equal(qa.gates.canApprove, false);
});

test("runContentQa reports all five gates for a disaster article", () => {
  const qa = runContentQa(disasterArticle, { articles: [] });
  for (const id of ["sensationalDisasterClaims", "unverifiedCasualtyClaims", "donationAffiliateMixing", "fakeDonationClaim", "exploitativeCTA"]) {
    const check = qa.checks.find((c) => c.id === id);
    assert.ok(check, `${id} missing from the QA report`);
    assert.equal(check.status, "PASS", `${id}: ${check.reason}`);
  }
});

test("runContentQa adds no disaster check to travel or wellness articles", () => {
  const ids = ["sensationalDisasterClaims", "unverifiedCasualtyClaims", "donationAffiliateMixing", "fakeDonationClaim", "exploitativeCTA"];
  for (const a of [
    { id: "art_951", title: "Travel Insurance for Baggage Delay", category: "Travel", bodyHtml: "<p>Policies vary.</p>" },
    { id: "art_952", title: "How to Stretch After a Long Flight", category: "Travel Wellness & Everyday Fitness", bodyHtml: "<p>See a doctor if pain persists.</p>" },
  ]) {
    const qa = runContentQa(a, { articles: [] });
    for (const id of ids) assert.equal(qa.checks.some((c) => c.id === id), false, `${id} leaked into ${a.title}`);
  }
});

test("every axis carries the material a new article needs", () => {
  for (const axis of DISASTER_AXES) {
    const a = disasterAxis(axis.id);
    assert.ok(a.productHints.length > 0, `${axis.id} productHints`);
    assert.ok(a.tags.length >= 3, `${axis.id} tags`);
    assert.ok(a.topicEntities.length >= 3, `${axis.id} topicEntities`);
    assert.ok(a.pinBoards.length >= 2, `${axis.id} pinBoards`);
  }
});
