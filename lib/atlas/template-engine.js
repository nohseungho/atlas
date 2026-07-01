// Revenue Template Engine — template structure, search intent, and reader persona

const TEMPLATES = {
  review: {
    requiredSections: [
      "Summary",
      "Table of Contents",
      "Product Overview",
      "Pros",
      "Cons",
      "Comparison Table",
      "FAQ",
      "Conclusion",
      "Affiliate Area",
    ],
    designHints: [
      "Star rating widget near top",
      "Pros in green, cons in red",
      "Affiliate CTA after Summary and at Conclusion",
      "Hero product image at top",
    ],
  },
  comparison: {
    requiredSections: [
      "Introduction",
      "Quick Comparison Table",
      "Detailed Analysis",
      "Side-by-Side Breakdown",
      "Winner Pick",
      "FAQ",
      "Conclusion",
      "Affiliate Area",
    ],
    designHints: [
      "Sticky comparison table on desktop",
      "Highlight winner column in green",
      "Best-for badge per product",
      "CTA button per product row",
    ],
  },
  howto: {
    requiredSections: [
      "Introduction",
      "What You Need (Prerequisites)",
      "Step-by-Step Guide",
      "Pro Tips",
      "Common Mistakes to Avoid",
      "FAQ",
      "Conclusion",
    ],
    designHints: [
      "Number each step clearly",
      "Progress indicator for multi-step flow",
      "Callout boxes for tips and warnings",
      "Checklist summary at the end",
    ],
  },
  list: {
    requiredSections: [
      "Introduction",
      "Table of Contents",
      "List Items (name, summary, pros, price/link)",
      "Summary Comparison Table",
      "FAQ",
      "Conclusion",
      "Affiliate Area",
    ],
    designHints: [
      "Card layout per item",
      "Editor Pick / Best Value badge",
      "Lazy-load images per card",
      "CTA button per card",
    ],
  },
  guide: {
    requiredSections: [
      "Introduction",
      "Background / Why This Matters",
      "Core Concepts",
      "How to Apply",
      "Advanced Tips",
      "FAQ",
      "Conclusion",
    ],
    designHints: [
      "TOC with scroll-spy",
      "Callout boxes for key definitions",
      "Infographic or chart if data-heavy",
      "Reading time estimate at top",
    ],
  },
};

const CATEGORY_OVERRIDES = {
  "k-beauty": {
    review: {
      extraSections: ["Ingredient Analysis", "Skin Type Recommendations"],
      extraHints: ["Ingredient icon badges", "Skin type selector widget"],
    },
    list: {
      extraSections: ["Where to Buy in the US", "Price Range Guide"],
      extraHints: ["Amazon affiliate links per product"],
    },
  },
  "k-food": {
    review: {
      extraSections: ["Where to Buy", "Ingredient Substitutes"],
      extraHints: ["Amazon / H-Mart / Weee link per product"],
    },
    howto: {
      extraSections: ["Ingredient Shopping Guide", "Storage Tips"],
      extraHints: ["Shopping list checklist at end"],
    },
  },
  ai: {
    comparison: {
      extraSections: ["Pricing Breakdown", "Use Case Matrix"],
      extraHints: ["Monthly vs annual pricing toggle"],
    },
    review: {
      extraSections: ["Pricing Tiers", "Integration Options"],
      extraHints: ["Pricing table with tier comparison"],
    },
  },
  travel: {
    guide: {
      extraSections: ["Budget Breakdown", "Best Time to Visit", "Booking Tips"],
      extraHints: ["Budget calculator widget", "Map embed"],
    },
    list: {
      extraSections: ["Price Range", "Booking Links"],
      extraHints: ["Affiliate links for booking platforms"],
    },
  },
  money: {
    comparison: {
      extraSections: ["Risk Warning", "Eligibility Requirements"],
      extraHints: ["Disclaimer box above fold", "Calculator embed"],
    },
    review: {
      extraSections: ["Fee Breakdown", "Eligibility Requirements", "Risk Warning"],
      extraHints: ["Bold fee table", "Disclaimer before affiliate CTA"],
    },
  },
};

export function getTemplate(templateType, category) {
  const base = TEMPLATES[templateType];
  if (!base) return null;

  const overrides = CATEGORY_OVERRIDES[category]?.[templateType] || {};
  return {
    template: templateType,
    category: category || "general",
    requiredSections: [...base.requiredSections, ...(overrides.extraSections || [])],
    designHints: [...base.designHints, ...(overrides.extraHints || [])],
  };
}

// ─── Search Intent Engine ─────────────────────────────────────────────────────

const INTENT_PATTERNS = {
  transactional:
    /\b(buy|purchase|order|shop|deal|discount|coupon|cheap|where to buy|get|download|on sale)\b/i,
  comparison: /\b(vs|versus|compare|comparison|difference|differences|better|alternative|alternatives)\b/i,
  commercial:
    /\b(best|top|review|reviews|rated|recommend|worth|should i|which|pros and cons|is it good|ranking)\b/i,
};

export function detectSearchIntent(title) {
  if (!title) return "informational";
  if (INTENT_PATTERNS.transactional.test(title)) return "transactional";
  if (INTENT_PATTERNS.comparison.test(title)) return "comparison";
  if (INTENT_PATTERNS.commercial.test(title)) return "commercial";
  return "informational";
}

// ─── Reader Persona Engine ────────────────────────────────────────────────────

const PERSONAS = {
  "k-beauty": [
    {
      name: "K-Beauty Beginner",
      description: "Curious about Korean skincare but overwhelmed by product choices",
      needs: ["Simple starter routine", "Product explanations", "Where to buy in the US"],
      painPoints: ["Too many products", "Don't know ingredients", "Fear of skin reactions"],
    },
    {
      name: "Skincare Enthusiast",
      description: "Experienced with skincare, looking for specific K-Beauty staples",
      needs: ["Ingredient deep-dives", "Brand comparisons", "Best value picks"],
      painPoints: ["Authenticity concerns", "Shipping costs", "Counterfeit products"],
    },
  ],
  "k-food": [
    {
      name: "Korean Food Explorer",
      description: "Wants to cook Korean food at home or find Korean ingredients online",
      needs: ["Where to buy ingredients", "Simple recipes", "Substitution options"],
      painPoints: ["Hard to find locally", "Unfamiliar with Korean brands"],
    },
    {
      name: "Amazon Shopper",
      description: "Buys Korean food products online for convenience and value",
      needs: ["Top-rated products", "Amazon links", "Price comparisons"],
      painPoints: ["Quality uncertainty", "Too many options"],
    },
  ],
  ai: [
    {
      name: "AI Beginner",
      description: "New to AI tools, wants simple explanations and easy starting points",
      needs: ["Plain-English explanations", "Free tier options", "Step-by-step setup"],
      painPoints: ["Technical jargon", "Complexity fear", "Cost concerns"],
    },
    {
      name: "Productivity Seeker",
      description: "Uses AI tools to save time and automate work tasks",
      needs: ["Workflow integrations", "Time-saving use cases", "Pricing value"],
      painPoints: ["Tool overload", "Learning curve", "Cost justification"],
    },
  ],
  travel: [
    {
      name: "Budget Traveler",
      description: "Wants to travel affordably without sacrificing experience",
      needs: ["Cheap flights", "Budget accommodations", "Free activities"],
      painPoints: ["Hidden fees", "Safety concerns", "Limited budget"],
    },
    {
      name: "US Tourist",
      description: "Planning a specific US trip, looking for curated recommendations",
      needs: ["Top attractions", "Itineraries", "Local insider tips"],
      painPoints: ["Information overload", "Booking complexity", "Hidden costs"],
    },
  ],
  money: [
    {
      name: "Budget Optimizer",
      description: "Wants to cut expenses and maximize savings",
      needs: ["Savings tips", "Comparison tools", "Free resources"],
      painPoints: ["Overwhelmed by finances", "Doesn't know where to start"],
    },
    {
      name: "First-Time Investor",
      description: "Starting to invest, cautious but motivated to grow wealth",
      needs: ["Beginner guides", "Low-risk options", "Clear fee breakdowns"],
      painPoints: ["Fear of losing money", "Complex terminology", "Trust issues"],
    },
  ],
};

export function getReaderPersona(category, intent) {
  const list = PERSONAS[category];
  if (!list || list.length === 0) {
    return {
      name: "General Reader",
      description: "General audience seeking useful information",
      needs: ["Clear answers", "Actionable tips"],
      painPoints: ["Vague content", "No clear takeaways"],
    };
  }
  // Buyer intent → buyer persona (index 1); informational → educational persona (index 0)
  if (intent === "commercial" || intent === "transactional" || intent === "comparison") {
    return list[1] ?? list[0];
  }
  return list[0];
}

// ─── Quality Bonus (plugs into getBloggerChecklist) ──────────────────────────

const VALID_TEMPLATES = new Set(["review", "comparison", "howto", "list", "guide"]);
const VALID_INTENTS = new Set(["informational", "commercial", "transactional", "comparison"]);

export function getTemplateQualityBonus(article) {
  const intent = article.searchIntent || detectSearchIntent(article.title);
  const hasIntent = VALID_INTENTS.has(intent);
  const hasPersona = Boolean(article.persona);
  const hasTemplate = Boolean(article.template) && VALID_TEMPLATES.has(article.template);

  return [
    {
      label: "Search Intent 분류 (+10점)",
      passed: hasIntent,
      detail: hasIntent ? intent : "미분류",
    },
    {
      label: "Reader Persona 설정 (+10점)",
      passed: hasPersona,
      detail: hasPersona ? article.persona : "미설정",
    },
    {
      label: "Revenue Template 매핑 (+10점)",
      passed: hasTemplate,
      detail: hasTemplate ? article.template : "미지정",
    },
  ];
}
