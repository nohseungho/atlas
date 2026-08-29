// ─── ATLAS Disaster Preparedness & Emergency Essentials (category V1) ────────
// The third content category on blog_001, and the only one that touches an
// active disaster. Everything in this module exists to keep one promise:
//
//   ATLAS must never look like it is monetizing someone else's disaster.
//
// That promise is not a tone guideline — it is enforced structurally:
//   • The article order is FIXED (condolence → situation → how to help → what
//     communities need → prepare your own household → products → sources →
//     related). Relief comes before preparedness; preparedness comes before any
//     product; a product is never the answer to a casualty figure.
//   • The relief half of the article (sections 1-4) is an AFFILIATE-FREE ZONE
//     and the product half (section 6) is a DONATION-FREE ZONE. The QA gate
//     parses the published body and fails the article when the two mix.
//   • "Buy this and it helps victims" is refused outright. DONATION_MATCHING
//     stays disabled until a real ratio, recipient, period and remittance
//     record exist, and no copy may claim otherwise before then.
//
// PURE (no IO, no @/ imports) so routes, screens and tests share one source.

export const DISASTER_CATEGORY_ID = "cat_disaster_prep";
export const DISASTER_CATEGORY_SLUG = "disaster-preparedness";
export const DISASTER_CATEGORY_LABEL = "Disaster Preparedness & Emergency Essentials";

export const DISASTER_CATEGORY = {
  id: DISASTER_CATEGORY_ID,
  slug: DISASTER_CATEGORY_SLUG,
  label: DISASTER_CATEGORY_LABEL,
  description:
    "Public-interest disaster information and household emergency preparedness — floods, landslides, storms, " +
    "earthquakes, wildfires and power outages. Relief information first, preparedness second, products last and " +
    "strictly separated from donations.",
  targetMarket: "us",
  adSenseCategory: "News",
  blogId: "blog_001",
  exampleKeywords: [
    "what to put in a home emergency kit",
    "how to prepare your home for a flood warning",
    "how to prepare for a multi-day power outage",
  ],
};

// ─── The 6 topic axes ────────────────────────────────────────────────────────
export const DISASTER_AXES = [
  {
    id: "disaster-flood-landslide",
    label: "Flood & Landslide Preparedness",
    focus: "Flood warnings, flash flooding, saturated-slope landslide risk, and protecting a home and its documents.",
    productHints: ["waterproof document pouches", "dry bags", "water storage containers", "portable water filters"],
    tags: ["Flood Preparedness", "Landslide", "Home Safety", "Emergency Planning"],
    topicEntities: ["flood warning", "flash flood", "landslide risk", "sandbags", "document protection"],
    pinBoards: ["Flood Preparedness Checklists", "Home Emergency Planning"],
  },
  {
    id: "disaster-earthquake",
    label: "Earthquake Preparedness",
    focus: "Securing a home before shaking, what to do during it, and the first hours after.",
    productHints: ["emergency first aid kits", "flashlights / headlamps", "whistles", "emergency backpacks"],
    tags: ["Earthquake Preparedness", "Home Safety", "Drop Cover Hold On", "Emergency Planning"],
    topicEntities: ["earthquake drill", "furniture anchoring", "aftershock", "drop cover hold on"],
    pinBoards: ["Earthquake Preparedness", "Home Emergency Planning"],
  },
  {
    id: "disaster-storm-hurricane",
    label: "Storm & Hurricane Preparedness",
    focus: "Hurricane, typhoon and severe-storm warnings: the household steps that have a deadline.",
    productHints: ["emergency radios", "portable power banks", "flashlights / headlamps", "water storage containers"],
    tags: ["Hurricane Preparedness", "Storm Season", "Emergency Planning", "Home Safety"],
    topicEntities: ["hurricane warning", "typhoon", "storm surge", "evacuation order"],
    pinBoards: ["Storm Season Checklists", "Hurricane Preparedness"],
  },
  {
    id: "disaster-wildfire-evacuation",
    label: "Wildfire & Evacuation",
    focus: "Wildfire risk, evacuation planning, and what a family takes when there is no time to think.",
    productHints: ["emergency backpacks", "waterproof document pouches", "emergency blankets", "whistles"],
    tags: ["Wildfire Safety", "Evacuation Plan", "Go Bag", "Family Preparedness"],
    topicEntities: ["evacuation order", "go-bag", "defensible space", "air quality"],
    pinBoards: ["Family Evacuation Planning", "Go-Bag Checklists"],
  },
  {
    id: "disaster-power-outage",
    label: "Power Outage & Emergency Power",
    focus: "Multi-day outages: light, information, refrigeration, charging, and staying warm safely.",
    productHints: ["portable power banks", "emergency radios", "flashlights / headlamps", "emergency blankets"],
    tags: ["Power Outage", "Emergency Power", "Home Safety", "Emergency Planning"],
    topicEntities: ["power outage", "backup power", "food safety", "carbon monoxide"],
    pinBoards: ["Power Outage Preparedness", "Home Emergency Planning"],
  },
  {
    id: "disaster-emergency-kits",
    label: "Emergency Kits & Supplies",
    focus: "The kit itself: what belongs in it, how much water, and how a household keeps it current.",
    productHints: [
      "emergency first aid kits",
      "emergency backpacks",
      "water storage containers",
      "portable water filters",
      "hygiene kits",
      "emergency blankets",
    ],
    tags: ["Emergency Kit", "Go Bag", "Preparedness Checklist", "Family Preparedness"],
    topicEntities: ["emergency kit", "go-bag", "water storage", "first aid kit", "72 hours"],
    pinBoards: ["Emergency Kit Checklists", "Go-Bag Checklists"],
  },
];

export const DISASTER_AXIS_IDS = new Set(DISASTER_AXES.map((a) => a.id));

export function disasterAxis(id) {
  return DISASTER_AXES.find((a) => a.id === id) || null;
}

export const DISASTER_CONTENT_AXES = DISASTER_AXES.map(({ id, label }) => ({ id, label }));

// ─── Detection ───────────────────────────────────────────────────────────────
// A hazard word alone is not enough. "When to Buy Travel Insurance for Hurricane
// Season" (art_014) is an insurance article about a hazard, and re-routing it
// into this category would break the published travel cluster. So any text that
// carries an insurance/coverage signal is refused here before anything else.
const INSURANCE_GUARD =
  /insurance|policy wording|\bpolicies\b|\bcoverage\b|\bcovered\b|deductible|premium|reimburs|\bclaim\b|medical evacuation|medevac|\bcfar\b/i;

const DISASTER_CORE =
  /\bflood(?:ing|s|ed)?\b|landslide|mudslide|earthquake|aftershock|\bseismic\b|hurricane|typhoon|\bcyclone\b|storm surge|severe storm|wildfire|bushfire|wildfires|power outage|blackout|grid down|evacuat|emergency kit|emergency kits|go[- ]bag|go bag|disaster prepared|emergency prepared|emergency supplies|first aid kit|emergency radio|shelter[- ]in[- ]place/i;

export function isDisasterText(text) {
  const t = String(text || "");
  if (INSURANCE_GUARD.test(t)) return false;
  return DISASTER_CORE.test(t);
}

// Most specific first. A kit/go-bag question is a supplies article even when it
// names a hazard, because that is what the reader is actually shopping for.
const AXIS_SIGNALS = [
  { axis: "disaster-emergency-kits", re: /emergency kit|go[- ]bag|go bag|first aid kit|emergency supplies|how much (?:emergency )?water|water storage|hygiene kit/i },
  { axis: "disaster-power-outage", re: /power outage|blackout|grid down|emergency power|without electricity|backup power|power bank/i },
  { axis: "disaster-wildfire-evacuation", re: /wildfire|bushfire|evacuat/i },
  { axis: "disaster-flood-landslide", re: /\bflood(?:ing|s|ed)?\b|landslide|mudslide|sandbag/i },
  { axis: "disaster-earthquake", re: /earthquake|aftershock|\bseismic\b/i },
  { axis: "disaster-storm-hurricane", re: /hurricane|typhoon|\bcyclone\b|storm surge|severe storm|\bstorm\b/i },
];

/** Maps free text to a disaster axis id, or null when it is not this category. */
export function detectDisasterAxis(text) {
  const t = String(text || "");
  if (!isDisasterText(t)) return null;
  const hit = AXIS_SIGNALS.find((s) => s.re.test(t));
  // A preparedness text naming no specific hazard is a kits/supplies article.
  return hit ? hit.axis : "disaster-emergency-kits";
}

// ─── Duplicate-signature dimensions ──────────────────────────────────────────
// Two preparedness guides are the same article only when they cover the same
// hazard, through the same artifact, for the same reason. "Flood warning at
// home" and "protecting documents from flood damage" share a hazard and are
// still two different guides.
export const DISASTER_HAZARD_SIGNALS = [
  { id: "flood", re: /flood|landslide|mudslide/ },
  { id: "earthquake", re: /earthquake|aftershock|seismic/ },
  { id: "storm", re: /hurricane|typhoon|cyclone|storm/ },
  { id: "wildfire", re: /wildfire|bushfire/ },
  { id: "outage", re: /outage|blackout|electricity|power/ },
];

export const DISASTER_ARTIFACT_SIGNALS = [
  { id: "kit", re: /emergency kit|first aid|supplies/ },
  { id: "go-bag", re: /go bag|go-bag|evacuat/ },
  { id: "water", re: /water/ },
  { id: "documents", re: /document|paperwork|records/ },
  { id: "power", re: /power|electricity|radio|flashlight|battery/ },
  { id: "food", re: /food|fridge|refrigerat/ },
  { id: "communication", re: /communication|contact|meeting point/ },
  { id: "home-hardening", re: /secure|anchor|board up|defensible|sandbag/ },
];

// ─── Product Center ──────────────────────────────────────────────────────────
// The 12 product families this category may connect — and only from section 6.
export const DISASTER_PRODUCT_CATEGORIES = [
  { id: "first-aid-kits", label: "emergency first aid kits", re: /first[- ]aid|trauma kit|medical kit/i },
  { id: "flashlights", label: "flashlights / headlamps", re: /flashlight|headlamp|torch|lantern/i },
  { id: "power-banks", label: "portable power banks", re: /power bank|powerbank|portable charger|power station/i },
  { id: "emergency-radios", label: "emergency radios", re: /emergency radio|weather radio|noaa radio|crank radio/i },
  { id: "document-pouches", label: "waterproof document pouches", re: /document (?:pouch|bag|case)|waterproof (?:pouch|case|wallet)/i },
  { id: "dry-bags", label: "dry bags", re: /dry bag|dry sack|waterproof bag/i },
  { id: "emergency-blankets", label: "emergency blankets", re: /emergency blanket|mylar blanket|space blanket|thermal blanket/i },
  { id: "water-storage", label: "water storage containers", re: /water (?:container|storage|jug|jerry|bladder)/i },
  { id: "water-filters", label: "portable water filters", re: /water filter|water purif|purification tablet/i },
  { id: "whistles", label: "whistles", re: /whistle/i },
  { id: "emergency-backpacks", label: "emergency backpacks", re: /emergency (?:backpack|bag)|survival (?:backpack|bag)|bug[- ]out bag/i },
  { id: "hygiene-kits", label: "hygiene kits", re: /hygiene kit|sanitation kit|toiletry kit/i },
];

export function suggestProductCategories(input) {
  const axis = disasterAxis(input) || disasterAxis(detectDisasterAxis(input));
  if (axis) return [...axis.productHints];
  return DISASTER_PRODUCT_CATEGORIES.map((c) => c.label);
}

/**
 * Ranks Product Center products against a preparedness topic. Returns only
 * genuine matches, best first — never a filler suggestion, and nothing at all
 * for a topic outside this category.
 */
export function suggestProductsForTopic(topic, products = []) {
  const text = String(topic || "");
  if (!isDisasterText(text)) return [];
  const hints = suggestProductCategories(text).map((h) => h.toLowerCase());

  return (products || [])
    .map((p) => {
      const hay = `${p?.name || ""} ${p?.category || ""} ${(p?.features || []).join(" ")} ${p?.benefit || ""}`;
      const matched = DISASTER_PRODUCT_CATEGORIES.filter((c) => c.re.test(hay));
      if (!matched.length) return null;
      const hinted = matched.filter((c) => hints.some((h) => h.includes(c.label) || c.label.includes(h)));
      return {
        productId: String(p?.id || ""),
        name: String(p?.name || ""),
        score: matched.length + hinted.length * 2,
        matchedCategories: matched.map((c) => c.label),
        recommended: hinted.length > 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export const DISASTER_PRODUCT_RULES = [
  "Products appear ONLY in section 6 (Emergency Products). No product name, product link, price, or buy button may appear anywhere in sections 1-4.",
  "Section 6 is about the reader's OWN household preparedness. Never present a purchase as a way to help the affected community.",
  "Never write that buying a product sends anything to victims, funds relief, or is matched by a donation. ATLAS has no such program configured.",
  "Every product mention carries the affiliate disclosure. If a product has no approved affiliate link, describe the category and link nothing.",
  "No urgency built on the disaster: no 'before it's too late', no 'stock up now', no countdown, no scarcity claim.",
  "Never invent stock status, ratings, review counts, or a discount the snapshot does not carry.",
];

// ─── Donations: the non-revenue zone ─────────────────────────────────────────
export const DONATION_DISCLOSURE = "ATLAS does not earn a commission from donation links.";

// Sections that may never contain an affiliate link or a product.
export const AFFILIATE_FORBIDDEN_SECTIONS = ["condolence", "situation", "howToHelp", "communityNeeds"];
// Sections that may never contain a donation link — so a reader can never
// mistake a purchase for giving.
export const DONATION_FORBIDDEN_SECTIONS = ["products"];

// Verified relief organisations whose own donation pages may be linked. The
// writer must still confirm the organisation has an ACTIVE appeal for the
// specific event — a general homepage link is not a relief link.
export const OFFICIAL_RELIEF_ORGS = [
  { name: "American Red Cross", host: "redcross.org" },
  { name: "IFRC (Red Cross / Red Crescent)", host: "ifrc.org" },
  { name: "UNICEF", host: "unicef.org" },
  { name: "UN World Food Programme", host: "wfp.org" },
  { name: "UN OCHA", host: "unocha.org" },
  { name: "ReliefWeb (UN OCHA)", host: "reliefweb.int" },
  { name: "World Health Organization", host: "who.int" },
  { name: "Direct Relief", host: "directrelief.org" },
  { name: "Team Rubicon", host: "teamrubiconusa.org" },
  { name: "All Hands and Hearts", host: "allhandsandhearts.org" },
  { name: "The Salvation Army", host: "salvationarmyusa.org" },
];

export const OFFICIAL_RELIEF_HOSTS = OFFICIAL_RELIEF_ORGS.map((o) => o.host);

/**
 * ATLAS "we donate a share of affiliate revenue" feature.
 *
 * DISABLED, and it must stay disabled until all four fields below are real:
 * an actual percentage, a named recipient, a defined period, and a remittance
 * record that can be shown. Until then no article may claim a purchase donates
 * anything — checkDisasterSafety() fails the article that does.
 */
export const DONATION_MATCHING = {
  enabled: false,
  ratio: null,
  recipientOrg: null,
  period: null,
  remittanceRecordUrl: null,
  reason: "비율·수령 기관·기간·송금 기록이 설정되지 않았습니다. 설정 전까지 '구매하면 기부됩니다' 문구는 금지입니다.",
};

export function donationMatchingActive() {
  const m = DONATION_MATCHING;
  return Boolean(m.enabled && m.ratio && m.recipientOrg && m.period && m.remittanceRecordUrl);
}

// ─── Article shape (fixed order) ─────────────────────────────────────────────
// The order is the ethic. Relief before preparedness, preparedness before
// products — so a casualty figure is never followed by a buy button.
export const DISASTER_MASTER_SECTIONS = [
  "1. Condolence / Human Impact (open by acknowledging the people affected and those who died, in plain restrained language — no graphic detail, no photographs of victims, never used as a hook)",
  "2. Current Situation (what official sources report right now — government agencies, UN/OCHA, Red Cross/IFRC, UNICEF, WHO. Attribute every figure to a named source and its date. No unverified casualty numbers, no social-media rumour)",
  "3. How to Help (donation links to verified relief organisations with an ACTIVE appeal for this event. NO affiliate links, no products, no purchase of any kind in this section. State plainly: \"" + DONATION_DISCLOSURE + "\")",
  "4. What Affected Communities Need (only the needs the relief organisations themselves have published. Do NOT tell readers to ship personal goods; include shipping or in-kind instructions only where an official organisation has explicitly asked for them)",
  "5. Prepare Your Own Household (the shift to general preparedness: emergency bag, drinking water, flashlight, radio, power bank, first aid kit, waterproof pouch, blanket, water treatment)",
  "6. Emergency Products (the ONLY section where an affiliate product may appear. It is about the reader's own household — never framed as helping the affected community. Affiliate disclosure required here)",
  "7. Sources & Official Relief Links (>= 3 verifiable HTTPS official sources: FEMA/Ready.gov, NOAA/NWS, USGS, Red Cross/IFRC, UN OCHA/ReliefWeb, UNICEF, WHO)",
  "8. Related ATLAS Guides (leave the empty <ul> — ATLAS fills it from real published URLs)",
];

export const DISASTER_NARRATIVE_FLOW = [
  "Open with the people, not the event: acknowledge those who died and the families affected, briefly and without graphic detail.",
  "Report only what an official source says, attributed by name and date. If a figure is not confirmed, say it is not confirmed.",
  "Point readers to verified relief organisations' own donation pages, and state that ATLAS earns nothing from them.",
  "Describe the needs the relief organisations themselves published — never invite readers to ship goods on their own initiative.",
  "Only then turn to the reader's own household preparedness.",
  "Only after that, and only in section 6, connect emergency products with the affiliate disclosure.",
  "Close with official sources and Related ATLAS Guides.",
];

export const DISASTER_SAFETY_RULES = [
  "Never use a disaster, its victims, or its images to drive clicks or sales. If a sentence would not be written for a reader who lost someone, do not write it.",
  "No graphic or sensational description: no bodies, no gore, no 'shocking footage', no 'you won't believe'.",
  "Every casualty, damage or displacement figure must name the official source reporting it and when. An unattributed number is not publishable.",
  "Never present a rumour, a social-media claim, or an unnamed 'reports say' as fact.",
  "Donation links go only to verified relief organisations with an active appeal for this event. Never invent an organisation, and never dress a shop link, a crowdfunding page, or an affiliate link as a donation link.",
  "If no official donation link can be verified, say so and link the official information source instead. Do not substitute a purchase.",
  "Sections 1-4 contain no product, no affiliate link, and no purchase CTA. Section 6 contains no donation link. The two are never combined in one button or one CTA.",
  "Never claim a purchase donates, funds relief, or is matched. ATLAS has no donation-matching program configured.",
  "No urgency or scarcity framing built on the disaster ('before it's too late', 'stock up now', 'selling out').",
  "Preparedness advice is general public-safety information and defers to local authorities and evacuation orders.",
];

// ─── QA: the five named gates ────────────────────────────────────────────────

// 1. sensationalDisasterClaims — disaster used as spectacle.
export const SENSATIONAL_PATTERNS = [
  /\b(?:horrifying|gruesome|grisly|harrowing footage|apocalyptic|hellscape|carnage|massacre)\b/i,
  /\byou\s+(?:won'?t|will\s+not)\s+believe\b/i,
  /\b(?:shocking|disturbing|graphic)\s+(?:footage|images|photos|video|scenes)\b/i,
  /\bwatch\s+the\s+moment\b|\bcaught\s+on\s+camera\b|\bcaught\s+on\s+video\b/i,
  /\bbodies\s+(?:piled|everywhere|litter|strewn)\b/i,
  /\bsee\s+(?:the\s+)?(?:photos|pictures|images)\s+(?:here|below)\b/i,
];

// 2. unverifiedCasualtyClaims — a number about people with nothing behind it.
const CASUALTY_SENTENCE =
  /\b\d[\d,.]*\s*(?:\+|plus)?\s*(?:people|persons|residents|families|households)?\s*(?:are|were|have\s+been|remain|is)?\s*(?:dead|died|deaths|killed|fatalities|casualties|missing|injured|displaced|homeless)\b/i;
// Attribution the sentence (or its neighbour) must carry.
const ATTRIBUTION =
  /\b(?:according to|reported by|per\s+the|said|says|confirmed by|data from|as of)\b|\b(?:FEMA|USGS|NOAA|NWS|WHO|UNICEF|OCHA|ReliefWeb|Red Cross|IFRC|Red Crescent|United Nations|government|ministry|agency|authorities|officials)\b/i;
const RUMOUR_PATTERNS = [
  /\breports?\s+(?:say|suggest|claim)\b(?!\s+(?:by|from))/i,
  /\bsocial\s+media\s+(?:says|claims|reports)\b/i,
  /\bit\s+is\s+rumou?red\b|\brumou?rs?\s+(?:say|suggest)\b/i,
  /\bunconfirmed\s+reports?\s+(?:say|claim)\b/i,
];

// 4. fakeDonationClaim — "your purchase helps the victims".
export const FAKE_DONATION_PATTERNS = [
  /\b(?:every|each)\s+purchase\s+(?:helps|donates|supports|funds|goes)\b/i,
  /\b(?:proceeds|profits|revenue|commissions?)\s+(?:go|goes|will go|are donated|is donated)\b/i,
  /\bwe\s+donate\b[^.]{0,60}\b(?:sale|purchase|order|commission)\b/i,
  /\bbuy(?:ing)?\s+(?:this|these|it)\s+(?:helps|sends|supports|feeds|funds)\b/i,
  /\ba\s+(?:portion|percentage|share)\s+of\s+(?:each|every|all)\s+(?:sale|purchase|order)\b/i,
  /\bdonation\s+matched?\b|\bmatching\s+donation\b/i,
  /\bshop\s+to\s+(?:help|donate|support)\b|\bdonate\s+by\s+(?:buying|shopping)\b/i,
];

// 5. exploitativeCTA — the disaster turned into a purchase deadline.
export const EXPLOITATIVE_CTA_PATTERNS = [
  /\bbefore\s+it'?s\s+too\s+late\b/i,
  /\bstock\s+up\s+(?:now|before|today)\b/i,
  /\bdon'?t\s+wait\b[^.]{0,40}\b(?:buy|order|shop|grab)\b/i,
  /\b(?:selling|sold)\s+out\s+fast\b|\bwhile\s+supplies\s+last\b/i,
  /\bcould\s+(?:be|happen\s+to)\s+you\s+next\b/i,
  /\bprotect\s+your\s+family\s+(?:now|today)\b[^.]{0,40}\b(?:buy|order|shop)\b/i,
  /\b(?:limited\s+time|act\s+now|hurry)\b/i,
];

// Surfaces that mark a passage as commercial.
const AFFILIATE_SURFACE =
  /<a[^>]+href=["'][^"']*(?:amzn\.to|amazon\.[a-z.]{2,6}\/|tag=[a-z0-9-]+-20|aliexpress|coupang|rakuten|shareasale|impact\.com|awin|cj\.com)/i;
const PURCHASE_CTA = /\b(?:buy\s+now|shop\s+now|add\s+to\s+cart|check\s+price|view\s+on\s+amazon|order\s+now|best\s+price)\b/i;
const DONATION_SURFACE = new RegExp(
  `<a[^>]+href=["'][^"']*(?:${OFFICIAL_RELIEF_HOSTS.map((h) => h.replace(/\./g, "\\.")).join("|")})`,
  "i",
);
const DONATION_WORDS = /\b(?:donate|donation|give now|fundraiser|appeal)\b/i;

// ─── Section parsing ─────────────────────────────────────────────────────────
// The QA gate has to know WHERE something appeared, not just that it appeared.
const SECTION_MATCHERS = [
  { id: "condolence", re: /condolence|human impact|those affected|our thoughts/i },
  { id: "situation", re: /current situation|what we know|situation report|latest update/i },
  { id: "howToHelp", re: /how to help|how you can help|ways to help|donate/i },
  { id: "communityNeeds", re: /what .*communities? need|what is needed|current needs|relief needs/i },
  { id: "household", re: /prepare your own|your own household|prepare your household|household preparedness/i },
  { id: "products", re: /emergency products|recommended (?:products|gear|supplies)|what to buy/i },
  { id: "sources", re: /sources|references|official relief links/i },
  { id: "related", re: /related atlas guides|related guides/i },
];

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits a disaster article body into its canonical sections. Returns
 * { id -> rawHtml } for every section heading found. A body that does not use
 * these headings yields {}, and the caller reports the structure as missing
 * rather than silently passing the separation checks.
 */
export function splitDisasterSections(html) {
  const source = String(html || "");
  const headings = [...source.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const out = {};
  for (let i = 0; i < headings.length; i += 1) {
    const text = stripTags(headings[i][2]);
    const hit = SECTION_MATCHERS.find((m) => m.re.test(text));
    if (!hit || out[hit.id]) continue;
    const start = headings[i].index + headings[i][0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index : source.length;
    out[hit.id] = source.slice(start, end);
  }
  return out;
}

function sentencesOf(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The category safety gate. `applies` is false for every article outside this
 * category, which is what keeps the travel, wellness and insurance verdicts
 * exactly as they were.
 *
 * Returns one entry per named check, each { id, ok, reason }.
 */
export function checkDisasterSafety(article) {
  const category = String(article?.category || "");
  const axis = String(article?.contentAxis?.id || article?.axis || "");
  const inCategory =
    category === DISASTER_CATEGORY_LABEL ||
    DISASTER_AXIS_IDS.has(axis) ||
    isDisasterText(`${article?.title || ""} ${article?.keyword || ""}`);
  if (!inCategory) return { applies: false, checks: [], sections: {}, violations: [] };

  const html = String(article?.bodyHtml || article?.bodyMarkdown || "");
  const text = stripTags(html);
  const haystack = `${article?.title || ""} ${article?.metaDescription || ""} ${text}`;
  const sections = splitDisasterSections(html);
  const checks = [];
  const add = (id, ok, reason) => checks.push({ id, ok, reason });

  // 1. sensationalDisasterClaims
  const sensational = SENSATIONAL_PATTERNS.filter((re) => re.test(haystack));
  add(
    "sensationalDisasterClaims",
    sensational.length === 0,
    sensational.length
      ? `선정적·자극적 재난 표현 ${sensational.length}건 — 피해를 구경거리로 쓰는 문장은 발행할 수 없습니다.`
      : "선정적 표현 없음",
  );

  // 2. unverifiedCasualtyClaims
  const unattributed = [];
  const rumours = RUMOUR_PATTERNS.filter((re) => re.test(haystack)).length;
  for (const sentence of sentencesOf(text)) {
    if (!CASUALTY_SENTENCE.test(sentence)) continue;
    if (!ATTRIBUTION.test(sentence)) unattributed.push(sentence.slice(0, 90));
  }
  add(
    "unverifiedCasualtyClaims",
    unattributed.length === 0 && rumours === 0,
    unattributed.length || rumours
      ? `출처 없는 피해 수치 ${unattributed.length}건${rumours ? `, 미확인 전언 표현 ${rumours}건` : ""} — 공식 기관과 시점을 명시해야 합니다.`
      : "피해 수치는 모두 공식 출처가 명시됨",
  );

  // 3. donationAffiliateMixing — the structural separation
  const mixing = [];
  for (const id of AFFILIATE_FORBIDDEN_SECTIONS) {
    const body = sections[id];
    if (!body) continue;
    if (AFFILIATE_SURFACE.test(body)) mixing.push(`${id} 섹션에 제휴 링크`);
    if (PURCHASE_CTA.test(stripTags(body))) mixing.push(`${id} 섹션에 구매 CTA`);
  }
  for (const id of DONATION_FORBIDDEN_SECTIONS) {
    const body = sections[id];
    if (!body) continue;
    if (DONATION_SURFACE.test(body) || DONATION_WORDS.test(stripTags(body))) {
      mixing.push(`${id} 섹션에 기부 링크·기부 문구`);
    }
  }
  // The separation also has to be stated, not just observed.
  const hasHelp = Boolean(sections.howToHelp);
  const disclosed = new RegExp(DONATION_DISCLOSURE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text) ||
    /does not earn a commission from donation links/i.test(text);
  if (hasHelp && !disclosed) mixing.push(`"${DONATION_DISCLOSURE}" 문장 누락`);
  add(
    "donationAffiliateMixing",
    mixing.length === 0,
    mixing.length ? `기부 영역과 제휴 영역이 섞였습니다: ${mixing.join(" / ")}` : "기부 영역과 제휴 영역이 분리됨",
  );

  // 4. fakeDonationClaim
  const fake = FAKE_DONATION_PATTERNS.filter((re) => re.test(haystack));
  const matchingOk = donationMatchingActive();
  add(
    "fakeDonationClaim",
    fake.length === 0 || matchingOk,
    fake.length && !matchingOk
      ? `구매가 기부로 이어진다는 표현 ${fake.length}건 — ${DONATION_MATCHING.reason}`
      : "구매=기부 표현 없음",
  );

  // 5. exploitativeCTA
  const exploitative = EXPLOITATIVE_CTA_PATTERNS.filter((re) => re.test(haystack));
  add(
    "exploitativeCTA",
    exploitative.length === 0,
    exploitative.length
      ? `재난을 구매 압박에 쓰는 표현 ${exploitative.length}건 — 긴급성·품절 소구는 금지입니다.`
      : "재난을 이용한 구매 압박 없음",
  );

  return {
    applies: true,
    checks,
    sections,
    violations: checks.filter((c) => !c.ok).map((c) => c.id),
  };
}

// ─── Pinterest ───────────────────────────────────────────────────────────────
// Only informational directions. No victim, body, or destruction imagery is
// ever used as a pin — every pin is an illustration of a checklist or a plan,
// and every click lands on the ATLAS preparedness guide.
export const DISASTER_PIN_TEMPLATES = [
  {
    id: "emergency-kit-checklist",
    label: "비상용품 체크리스트형",
    imageRole: "checklist",
    cta: "See the full emergency kit checklist in the ATLAS guide.",
    titlePrefix: "Emergency kit checklist",
    tone: "A saveable supply list. Flat-lay or illustrated items only — never a photograph of damage or of a person in distress.",
    boards: ["Emergency Kit Checklists", "Home Emergency Planning"],
  },
  {
    id: "flood-preparedness-checklist",
    label: "재해 대비 체크리스트형",
    imageRole: "comparison",
    cta: "Get the full preparedness checklist in the ATLAS guide.",
    titlePrefix: "Before the water rises",
    tone: "Household steps with a deadline, as a checklist card. Illustrative graphics of the steps, not of a flooded street with people in it.",
    boards: ["Flood Preparedness Checklists", "Storm Season Checklists"],
  },
  {
    id: "go-bag",
    label: "고백(비상가방) 구성형",
    imageRole: "context",
    cta: "See what goes in the bag in the ATLAS guide.",
    titlePrefix: "What to pack in a go-bag",
    tone: "The bag and its contents laid out. Practical and calm — this is a packing guide, not a warning.",
    boards: ["Go-Bag Checklists", "Family Evacuation Planning"],
  },
  {
    id: "family-evacuation",
    label: "가족 대피 준비형",
    imageRole: "action",
    cta: "Read the family evacuation plan in the ATLAS guide.",
    titlePrefix: "Family evacuation plan",
    tone: "A plan a family fills in together: meeting point, contacts, documents, pets. Never an image of an actual evacuation in progress.",
    boards: ["Family Evacuation Planning", "Home Emergency Planning"],
  },
  {
    id: "before-during-after",
    label: "전·중·후 정보 카드형",
    imageRole: "featured",
    cta: "Read the before / during / after guide on ATLAS.",
    titlePrefix: "Before, during, after",
    tone: "Three-panel informational card. Public-safety tone, sourced from official guidance, no dramatization.",
    boards: ["Home Emergency Planning", "Emergency Kit Checklists"],
  },
];

export const DISASTER_PIN_OFFSET_DAYS = [0, 4, 9, 14, 19];

export const DISASTER_PIN_RULES = [
  "Never pin a photograph of victims, casualties, bodies, or the destruction of a specific community.",
  "Pins illustrate a checklist, a kit, a bag, or a plan — informational graphics, not disaster footage.",
  "No urgency or fear copy on the overlay. The pin is a preparedness resource, not a warning siren.",
  "Every pin links to the ATLAS preparedness guide, never to a product page and never to a donation page.",
];

export function suggestPinBoards(article) {
  const axis = detectDisasterAxis(`${article?.title || ""} ${article?.keyword || ""}`);
  const fromAxis = disasterAxis(axis)?.pinBoards || [];
  const fromTemplates = DISASTER_PIN_TEMPLATES.flatMap((t) => t.boards);
  return [...new Set([...fromAxis, ...fromTemplates])].slice(0, 6);
}

// ─── Editorial seeds ─────────────────────────────────────────────────────────
// Evergreen household-preparedness topics. A specific live disaster is never a
// static seed — that article is created from the event itself, on the same axes
// and with the same fixed section order.
export const DISASTER_SEEDS = [
  {
    title: "How to Prepare Your Home Before a Flood Warning Expires",
    searchIntent: "Complete the household steps that matter once a flood warning is issued",
    type: "checklist",
    axis: "disaster-flood-landslide",
    relatedArticleIds: [],
    futureProductCategories: ["waterproof document pouches", "dry bags", "water storage containers"],
    reason: "Anchor post for the flood axis — the steps with an actual deadline.",
    commercial: 3,
  },
  {
    title: "Landslide Warning Signs and What to Do About Them",
    searchIntent: "Recognise slope failure warning signs and act on an official warning",
    type: "guide",
    axis: "disaster-flood-landslide",
    relatedArticleIds: [],
    futureProductCategories: ["emergency backpacks", "whistles"],
    reason: "Public-safety information the flood cluster needs and no product answers.",
    commercial: 2,
  },
  {
    title: "How to Protect Important Documents From Water Damage",
    searchIntent: "Store identity and property documents so a flood cannot destroy them",
    type: "guide",
    axis: "disaster-flood-landslide",
    relatedArticleIds: [],
    futureProductCategories: ["waterproof document pouches", "dry bags"],
    reason: "Same hazard, different artifact — documents rather than the building.",
    commercial: 4,
  },
  {
    title: "How to Secure Furniture and Fixtures Before an Earthquake",
    searchIntent: "Anchor the objects in a home that cause injury during shaking",
    type: "checklist",
    axis: "disaster-earthquake",
    relatedArticleIds: [],
    futureProductCategories: ["emergency first aid kits", "flashlights / headlamps"],
    reason: "The preparedness step that measurably reduces injury, before any kit.",
    commercial: 3,
  },
  {
    title: "What to Do During and Immediately After an Earthquake at Home",
    searchIntent: "Follow official guidance during shaking and in the first hours after",
    type: "guide",
    axis: "disaster-earthquake",
    relatedArticleIds: [],
    futureProductCategories: ["whistles", "emergency backpacks"],
    reason: "Drop-cover-hold-on and aftershock guidance, sourced from USGS and Ready.gov.",
    commercial: 2,
  },
  {
    title: "A Household Checklist for Hurricane and Typhoon Season",
    searchIntent: "Get a home and a family ready before storm season begins",
    type: "checklist",
    axis: "disaster-storm-hurricane",
    relatedArticleIds: [],
    futureProductCategories: ["emergency radios", "portable power banks", "water storage containers"],
    reason: "Seasonal anchor for the storm axis, distinct from any insurance timing question.",
    commercial: 4,
  },
  {
    title: "How to Read a Storm Warning and Decide Whether to Evacuate",
    searchIntent: "Interpret official storm warnings and follow evacuation orders",
    type: "guide",
    axis: "disaster-storm-hurricane",
    relatedArticleIds: [],
    futureProductCategories: ["emergency radios", "emergency backpacks"],
    reason: "Turns official warning language into a decision a household can act on.",
    commercial: 2,
  },
  {
    title: "How to Build a Wildfire Evacuation Plan for Your Family",
    searchIntent: "Write an evacuation plan every member of a household can follow",
    type: "guide",
    axis: "disaster-wildfire-evacuation",
    relatedArticleIds: [],
    futureProductCategories: ["emergency backpacks", "waterproof document pouches"],
    reason: "Plan-first article for the wildfire axis; the bag comes after the plan.",
    commercial: 3,
  },
  {
    title: "What to Take When You Have Fifteen Minutes to Leave",
    searchIntent: "Decide in advance what leaves the house during a short-notice evacuation",
    type: "checklist",
    axis: "disaster-wildfire-evacuation",
    relatedArticleIds: [],
    futureProductCategories: ["emergency backpacks", "waterproof document pouches", "emergency blankets"],
    reason: "The decision readers most regret making in the moment.",
    commercial: 4,
  },
  {
    title: "How to Get Through a Multi-Day Power Outage at Home",
    searchIntent: "Keep light, information, warmth and charging going without grid power",
    type: "guide",
    axis: "disaster-power-outage",
    relatedArticleIds: [],
    futureProductCategories: ["portable power banks", "flashlights / headlamps", "emergency radios"],
    reason: "Anchor for the outage axis and the safest place to discuss backup power.",
    commercial: 4,
  },
  {
    title: "How to Keep Food and Medicine Safe When the Power Is Out",
    searchIntent: "Judge what is still safe in a fridge and freezer after an outage",
    type: "guide",
    axis: "disaster-power-outage",
    relatedArticleIds: [],
    futureProductCategories: ["emergency blankets"],
    reason: "Same hazard, different artifact — food safety rather than power supply.",
    commercial: 2,
  },
  {
    title: "Emergency Radios and Flashlights: What Actually Matters",
    searchIntent: "Choose a radio and a light that still work on the third day",
    type: "buying-guide",
    axis: "disaster-power-outage",
    relatedArticleIds: [],
    futureProductCategories: ["emergency radios", "flashlights / headlamps", "portable power banks"],
    reason: "The category's clearest buying question, kept in the preparedness half.",
    commercial: 5,
  },
  {
    title: "What to Put in a Home Emergency Kit",
    searchIntent: "Assemble a 72-hour home emergency kit without overbuying",
    type: "checklist",
    axis: "disaster-emergency-kits",
    relatedArticleIds: [],
    futureProductCategories: ["emergency first aid kits", "water storage containers", "hygiene kits", "emergency blankets"],
    reason: "Hub post every product family in this category can hang off.",
    commercial: 5,
  },
  {
    title: "How to Build a Go-Bag You Can Grab in Two Minutes",
    searchIntent: "Pack a grab-and-go bag that is ready before it is needed",
    type: "checklist",
    axis: "disaster-emergency-kits",
    relatedArticleIds: [],
    futureProductCategories: ["emergency backpacks", "waterproof document pouches", "emergency blankets", "whistles"],
    reason: "The most-saved preparedness format on Pinterest, and a distinct artifact from the home kit.",
    commercial: 5,
  },
  {
    title: "How Much Drinking Water to Store, and How to Store It",
    searchIntent: "Work out household water volume and rotate it safely",
    type: "guide",
    axis: "disaster-emergency-kits",
    relatedArticleIds: [],
    futureProductCategories: ["water storage containers", "portable water filters"],
    reason: "The single supply readers most underestimate.",
    commercial: 4,
  },
  {
    title: "A Family Emergency Communication Plan You Will Actually Use",
    searchIntent: "Agree meeting points and contacts before phones stop working",
    type: "guide",
    axis: "disaster-emergency-kits",
    relatedArticleIds: [],
    futureProductCategories: ["waterproof document pouches"],
    reason: "The no-equipment preparedness step, which keeps the cluster from being gear-only.",
    commercial: 2,
  },
  {
    title: "How to Assemble a Home First Aid Kit",
    searchIntent: "Build a first aid kit that covers ordinary injuries during an outage or storm",
    type: "guide",
    axis: "disaster-emergency-kits",
    relatedArticleIds: [],
    futureProductCategories: ["emergency first aid kits", "hygiene kits"],
    reason: "General first aid supplies — never treatment instruction beyond official guidance.",
    commercial: 4,
  },
];
