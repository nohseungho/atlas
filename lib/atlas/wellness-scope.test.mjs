import test from "node:test";
import assert from "node:assert/strict";
import {
  WELLNESS_AXES,
  WELLNESS_SEEDS,
  WELLNESS_CATEGORY_LABEL,
  WELLNESS_PIN_TEMPLATES,
  detectWellnessAxis,
  isWellnessText,
  wellnessAxis,
  suggestProductCategories,
  suggestProductsForTopic,
  suggestPinBoards,
  checkWellnessSafety,
} from "./wellness-scope.js";
import { CONTENT_AXES, AXIS_IDS, EDITORIAL_SEEDS, detectScope } from "./atlas-scope.js";
import { buildRecommendations, topicSignature, signatureCollision } from "./recommendation-engine.js";
import { nicheMatches } from "./money-hunter-select.js";
import { buildHandoffRequest, MASTER_SECTIONS } from "./chatgpt-handoff.js";
import { classifyCluster, isAuthoritySource } from "./seo-engine.js";
import { buildVariants, VARIANTS, WELLNESS_VARIANTS, isWellnessArticle } from "./traffic-kit.js";
import { runContentQa } from "./content-qa.js";

// ─── the category exists in the system ───────────────────────────────────────

test("the 5 wellness axes are registered as real ATLAS content axes", () => {
  assert.equal(WELLNESS_AXES.length, 5);
  for (const axis of WELLNESS_AXES) {
    assert.ok(AXIS_IDS.has(axis.id), `${axis.id} missing from AXIS_IDS`);
    assert.ok(CONTENT_AXES.some((a) => a.id === axis.id && a.label === axis.label));
  }
  // The original 10 travel axes are all still there.
  assert.equal(CONTENT_AXES.length, 15);
  assert.ok(AXIS_IDS.has("international-travel-insurance"));
});

test("all 20 launch seeds are in the shared editorial catalog and sit on a wellness axis", () => {
  assert.equal(WELLNESS_SEEDS.length, 20);
  for (const seed of WELLNESS_SEEDS) {
    assert.ok(EDITORIAL_SEEDS.includes(seed), `${seed.title} not merged`);
    assert.ok(AXIS_IDS.has(seed.axis), `${seed.title} has unknown axis ${seed.axis}`);
    assert.ok(seed.searchIntent && seed.reason && seed.type);
  }
  const titles = WELLNESS_SEEDS.map((s) => s.title);
  assert.equal(new Set(titles).size, 20, "seed titles must be unique");
});

// ─── detection does not steal the existing cluster ───────────────────────────

test("detectScope routes wellness topics to a wellness axis", () => {
  assert.equal(detectScope("How to Stretch After a Long Flight").axis, "wellness-travel-fitness");
  assert.equal(detectScope("Resistance Band Exercises for Desk Workers").axis, "wellness-home-fitness-pilates");
  assert.equal(detectScope("Best Beginner Dumbbells for Home Workouts").axis, "wellness-travel-gear");
  assert.equal(detectScope("Daily Posture Habits to Reduce Neck Tension").axis, "wellness-neck-shoulder-posture");
});

test("detectScope leaves every existing travel topic on its original axis", () => {
  const unchanged = [
    ["travel insurance for baggage delay", "baggage-travel-disruption"],
    ["what to do if you get sick while traveling abroad", "travel-medical-insurance"],
    ["emergency medical evacuation insurance", "emergency-medical-evacuation"],
    ["a pre-trip safety checklist for international travelers", "trip-preparation-safety"],
    ["travel insurance for adventure and outdoor activities", "adventure-outdoor-safety"],
    ["annual multi-trip travel insurance", "traveler-segment-coverage"],
  ];
  for (const [text, axis] of unchanged) assert.equal(detectScope(text).axis, axis, text);
});

test("bare 'travel' or 'health' is never enough to be a wellness topic", () => {
  assert.equal(isWellnessText("How to Prepare for Travel Health Risks by Destination"), false);
  assert.equal(isWellnessText("How to Build a Travel Health Kit for an International Trip"), false);
  assert.equal(detectWellnessAxis("travel insurance comparison sites"), null);
});

test("a wellness text with no axis keyword still lands in the category", () => {
  assert.equal(detectWellnessAxis("a short mobility routine"), "wellness-home-fitness-pilates");
});

// ─── duplicate protection ────────────────────────────────────────────────────

test("the same wellness topic worded differently collides; two real seeds do not", () => {
  const sig = (...p) => topicSignature(...p);
  const seed = sig("How to Relieve Neck and Shoulder Stiffness at Home");
  assert.ok(signatureCollision(seed, sig("How to Relieve Neck and Shoulder Stiffness at Home")));

  // Same body area, different equipment → two genuinely different guides.
  assert.equal(
    signatureCollision(sig("5 Light Dumbbell Moves for Tight Shoulders"), sig("Best Massage Ball Exercises for Tight Shoulders")),
    null,
  );
});

test("no two wellness seeds collide with each other", () => {
  const sigs = WELLNESS_SEEDS.map((s) => ({ title: s.title, sig: topicSignature(s.title, s.searchIntent) }));
  for (let i = 0; i < sigs.length; i += 1) {
    for (let j = i + 1; j < sigs.length; j += 1) {
      assert.equal(
        signatureCollision(sigs[i].sig, sigs[j].sig),
        null,
        `${sigs[i].title} <-> ${sigs[j].title}`,
      );
    }
  }
});

test("a wellness topic never collides with a travel-insurance topic", () => {
  const wellness = topicSignature("How to Stretch After a Long Flight");
  const insurance = topicSignature("Travel Insurance for Baggage Delay and Lost Luggage: What to Check");
  assert.equal(signatureCollision(wellness, insurance), null);
  assert.equal(signatureCollision(insurance, wellness), null);
});

test("buildRecommendations offers wellness candidates without dropping the travel ones", () => {
  const out = buildRecommendations({ articles: [], jobs: [], keywords: [], categories: [] });
  const axes = out.candidates.map((c) => c.contentAxis.id);
  assert.ok(axes.some((a) => a.startsWith("wellness-")), "no wellness candidate offered");
  assert.ok(axes.some((a) => !a.startsWith("wellness-")), "travel candidates disappeared");
  for (const c of out.candidates) assert.equal(c.eligibility.canGenerate, true);
});

test("a wellness topic already written is not recommended again", () => {
  const seed = WELLNESS_SEEDS[0];
  const articles = [{ id: "art_900", status: "written", title: seed.title, slug: "x", keyword: seed.title }];
  const out = buildRecommendations({ articles, jobs: [], keywords: [], categories: [] });
  assert.ok(!out.candidates.some((c) => c.title === seed.title));
  assert.ok(out.rejected.some((r) => r.topic === seed.title));
});

test("nicheMatches accepts wellness for blog_001 and still refuses K-Beauty", () => {
  assert.equal(nicheMatches("blog_001", { category: WELLNESS_CATEGORY_LABEL, keyword: "resistance band exercises" }), true);
  assert.equal(nicheMatches("blog_001", { category: "K-Beauty", keyword: "korean skincare routine" }), false);
  assert.equal(nicheMatches("blog_002", { category: WELLNESS_CATEGORY_LABEL, keyword: "pilates for posture" }), false);
});

// ─── article shape + request file ────────────────────────────────────────────

test("a wellness job gets the wellness skeleton, safety rules and product hints", () => {
  const req = buildHandoffRequest({
    jobId: "pjob_test",
    blog: { id: "blog_001" },
    candidate: { id: "rec_x", keyword: "how to stretch after a long flight", category: "Travel Fitness" },
  });
  assert.equal(req.contentCategory.category, WELLNESS_CATEGORY_LABEL);
  assert.equal(req.contentCategory.axisId, "wellness-travel-fitness");
  assert.ok(req.masterSections[0].startsWith("Miji's Situation"));
  assert.equal(req.contentCategory.narrativeFlow.length, 6);
  assert.ok(req.contentCategory.safetyRules.some((r) => /not medical advice/i.test(r)));
  assert.ok(req.contentCategory.productCategoryHints.length > 0);
  assert.equal(req.contentCategory.pinDirections.length, 4);
  assert.ok(req.contentCategory.pinBoardSuggestions.length > 0);
  assert.ok(/general wellness information/i.test(req.note));
});

test("a travel-insurance job's request file is unchanged", () => {
  const req = buildHandoffRequest({
    jobId: "pjob_test",
    blog: { id: "blog_001" },
    candidate: { id: "rec_y", keyword: "travel insurance for baggage delay", category: "Baggage Delay, Loss and Travel Disruption" },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(req, "contentCategory"), false);
  assert.deepEqual(req.masterSections, MASTER_SECTIONS);
});

// ─── SEO surfaces ────────────────────────────────────────────────────────────

test("wellness titles get the wellness cluster, travel titles keep theirs", () => {
  assert.equal(classifyCluster("How to Stretch After a Long Flight").id, "travel-wellness");
  assert.equal(classifyCluster("Travel Insurance for Baggage Delay").id, "travel-insurance");
  assert.equal(classifyCluster("What to Do If You Get Sick While Traveling Abroad").id, "medical-abroad");
});

test("wellness-relevant public health domains count as authority sources", () => {
  for (const url of ["https://medlineplus.gov/x", "https://www.nih.gov/y", "https://health.gov/z", "https://www.osha.gov/w"]) {
    assert.equal(isAuthoritySource(url), true, url);
  }
  assert.equal(isAuthoritySource("https://some-fitness-blog.com/post"), false);
});

// ─── Product Center ──────────────────────────────────────────────────────────

test("product hints follow the axis", () => {
  assert.ok(suggestProductCategories("wellness-neck-shoulder-posture").includes("massage balls"));
  assert.ok(suggestProductCategories("Best Beginner Dumbbells for Home Workouts").includes("light dumbbells"));
});

test("suggestProductsForTopic ranks real matches and returns nothing for a travel topic", () => {
  const products = [
    { id: "p1", name: "Neoprene Light Dumbbell Set 2kg", category: "Fitness" },
    { id: "p2", name: "Trigger Point Massage Ball", category: "Recovery" },
    { id: "p3", name: "Carry-on Luggage Scale", category: "Travel" },
  ];
  const forShoulders = suggestProductsForTopic("Best Massage Ball Exercises for Tight Shoulders", products);
  assert.equal(forShoulders[0].productId, "p2");
  assert.equal(forShoulders[0].recommended, true);
  assert.ok(!forShoulders.some((m) => m.productId === "p3"));

  assert.deepEqual(suggestProductsForTopic("Travel Insurance for Baggage Delay", products), []);
});

// ─── Pinterest ───────────────────────────────────────────────────────────────

test("the wellness pin set has the 4 required directions incl. the photo-real Miji pin", () => {
  assert.deepEqual(
    WELLNESS_PIN_TEMPLATES.map((t) => t.id),
    ["question", "problem-solution", "checklist", "miji-lifestyle"],
  );
  const miji = WELLNESS_PIN_TEMPLATES.find((t) => t.id === "miji-lifestyle");
  assert.match(miji.tone, /no suggestive framing|nothing suggestive|not a fitness ad/i);
  assert.equal(WELLNESS_VARIANTS.length, 4);
  assert.equal(VARIANTS.length, 3);
});

test("board suggestions come from the article's own axis", () => {
  const boards = suggestPinBoards({ title: "Hotel Room Workout for Travelers With No Gym" });
  assert.ok(boards.includes("Hotel Room Workouts"));
});

const wellnessArticle = {
  id: "art_900",
  title: "How to Relieve Neck and Shoulder Stiffness at Home",
  category: WELLNESS_CATEGORY_LABEL,
  publishedUrl: "https://example.blogspot.com/a.html",
  coreQuestion: "What can you do at a desk when your shoulders lock up by mid-afternoon?",
  metaDescription: "A short at-home routine for everyday neck and shoulder tightness, with the cautions that matter.",
  quickAnswer: "Take a two-minute movement break every hour and run a five-move routine once a day.",
  desiredReaderAction: "Run the five-move routine once today.",
  visualAssets: [
    { key: "featured", publicUrl: "https://res.cloudinary.com/d/image/upload/v1/a/featured" },
    { key: "context", publicUrl: "https://res.cloudinary.com/d/image/upload/v1/a/context" },
    { key: "comparison", publicUrl: "https://res.cloudinary.com/d/image/upload/v1/a/comparison" },
    { key: "action", publicUrl: "https://res.cloudinary.com/d/image/upload/v1/a/action" },
    { key: "checklist", publicUrl: "https://res.cloudinary.com/d/image/upload/v1/a/checklist" },
  ],
  bodyHtml: `
    <h2>Miji's Situation</h2><p>By four in the afternoon my shoulders had gone solid again after a long editing day.</p>
    <h2>The Routine</h2><ul>
      <li>Chin tuck: hold five seconds, repeat eight times, keeping the movement small and slow.</li>
      <li>Shoulder rolls: ten backwards, ten forwards, with the arms relaxed at your sides.</li>
    </ul>
    <h2>Before You Start &amp; When to Stop</h2><p>Stop if anything feels sharp, and see a doctor or physical therapist for pain that is severe or persistent.</p>
    <h2>Building the Habit</h2><ul><li>Pin the routine to the hour you already take a coffee break.</li></ul>`,
};

test("a wellness article gets 4 pins, its own copy, and board suggestions", () => {
  assert.equal(isWellnessArticle(wellnessArticle), true);
  const { variants, boards } = buildVariants({ article: wellnessArticle, now: new Date("2026-09-01T00:00:00Z") });
  assert.deepEqual(variants.map((v) => v.id), ["question", "problem-solution", "checklist", "miji-lifestyle"]);
  assert.equal(new Set(variants.map((v) => v.suggestedDate)).size, 4, "pins must not all land on one day");
  assert.equal(variants[3].imageSource, "action");
  for (const v of variants) assert.ok(v.description.length > 0 && v.overlay.length > 0);
  assert.ok(boards.length > 0);
});

test("a travel-insurance article still gets exactly the original 3 pins", () => {
  const travel = { ...wellnessArticle, title: "Travel Insurance for Baggage Delay", category: "Travel", bodyHtml: "<h2>Common Mistakes</h2><ul><li>Filing the claim after the airline deadline has already passed.</li></ul>" };
  assert.equal(isWellnessArticle(travel), false);
  const { variants } = buildVariants({ article: travel, now: new Date("2026-09-01T00:00:00Z") });
  assert.deepEqual(variants.map((v) => v.id), ["question", "mistake", "checklist"]);
});

// ─── safety ──────────────────────────────────────────────────────────────────

test("medical claims fail the wellness gate; a careful article passes", () => {
  const bad = checkWellnessSafety({
    category: WELLNESS_CATEGORY_LABEL,
    title: "Fix Your Posture in 7 Days",
    bodyHtml: "<p>This routine treats your pain and guarantees relief.</p>",
  });
  assert.equal(bad.applies, true);
  assert.ok(bad.violations.includes("treatment"));
  assert.ok(bad.violations.includes("timeframe-promise"));
  assert.equal(bad.hasConsultAdvice, false);

  const good = checkWellnessSafety(wellnessArticle);
  assert.deepEqual(good.violations, []);
  assert.equal(good.hasConsultAdvice, true);
});

test("the wellness gate does not apply to travel-insurance articles", () => {
  const r = checkWellnessSafety({ category: "Travel", title: "Travel Insurance for Baggage Delay", bodyHtml: "<p>Policies vary by insurer.</p>" });
  assert.equal(r.applies, false);
  assert.deepEqual(r.violations, []);
});

test("runContentQa blocks a wellness article that promises a cure", () => {
  const qa = runContentQa({ ...wellnessArticle, bodyHtml: "<p>This 7-day plan will fix your posture in 7 days and treats your pain.</p>" }, { articles: [] });
  assert.ok(qa.blocking.some((b) => b.id === "wellnessClaims"), JSON.stringify(qa.blocking));
});

test("runContentQa adds no wellness check to a travel-insurance article", () => {
  const qa = runContentQa({ id: "art_901", title: "Travel Insurance for Baggage Delay", category: "Travel", bodyHtml: "<p>Policies vary.</p>" }, { articles: [] });
  assert.equal(qa.checks.some((c) => c.id.startsWith("wellness")), false);
});

test("every axis carries the material a new article needs", () => {
  for (const axis of WELLNESS_AXES) {
    const a = wellnessAxis(axis.id);
    assert.ok(a.productHints.length > 0, `${axis.id} productHints`);
    assert.ok(a.tags.length >= 3, `${axis.id} tags`);
    assert.ok(a.topicEntities.length >= 3, `${axis.id} topicEntities`);
    assert.ok(a.pinBoards.length >= 3, `${axis.id} pinBoards`);
  }
});
