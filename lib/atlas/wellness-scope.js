// ─── ATLAS Travel Wellness & Everyday Fitness (category V1) ──────────────────
// The single source of truth for the second content category on blog_001.
//
// Why a separate module instead of more lines inside atlas-scope.js: the travel
// insurance scope is a closed, finished cluster whose Hard Gate rules are tuned
// against it. This category has a different reader, a different article shape
// (a routine, not a coverage decision), different sources, and different safety
// limits. Keeping it here means atlas-scope.js only has to MERGE it in, so the
// insurance flow keeps behaving exactly as before.
//
// PURE (no IO, no @/ imports) so the API routes, the screens and the tests can
// all share it.
//
// Editorial spine of every article in this category:
//   미지 situation → reader problem → practical routine → cautions →
//   related gear (only where it genuinely fits) → Related ATLAS Guides
//
// Safety spine: this is general wellness/movement information for healthy
// adults. It is never diagnosis, treatment, or a promise of a cure.

export const WELLNESS_CATEGORY_ID = "cat_travel_wellness";
export const WELLNESS_CATEGORY_SLUG = "travel-wellness-fitness";
export const WELLNESS_CATEGORY_LABEL = "Travel Wellness & Everyday Fitness";

// The category record mirrored into data/atlas/categories.json. Kept here too so
// code never has to read a data file to know the category exists.
export const WELLNESS_CATEGORY = {
  id: WELLNESS_CATEGORY_ID,
  slug: WELLNESS_CATEGORY_SLUG,
  label: WELLNESS_CATEGORY_LABEL,
  description:
    "Everyday movement, posture relief and travel-friendly fitness routines for desk workers and frequent travelers — " +
    "general wellness information, never medical diagnosis or treatment.",
  targetMarket: "us",
  adSenseCategory: "Health",
  blogId: "blog_001",
  exampleKeywords: [
    "how to relieve neck and shoulder stiffness at home",
    "hotel room workout for travelers with no gym",
    "resistance band exercises for desk workers",
  ],
};

// ─── The 5 topic axes ────────────────────────────────────────────────────────
// `productHints` is what Product Center matching keys off; `tags` and
// `topicEntities` are the starting vocabulary a new article inherits so the SEO
// labels and Pinterest hashtags are consistent across the whole category.
export const WELLNESS_AXES = [
  {
    id: "wellness-neck-shoulder-posture",
    label: "Neck, Shoulder & Posture Relief",
    focus: "Desk-related neck, shoulder and upper-back tension, and the posture habits behind it.",
    productHints: ["massage balls", "foam rollers", "resistance bands", "posture support accessories"],
    tags: ["Neck and Shoulder", "Posture", "Desk Wellness", "Stretching"],
    topicEntities: ["neck stiffness", "shoulder tension", "forward head posture", "desk ergonomics"],
    pinBoards: ["Desk Posture Relief", "Neck & Shoulder Stretches", "Everyday Wellness Habits"],
  },
  {
    id: "wellness-home-fitness-pilates",
    label: "Light Home Fitness & Pilates",
    focus: "Short, low-equipment routines a beginner can do at home in a small space.",
    productHints: ["light dumbbells", "resistance bands", "yoga mats", "pilates rings"],
    tags: ["Home Workout", "Pilates", "Beginner Fitness", "Small Space"],
    topicEntities: ["pilates", "core exercise", "light dumbbell", "resistance band"],
    pinBoards: ["Home Pilates for Beginners", "Small Space Workouts", "Light Dumbbell Routines"],
  },
  {
    id: "wellness-travel-fitness",
    label: "Travel Fitness",
    focus: "Staying mobile on the road: hotel rooms, long flights, and trips with no gym.",
    productHints: ["travel workout accessories", "resistance bands", "travel yoga mats", "massage balls"],
    tags: ["Travel Fitness", "Hotel Workout", "Long Flight", "Travel Wellness"],
    topicEntities: ["hotel room workout", "post-flight stretching", "travel mobility routine"],
    pinBoards: ["Hotel Room Workouts", "Travel Wellness Routines", "Long Flight Recovery"],
  },
  {
    id: "wellness-travel-gear",
    label: "Travel-Friendly Gear",
    focus: "What to pack and what to start with — light, packable, small-space equipment.",
    productHints: [
      "light dumbbells",
      "resistance bands",
      "yoga mats",
      "massage balls",
      "foam rollers",
      "travel workout accessories",
    ],
    tags: ["Workout Gear", "Travel Gear", "Starter Kit", "Packing"],
    topicEntities: ["home fitness starter kit", "packable workout gear", "lightweight equipment"],
    pinBoards: ["Travel Workout Gear", "Home Fitness Starter Kit", "Packing for an Active Trip"],
  },
  {
    id: "wellness-miji-lifestyle",
    label: "Miji Lifestyle Story Pins",
    // Pinterest-side axis: the photo-real 미지 pins that carry the category's
    // traffic. It is a valid production axis too, so a story-shaped article can
    // be produced on it, but the 20 launch seeds deliberately sit on the four
    // topical axes above.
    focus: "Photo-real 미지 lifestyle pins — the same routines shown as a real person's day, not a diagram.",
    productHints: ["yoga mats", "resistance bands", "light dumbbells", "travel workout accessories"],
    tags: ["Miji Wellness", "Lifestyle", "Daily Routine", "Travel Wellness"],
    topicEntities: ["miji", "daily wellness routine", "desk break"],
    pinBoards: ["Miji Wellness Diary", "A Day of Small Healthy Habits", "Everyday Movement"],
  },
];

export const WELLNESS_AXIS_IDS = new Set(WELLNESS_AXES.map((a) => a.id));

export function wellnessAxis(id) {
  return WELLNESS_AXES.find((a) => a.id === id) || null;
}

// The shape atlas-scope.js merges into CONTENT_AXES (id + label only).
export const WELLNESS_CONTENT_AXES = WELLNESS_AXES.map(({ id, label }) => ({ id, label }));

// ─── Detection ───────────────────────────────────────────────────────────────
// A text is in this category only when it carries a real movement/wellness
// signal. Bare "travel" or "health" must NEVER qualify — those belong to the
// existing travel-insurance/travel-health cluster and stealing them would
// re-route the whole insurance flow.
const WELLNESS_CORE =
  /stretch|posture|pilates|dumbbell|resistance band|foam roller|massage ball|yoga mat|workout|fitness|exercises?\b|mobility|stiffness|desk worker|office worker|wellness habit|stay active|core strength/i;

export function isWellnessText(text) {
  return WELLNESS_CORE.test(String(text || ""));
}

// Ordered most-specific-first: gear/packing wins over the body area it mentions,
// because "what to pack" is a buying question, not a routine.
const AXIS_SIGNALS = [
  { axis: "wellness-travel-gear", re: /what to pack|starter kit|workout gear|workout accessor|best (?:beginner |lightweight )?dumbbells|equipment for/i },
  { axis: "wellness-travel-fitness", re: /hotel room|long flight|after a flight|during (?:international )?travel|frequent flyer|travel fitness|travel wellness|no gym/i },
  { axis: "wellness-neck-shoulder-posture", re: /neck|shoulder|posture|forward head|upper back|massage ball/i },
  { axis: "wellness-home-fitness-pilates", re: /pilates|dumbbell|resistance band|\bcore\b|at[- ]home|home workout|stretching routine|desk worker|office worker/i },
  { axis: "wellness-miji-lifestyle", re: /miji|lifestyle routine|daily routine/i },
];

/** Maps free text to a wellness axis id, or null when it is not this category. */
export function detectWellnessAxis(text) {
  const t = String(text || "");
  if (!isWellnessText(t)) return null;
  const hit = AXIS_SIGNALS.find((s) => s.re.test(t));
  // A wellness text with no axis signal still belongs to the category — the
  // home-fitness axis is the neutral bucket rather than a rejection.
  return hit ? hit.axis : "wellness-home-fitness-pilates";
}

// ─── Duplicate-signature dimensions ──────────────────────────────────────────
// The insurance signature (coverage type + reader segment) says nothing about
// two stretching routines. These are the dimensions that actually separate two
// wellness articles: WHICH body area / context, and WITH WHAT.
export const WELLNESS_FOCUS_SIGNALS = [
  { id: "neck-shoulder", re: /\bneck\b|\bshoulders?\b/ },
  { id: "posture", re: /posture|forward head|desk|office|sitting|sedentary/ },
  { id: "upper-back", re: /upper back|thoracic/ },
  { id: "core", re: /\bcore\b|\babs\b|abdominal/ },
  { id: "travel-context", re: /travel|flight|hotel|trip|flyer|abroad/ },
  { id: "gear", re: /gear|kit|accessor|equipment|what to pack|dumbbells for/ },
];

export const WELLNESS_MODALITY_SIGNALS = [
  { id: "dumbbell", re: /dumbbell|free weight/ },
  { id: "band", re: /resistance band|\bband\b/ },
  { id: "pilates", re: /pilates/ },
  { id: "massage-ball", re: /massage ball|lacrosse ball|trigger point/ },
  { id: "foam-roller", re: /foam roll/ },
  { id: "yoga-mat", re: /yoga mat|\bmat\b/ },
  { id: "stretching", re: /stretch/ },
];

// ─── Product Center matching ─────────────────────────────────────────────────
// ATLAS never invents an affiliate link, and it must not invent a product fit
// either. These hints only RANK the operator's own registered products so the
// obvious ones surface first; picking is still a human step.
export const WELLNESS_PRODUCT_CATEGORIES = [
  { id: "light-dumbbells", label: "light dumbbells", re: /dumbbell|free weight|hand weight/i },
  { id: "resistance-bands", label: "resistance bands", re: /resistance band|\bband\b|tube band|loop band/i },
  { id: "yoga-mats", label: "yoga mats", re: /yoga mat|exercise mat|pilates mat|\bmat\b/i },
  { id: "massage-balls", label: "massage balls", re: /massage ball|lacrosse ball|trigger point ball/i },
  { id: "foam-rollers", label: "foam rollers", re: /foam roll/i },
  { id: "travel-workout-accessories", label: "travel workout accessories", re: /travel.*(?:workout|fitness|gym)|(?:workout|fitness).*travel|packable|portable (?:gym|workout)/i },
];

/** Product category labels worth linking from a topic (axis id or free text). */
export function suggestProductCategories(input) {
  const axis = wellnessAxis(input) || wellnessAxis(detectWellnessAxis(input));
  if (axis) return [...axis.productHints];
  return WELLNESS_PRODUCT_CATEGORIES.map((c) => c.label);
}

/**
 * Ranks Product Center products against a topic. Returns the products that
 * genuinely map to it, best first, each with the reason it matched — an empty
 * array when nothing fits, never a filler suggestion.
 */
export function suggestProductsForTopic(topic, products = []) {
  const text = String(topic || "").toLowerCase();
  if (!isWellnessText(text)) return [];
  const hints = suggestProductCategories(text).map((h) => h.toLowerCase());

  return (products || [])
    .map((p) => {
      const hay = `${p?.name || ""} ${p?.category || ""} ${(p?.features || []).join(" ")} ${p?.benefit || ""}`.toLowerCase();
      const matched = WELLNESS_PRODUCT_CATEGORIES.filter((c) => c.re.test(hay));
      if (!matched.length) return null;
      // A product whose category is one the axis actually asked for outranks a
      // product that merely belongs to the category at large.
      const hinted = matched.filter((c) => hints.some((h) => h.includes(c.label) || c.label.includes(h)));
      const score = matched.length + hinted.length * 2;
      return {
        productId: String(p?.id || ""),
        name: String(p?.name || ""),
        score,
        matchedCategories: matched.map((c) => c.label),
        recommended: hinted.length > 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// Shipped inside the ChatGPT request file for this category, on top of
// PRODUCT_EDITORIAL_RULES. Keeps the gear connection informational.
export const WELLNESS_PRODUCT_RULES = [
  "Name equipment as an option, never as a requirement — every routine must be doable with body weight or a household substitute.",
  "Introduce a product only after the routine it belongs to has been fully explained.",
  "Never claim a product relieves pain, corrects posture, or treats a condition. Describe what it is for, not what it will do to the reader's body.",
  "No 'top 10' ranking, no star rating, no invented review count, no discount claim.",
];

// ─── Article shape ───────────────────────────────────────────────────────────
// The MASTER skeleton for this category. It replaces the insurance skeleton
// (Quick Answer / The Money at Risk / ...) because "what this costs a U.S.
// traveler" is not the question a stretching routine answers.
export const WELLNESS_MASTER_SECTIONS = [
  "Miji's Situation (2-4 sentences, first person — the concrete moment that started this: the desk, the flight, the hotel room)",
  "Quick Answer (2-3 sentences — what the reader should actually do, before any preamble)",
  "Why This Happens (plain, general explanation of the everyday cause — never a diagnosis)",
  "The Routine (numbered moves: name, how to do it, how long/how many, and what it should NOT feel like)",
  "Routine table (a real HTML <table>: move, target area, time or reps, and an easier variation)",
  "Before You Start & When to Stop (cautions, and a plain line telling the reader to see a doctor or physical therapist for pain that is severe, new, or persistent)",
  "What Helps (optional equipment, framed as options — never required, never a cure)",
  "Building the Habit (how to fit it into a normal day or a trip)",
  "FAQ (exactly 5)",
  "Sources & References (>= 3 verifiable HTTPS, authoritative — CDC, NIH/MedlinePlus, health.gov, OSHA, WHO, NHS)",
  "Related ATLAS Guides (leave the empty <ul> — ATLAS fills it from real published URLs)",
];

// ─── Safety ──────────────────────────────────────────────────────────────────
export const WELLNESS_SAFETY_RULES = [
  "This is general wellness and movement information for healthy adults. It is not medical advice, diagnosis, or treatment.",
  "Never name a condition the reader 'has', and never present a routine as a treatment, correction, or cure for one.",
  "No before/after transformation claims, no timeframe promises ('fix your posture in 7 days'), no pain-relief guarantee.",
  "Describe sensation honestly: a stretch should feel like mild tension, never sharp pain. Tell the reader to stop if it does.",
  "Include a plain recommendation to consult a doctor or physical therapist for pain that is severe, new, persistent, or accompanied by numbness, weakness, or tingling.",
  "Do not give routines targeted at pregnancy, post-surgery, or diagnosed conditions — say those readers should get individual clinical advice.",
  "Adult, healthy, everyday-fitness framing only. The 미지 photography is ordinary athletic or pilates clothing in an ordinary setting; nothing suggestive, and no body-shape or weight-loss promise.",
];

// Claim patterns that must not survive into a published wellness article. These
// are checked ONLY for articles in this category, so the existing insurance
// corpus and its QA verdicts are untouched.
export const WELLNESS_CLAIM_PATTERNS = [
  { id: "treatment", re: /\b(?:treats?|treating|heals?|healing|cures?|curing|fixes|fix(?:ing)?)\s+(?:your\s+)?(?:pain|posture|sciatica|herniated|arthritis|tendonitis|impingement|scoliosis|injury|injuries)\b/i },
  { id: "diagnosis", re: /\byou\s+(?:have|are\s+suffering\s+from)\s+(?:a\s+)?(?:herniated|pinched\s+nerve|sciatica|arthritis|tendonitis|impingement|scoliosis)\b/i },
  { id: "guaranteed-relief", re: /\b(?:guarantees?|guaranteed|permanent(?:ly)?|instant(?:ly)?)\s+(?:pain\s+)?relief\b|\bpain[- ]free\s+(?:in|within)\s+\d/i },
  { id: "timeframe-promise", re: /\b(?:fix|correct|reverse|eliminate)\s+(?:your\s+)?(?:posture|neck\s+pain|back\s+pain)\s+in\s+\d+\s*(?:days?|weeks?|minutes?)\b/i },
  { id: "transformation", re: /\bbefore\s+and\s+after\s+(?:photos?|results?|transformation)\b|\bdramatic\s+transformation\b/i },
  { id: "medical-replacement", re: /\bno\s+need\s+(?:to\s+see|for)\s+a\s+(?:doctor|physical\s+therapist|chiropractor)\b|\breplaces?\s+(?:physical\s+)?therapy\b/i },
];

// Wording the article is expected to carry. Absence is a review flag, not a
// hard failure — the writer may have phrased it differently.
export const WELLNESS_CONSULT_PATTERN =
  /\b(?:doctor|physician|physical\s+therapist|healthcare\s+(?:provider|professional)|clinician)\b/i;

/**
 * Category safety gate. Returns { applies, violations, hasConsultAdvice }.
 * `applies` is false for every article outside this category, which is what
 * keeps the existing travel-insurance QA verdicts identical.
 */
export function checkWellnessSafety(article) {
  const category = String(article?.category || "");
  const inCategory =
    category === WELLNESS_CATEGORY_LABEL ||
    WELLNESS_AXIS_IDS.has(String(article?.contentAxis?.id || article?.axis || "")) ||
    isWellnessText(`${article?.title || ""} ${article?.keyword || ""}`);
  if (!inCategory) return { applies: false, violations: [], hasConsultAdvice: true };

  const text = String(article?.bodyHtml || article?.bodyMarkdown || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const haystack = `${article?.title || ""} ${article?.metaDescription || ""} ${text}`;

  return {
    applies: true,
    violations: WELLNESS_CLAIM_PATTERNS.filter((p) => p.re.test(haystack)).map((p) => p.id),
    hasConsultAdvice: WELLNESS_CONSULT_PATTERN.test(haystack),
  };
}

// ─── Pinterest ───────────────────────────────────────────────────────────────
// Four directions for this category. The first three mirror the existing
// question / mistake / checklist trio so the traffic screen behaves the same;
// the fourth is the photo-real 미지 pin that is the point of the category.
export const WELLNESS_PIN_TEMPLATES = [
  {
    id: "question",
    label: "핵심 질문형",
    imageRole: "featured",
    cta: "Read the full ATLAS routine.",
    titlePrefix: "",
    tone: "Ask the reader's own question back to them, in their words.",
    boards: ["Desk Posture Relief", "Everyday Wellness Habits"],
  },
  {
    id: "problem-solution",
    label: "문제·해결형",
    imageRole: "context",
    cta: "See the full routine in the ATLAS guide.",
    titlePrefix: "If your shoulders feel like this",
    tone: "Name the everyday problem, then the routine that answers it. No before/after claim, no promise of relief.",
    boards: ["Neck & Shoulder Stretches", "Small Space Workouts"],
  },
  {
    id: "checklist",
    label: "체크리스트형",
    imageRole: "checklist",
    cta: "Get the full checklist in the ATLAS guide.",
    titlePrefix: "Save this routine",
    tone: "A saveable list — moves, reps, or what to pack. Written to be pinned, not read once.",
    boards: ["Home Pilates for Beginners", "Travel Workout Gear"],
  },
  {
    id: "miji-lifestyle",
    label: "실사형 미지 라이프스타일",
    imageRole: "action",
    cta: "Read how Miji fits it into a normal day.",
    titlePrefix: "Miji's",
    tone:
      "First-person, quiet, real. 미지 in ordinary athletic or pilates clothing doing the actual routine in a real room. " +
      "Lifestyle photography, not a fitness ad: no body-shape claim, no suggestive framing, no transformation copy.",
    boards: ["Miji Wellness Diary", "A Day of Small Healthy Habits"],
  },
];

// Extra spacing for the 4th pin so a four-pin set is still not posted in a
// single day (the existing trio uses [0, 4, 9]).
export const WELLNESS_PIN_OFFSET_DAYS = [0, 4, 9, 14];

/** Board names worth pinning this article to, best-guess from its own topic. */
export function suggestPinBoards(article) {
  const axis = detectWellnessAxis(`${article?.title || ""} ${article?.keyword || ""}`);
  const fromAxis = wellnessAxis(axis)?.pinBoards || [];
  const fromTemplates = WELLNESS_PIN_TEMPLATES.flatMap((t) => t.boards);
  return [...new Set([...fromAxis, ...fromTemplates])].slice(0, 6);
}

// ─── The 20 launch seeds ─────────────────────────────────────────────────────
// Shape matches EDITORIAL_SEEDS in atlas-scope.js so recommendation-engine.js
// evaluates them with the existing Hard Gate — no second scoring path.
// `relatedArticleIds` is filled only where the link is genuine (a travel article
// a travel-fitness routine really does sit next to); the home-fitness seeds are
// honest new-cluster seeds with none.
export const WELLNESS_SEEDS = [
  {
    title: "How to Relieve Neck and Shoulder Stiffness at Home",
    searchIntent: "Find a short at-home routine for everyday neck and shoulder tightness",
    type: "guide",
    axis: "wellness-neck-shoulder-posture",
    relatedArticleIds: [],
    futureProductCategories: ["massage balls", "resistance bands"],
    reason: "Anchor post for the new wellness cluster — the problem the whole category starts from.",
    commercial: 3,
  },
  {
    title: "5 Light Dumbbell Moves for Tight Shoulders",
    searchIntent: "Learn beginner dumbbell moves that target tight shoulders safely",
    type: "guide",
    axis: "wellness-neck-shoulder-posture",
    relatedArticleIds: [],
    futureProductCategories: ["light dumbbells"],
    reason: "Connects the shoulder problem to the first piece of equipment a beginner buys.",
    commercial: 4,
  },
  {
    title: "Simple Pilates Exercises for Forward Head Posture",
    searchIntent: "Follow beginner pilates movements aimed at forward head posture habits",
    type: "guide",
    axis: "wellness-home-fitness-pilates",
    relatedArticleIds: [],
    futureProductCategories: ["yoga mats", "pilates rings"],
    reason: "Brings the pilates modality into the posture axis without repeating the stretching routine.",
    commercial: 3,
  },
  {
    title: "Best Beginner Dumbbells for Home Workouts",
    searchIntent: "Choose a first set of light dumbbells for home use",
    type: "buying-guide",
    axis: "wellness-travel-gear",
    relatedArticleIds: [],
    futureProductCategories: ["light dumbbells"],
    reason: "Highest-intent gear question in the category; maps straight onto Product Center.",
    commercial: 5,
  },
  {
    title: "Resistance Band Exercises for Desk Workers",
    searchIntent: "Use a resistance band for short movement breaks during a desk day",
    type: "guide",
    axis: "wellness-home-fitness-pilates",
    relatedArticleIds: [],
    futureProductCategories: ["resistance bands"],
    reason: "Desk-worker audience with a single cheap piece of equipment.",
    commercial: 4,
  },
  {
    title: "Hotel Room Workout for Travelers With No Gym",
    searchIntent: "Do a full short workout in a hotel room without equipment",
    type: "guide",
    axis: "wellness-travel-fitness",
    relatedArticleIds: ["art_005"],
    futureProductCategories: ["travel workout accessories", "resistance bands"],
    reason: "Bridges the existing travel cluster into the fitness cluster.",
    commercial: 3,
  },
  {
    title: "What to Pack for a Travel Fitness Routine",
    searchIntent: "Decide which light workout items are worth the luggage space",
    type: "checklist",
    axis: "wellness-travel-gear",
    relatedArticleIds: ["art_005"],
    futureProductCategories: ["travel workout accessories", "resistance bands", "yoga mats"],
    reason: "Packing checklist that reuses the travel-preparation habit ATLAS readers already have.",
    commercial: 4,
  },
  {
    title: "Shoulder Mobility Routine After Long Hours at a Desk",
    searchIntent: "Loosen shoulders and upper back after a long day of sitting",
    type: "guide",
    axis: "wellness-neck-shoulder-posture",
    relatedArticleIds: [],
    futureProductCategories: ["resistance bands", "foam rollers"],
    reason: "Mobility angle distinct from the general stiffness-relief anchor post.",
    commercial: 3,
  },
  {
    title: "How to Stretch After a Long Flight",
    searchIntent: "Recover from a long flight with a short stretching sequence on arrival",
    type: "guide",
    axis: "wellness-travel-fitness",
    relatedArticleIds: ["art_005"],
    futureProductCategories: ["travel workout accessories", "massage balls"],
    reason: "Highest-overlap entry point from the existing travel readership.",
    commercial: 3,
  },
  {
    title: "Easy Core Exercises for Beginners at Home",
    searchIntent: "Start a beginner core routine at home without equipment",
    type: "guide",
    axis: "wellness-home-fitness-pilates",
    relatedArticleIds: [],
    futureProductCategories: ["yoga mats"],
    reason: "Beginner entry point for the home-fitness axis.",
    commercial: 3,
  },
  {
    title: "Best Travel-Friendly Workout Gear for Women",
    searchIntent: "Compare packable workout gear for trips",
    type: "buying-guide",
    axis: "wellness-travel-gear",
    relatedArticleIds: ["art_005"],
    futureProductCategories: ["travel workout accessories", "resistance bands", "yoga mats"],
    reason: "Commercial gear comparison aimed at the category's core reader.",
    commercial: 5,
  },
  {
    title: "Daily Posture Habits to Reduce Neck Tension",
    searchIntent: "Adopt small daily habits that keep neck tension from building up",
    type: "checklist",
    axis: "wellness-neck-shoulder-posture",
    relatedArticleIds: [],
    futureProductCategories: ["posture support accessories"],
    reason: "Habit-shaped companion to the routine posts; strong save-rate on Pinterest.",
    commercial: 3,
  },
  {
    title: "Pilates Moves for Upper Back and Shoulder Relief",
    searchIntent: "Use pilates movements for upper back and shoulder tightness",
    type: "guide",
    axis: "wellness-home-fitness-pilates",
    relatedArticleIds: [],
    futureProductCategories: ["yoga mats", "resistance bands"],
    reason: "Upper-back focus keeps it distinct from the forward-head-posture post.",
    commercial: 3,
  },
  {
    title: "How to Stay Active During International Travel",
    searchIntent: "Keep a movement routine going across time zones and itineraries",
    type: "guide",
    axis: "wellness-travel-fitness",
    relatedArticleIds: ["art_005"],
    futureProductCategories: ["travel workout accessories"],
    reason: "Trip-long habit angle rather than a single routine.",
    commercial: 3,
  },
  {
    title: "Mini Dumbbell Workout for Beginners",
    searchIntent: "Follow a short full-body routine using one pair of light dumbbells",
    type: "guide",
    axis: "wellness-home-fitness-pilates",
    relatedArticleIds: [],
    futureProductCategories: ["light dumbbells"],
    reason: "Full-body routine for the equipment the gear post recommends.",
    commercial: 4,
  },
  {
    title: "Best Massage Ball Exercises for Tight Shoulders",
    searchIntent: "Release tight shoulders with a massage ball at home",
    type: "guide",
    axis: "wellness-neck-shoulder-posture",
    relatedArticleIds: [],
    futureProductCategories: ["massage balls", "foam rollers"],
    reason: "Distinct modality for the same body area, and the cheapest product entry point.",
    commercial: 4,
  },
  {
    title: "Travel Wellness Habits for Frequent Flyers",
    searchIntent: "Build repeatable wellness habits around a heavy flying schedule",
    type: "checklist",
    axis: "wellness-travel-fitness",
    relatedArticleIds: ["art_005"],
    futureProductCategories: ["travel workout accessories", "massage balls"],
    reason: "Frequent-flyer habit checklist that complements the existing travel-health guides.",
    commercial: 3,
  },
  {
    title: "At-Home Stretching Routine for Office Workers",
    searchIntent: "Follow a short stretching sequence built around an office day",
    type: "guide",
    axis: "wellness-home-fitness-pilates",
    relatedArticleIds: [],
    futureProductCategories: ["yoga mats", "resistance bands"],
    reason: "Office-day framing separates it from the neck-and-shoulder anchor post.",
    commercial: 3,
  },
  {
    title: "How to Build a Simple Home Fitness Starter Kit",
    searchIntent: "Assemble a minimal home fitness kit without overbuying",
    type: "buying-guide",
    axis: "wellness-travel-gear",
    relatedArticleIds: [],
    futureProductCategories: ["light dumbbells", "resistance bands", "yoga mats", "massage balls"],
    reason: "Hub post that every Product Center item in the category can hang off.",
    commercial: 5,
  },
  {
    title: "Best Lightweight Workout Accessories for Small Spaces",
    searchIntent: "Find workout accessories that fit a small apartment",
    type: "buying-guide",
    axis: "wellness-travel-gear",
    relatedArticleIds: [],
    futureProductCategories: ["resistance bands", "yoga mats", "massage balls"],
    reason: "Small-space angle reaches renters and city readers the travel posts do not.",
    commercial: 5,
  },
];

// ─── Future series hook ──────────────────────────────────────────────────────
// "Miji Wellness" is the intended series name once this category has its own
// cadence. Declared here so the naming is fixed before the first article ships.
export const MIJI_WELLNESS_SERIES = {
  id: "miji-wellness",
  name: "Miji Wellness",
  heroCharacterId: "miji",
  description:
    "A running diary of the small movement habits 미지 actually keeps — at a desk, in a hotel room, " +
    "and on the way home from a long flight.",
  parentSeriesId: "atlas-letters",
};
