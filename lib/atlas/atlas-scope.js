// ─── ATLAS Content Scope (R2.1 hotfix) ───────────────────────────────────────
// The single source of truth for what ATLAS is allowed to recommend on
// blog_001: overseas (incl. US) English readers, across two clusters —
//   1. travel-insurance / travel-medical / trip-safety (the original scope), and
//   2. Travel Wellness & Everyday Fitness (see wellness-scope.js).
// This module holds the axes, an English editorial seed catalog, and the
// detectors used by the Hard Gate. It does NOT invent trends.
//
// The wellness category is MERGED in rather than written out again here: its
// axes, seeds and detectors live in wellness-scope.js, so the insurance rules
// below stay exactly as they were and the two clusters cannot drift into each
// other's Hard Gate.
import {
  WELLNESS_CONTENT_AXES,
  WELLNESS_SEEDS,
  detectWellnessAxis,
} from "./wellness-scope.js";

// The 10 permitted travel-insurance / travel-safety axes.
export const TRAVEL_CONTENT_AXES = [
  { id: "international-travel-insurance", label: "International Travel Insurance" },
  { id: "travel-medical-insurance", label: "Travel Medical Insurance" },
  { id: "trip-cancellation-interruption", label: "Trip Cancellation and Interruption" },
  { id: "emergency-medical-evacuation", label: "Emergency Medical and Evacuation Coverage" },
  { id: "baggage-travel-disruption", label: "Baggage Delay, Loss and Travel Disruption" },
  { id: "trip-preparation-safety", label: "International Trip Preparation and Safety" },
  { id: "destination-risk-preparation", label: "Destination-specific Travel Risk Preparation" },
  { id: "traveler-segment-coverage", label: "Family, Senior, Student and Frequent Traveler Coverage" },
  { id: "adventure-outdoor-safety", label: "Adventure and Outdoor Travel Safety" },
  { id: "travel-product-comparison", label: "Overseas Travel Safety & Convenience Product Comparison" },
];

// Every axis a production candidate may sit on: the travel cluster plus the
// wellness cluster. The Hard Gate reads AXIS_IDS, so appending here is what
// makes a wellness topic producible at all.
export const CONTENT_AXES = [...TRAVEL_CONTENT_AXES, ...WELLNESS_CONTENT_AXES];

export const AXIS_IDS = new Set(CONTENT_AXES.map((a) => a.id));
export function axisLabel(id) {
  return CONTENT_AXES.find((a) => a.id === id)?.label || id;
}

// Hangul presence → not an English candidate.
const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
export function isEnglish(text) {
  const t = String(text || "");
  return t.length > 0 && !HANGUL.test(t);
}

// Explicitly out-of-scope signals (used to REJECT keyword/category pool items).
const OUT_OF_SCOPE = [
  /chatgpt|\bai\b|artificial intelligence|prompt|productivity|생산성|챗gpt/i,
  /자동차\s*보험|car insurance|auto insurance|전기세|생활비|정부지원금|연말정산/i,
  /crypto|bitcoin|주식|stock|loan|대출|mortgage/i,
  /celebrity|연예|gossip|viral|밈|meme/i,
  /road trip|electric car|northern lights|spacex|nasa|declutter|side hustle/i,
];

// In-scope keyword signals → maps free text to an axis when possible.
const SCOPE_SIGNALS = [
  { re: /evacuation|medevac|air ambulance|repatriation/i, axis: "emergency-medical-evacuation" },
  { re: /trip cancellation|cancel|interruption|delay reimbursement/i, axis: "trip-cancellation-interruption" },
  { re: /baggage|luggage|lost bag|delayed bag/i, axis: "baggage-travel-disruption" },
  { re: /travel medical|medical coverage|health coverage abroad|get sick|illness abroad/i, axis: "travel-medical-insurance" },
  { re: /student|senior|family|frequent traveler|multi.?trip|annual/i, axis: "traveler-segment-coverage" },
  { re: /adventure|hiking|diving|skiing|outdoor/i, axis: "adventure-outdoor-safety" },
  { re: /vaccin|cdc|destination|food and water|water safety|risk by/i, axis: "destination-risk-preparation" },
  { re: /checklist|prepare|preparation|before you (go|travel)|safety/i, axis: "trip-preparation-safety" },
  { re: /compare|comparison|best .* (site|provider)|worth it/i, axis: "travel-product-comparison" },
  { re: /travel insurance|trip insurance|coverage/i, axis: "international-travel-insurance" },
];

// Returns { inScope, axis, outOfScope } for arbitrary text (keyword/category).
// The wellness detector runs FIRST because its signals are narrow and specific
// (stretch / posture / pilates / dumbbell / workout ...), while several travel
// signals below are broad enough to swallow a fitness topic — "How to Stretch
// After a Long Flight" would otherwise be filed under flight disruption. The
// reverse cannot happen: detectWellnessAxis returns null unless the text
// carries a real movement signal, which no insurance topic does.
export function detectScope(text) {
  const t = String(text || "");
  if (OUT_OF_SCOPE.some((re) => re.test(t))) return { inScope: false, axis: null, outOfScope: true };
  const wellness = detectWellnessAxis(t);
  if (wellness) return { inScope: true, axis: wellness, outOfScope: false };
  const hit = SCOPE_SIGNALS.find((s) => s.re.test(t));
  if (hit) return { inScope: true, axis: hit.axis, outOfScope: false };
  return { inScope: false, axis: null, outOfScope: false };
}

// ─── Editorial evergreen seed catalog (English, in-scope) ────────────────────
// These are ATLAS editorial candidates — NOT live-trend data. They complement
// art_002~006 without repeating their search intent. Each declares official
// source availability (authoritative sources exist: US State Dept, CDC, insurer
// policy wordings) and the product categories that COULD be monetized once an
// affiliate program is approved (no active links today).
export const TRAVEL_EDITORIAL_SEEDS = [
  {
    title: "What Trip Cancellation Insurance Actually Covers (and What It Doesn't)",
    searchIntent: "Understand which cancellation reasons are reimbursable before buying a policy",
    type: "guide",
    axis: "trip-cancellation-interruption",
    relatedArticleIds: ["art_002", "art_003"],
    futureProductCategories: ["travel insurance comparison", "cancel-for-any-reason upgrade"],
    reason: "Complements the comparison guides with a focused explainer on a high-confusion coverage type.",
    commercial: 4,
  },
  {
    title: "How Medical Evacuation Coverage Works on an International Trip",
    searchIntent: "Learn when medical evacuation is needed and how benefit limits apply abroad",
    type: "guide",
    axis: "emergency-medical-evacuation",
    relatedArticleIds: ["art_003", "art_004"],
    futureProductCategories: ["evacuation membership", "travel medical insurance"],
    reason: "Extends the travel-medical cluster into evacuation, a distinct high-cost risk not covered by existing posts.",
    commercial: 4,
  },
  {
    title: "Travel Insurance for Baggage Delay and Lost Luggage: What to Check",
    searchIntent: "Decide whether baggage protection is worth it and how to file a claim",
    type: "comparison",
    axis: "baggage-travel-disruption",
    relatedArticleIds: ["art_002"],
    futureProductCategories: ["travel insurance comparison", "luggage trackers"],
    reason: "Adds a disruption-focused angle absent from the current cluster.",
    commercial: 4,
  },
  {
    title: "Choosing Travel Medical Insurance for Senior Travelers",
    searchIntent: "Find age-appropriate travel medical coverage and pre-existing condition rules",
    type: "segment-guide",
    axis: "traveler-segment-coverage",
    relatedArticleIds: ["art_003"],
    futureProductCategories: ["senior travel medical insurance"],
    reason: "Segment-specific guidance that differentiates from the general comparison posts.",
    commercial: 5,
  },
  {
    title: "Student Travel Insurance for Studying Abroad: A Practical Guide",
    searchIntent: "Compare student travel medical plans for a semester or year abroad",
    type: "segment-guide",
    axis: "traveler-segment-coverage",
    relatedArticleIds: ["art_003"],
    futureProductCategories: ["student travel insurance"],
    reason: "Reaches the study-abroad audience with a distinct purchase intent.",
    commercial: 5,
  },
  {
    title: "Travel Insurance for Adventure and Outdoor Activities Abroad",
    searchIntent: "Understand exclusions and add-ons for hiking, diving and skiing trips",
    type: "guide",
    axis: "adventure-outdoor-safety",
    relatedArticleIds: ["art_002"],
    futureProductCategories: ["adventure sports coverage", "outdoor safety gear"],
    reason: "Adds an activity-risk angle and connects to future outdoor-gear product comparison.",
    commercial: 4,
  },
  {
    title: "How to Prepare for Travel Health Risks by Destination",
    searchIntent: "Check destination-specific health risks and required precautions before departure",
    type: "checklist",
    axis: "destination-risk-preparation",
    relatedArticleIds: ["art_004", "art_006"],
    futureProductCategories: ["travel medical insurance", "vaccination/telehealth services"],
    reason: "Bridges the travel-health posts with a destination-planning workflow.",
    commercial: 3,
  },
  {
    title: "A Pre-Trip Safety Checklist for International Travelers",
    searchIntent: "Complete essential safety and documentation steps before an international trip",
    type: "checklist",
    axis: "trip-preparation-safety",
    relatedArticleIds: ["art_005"],
    futureProductCategories: ["travel insurance comparison", "document/ID protection"],
    reason: "Broadens preparation beyond the health kit into overall trip safety.",
    commercial: 3,
  },
  {
    title: "How to Use Travel Insurance Comparison Sites Effectively",
    searchIntent: "Compare multiple travel insurance quotes without overpaying or under-covering",
    type: "buying-guide",
    axis: "travel-product-comparison",
    relatedArticleIds: ["art_002"],
    futureProductCategories: ["travel insurance comparison marketplace"],
    reason: "High monetization-fit buying guide that maps directly to future affiliate marketplaces.",
    commercial: 5,
  },
  {
    title: "Annual Multi-Trip Travel Insurance: Is It Worth It?",
    searchIntent: "Decide between single-trip and annual multi-trip policies for frequent travelers",
    type: "comparison",
    axis: "traveler-segment-coverage",
    relatedArticleIds: ["art_002", "art_003"],
    futureProductCategories: ["annual multi-trip insurance"],
    reason: "Frequent-traveler comparison with clear commercial intent.",
    commercial: 5,
  },
  {
    title: "Does Your Health Insurance Cover You Abroad? What to Know",
    searchIntent: "Verify whether domestic health insurance applies overseas and fill the gaps",
    type: "guide",
    axis: "travel-medical-insurance",
    relatedArticleIds: ["art_003", "art_004"],
    futureProductCategories: ["travel medical insurance"],
    reason: "Answers a common pre-purchase question that leads into travel-medical coverage.",
    commercial: 4,
  },
  {
    title: "Emergency Medical Coverage Limits: How Much Is Enough Abroad?",
    searchIntent: "Choose adequate emergency medical benefit limits for an international trip",
    type: "guide",
    axis: "emergency-medical-evacuation",
    relatedArticleIds: ["art_002", "art_003"],
    futureProductCategories: ["travel medical insurance"],
    reason: "Deepens the coverage-limits discussion without repeating the comparison posts.",
    commercial: 4,
  },
];

// Both clusters in one catalog. Order is irrelevant — recommendation-engine.js
// re-sorts by score — but keeping the travel seeds first preserves the existing
// tie-break order for the insurance cards.
export const EDITORIAL_SEEDS = [...TRAVEL_EDITORIAL_SEEDS, ...WELLNESS_SEEDS];
