// ─── Shopping Shorts Engine (ATLAS R2) ───────────────────────────────────────
// Given a PUBLISHED article, builds a 30–60s shorts DRAFT (semi-automatic: the
// human reviews and exports; no auto-posting to any platform). Reuses the
// documentary tone reconstructed from the Shorts Studio R1 work — the R1 stash
// is read-only and is NOT applied.
//
// Affiliate gate: with zero active affiliate products the draft is INFORMATIONAL
// ONLY — product name, buy CTA, affiliate URL and "sellable" flag are all off.
import { makeCampaignId, makeShortId, buildUtm, buildTrackedUrl } from "./campaign-engine";

const PLATFORMS = ["youtube", "instagram", "tiktok"];

function firstSentences(text, n = 2) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .slice(0, n)
    .join(" ")
    .trim();
}

function h2Titles(md) {
  return (String(md || "").match(/^##\s+(.+)$/gm) || []).map((s) => s.replace(/^##\s+/, "").trim());
}

// Platform copy is derived from the article, not invented facts. Hashtags are
// generic topical tags, no fabricated brand/price claims.
function platformCopy(article, platform, disclosure) {
  const base = article.hookTitle || article.title;
  const tagWords = [...(article.tags || []), article.category]
    .filter(Boolean)
    .map((t) => `#${String(t).replace(/[^a-zA-Z0-9]/g, "")}`)
    .slice(0, 6);
  const platformTag = { youtube: "#Shorts", instagram: "#Reels", tiktok: "#TikTok" }[platform];
  return {
    title: platform === "youtube" ? `${base} #Shorts` : base,
    description: `${firstSentences(article.metaDescription || article.quickAnswer, 2)}\n\n${disclosure}`,
    hashtags: [platformTag, ...tagWords],
  };
}

export function buildShortsDraft(
  article,
  { affiliateActiveCount = 0, bloggerUrl = "", existingShortIds = [], isProduction = false, publicTrackingBase = null } = {},
) {
  const shortId = makeShortId(article.id, existingShortIds);
  const headings = h2Titles(article.bodyMarkdown);
  const takeaways = (article.keyTakeaways || []).slice(0, 3);
  const affiliateActive = affiliateActiveCount > 0 && article.affiliatePlan?.status === "active";

  const disclosure = affiliateActive
    ? article.affiliatePlan?.disclosure ||
      "This video contains affiliate links. We may earn a commission at no extra cost to you."
    : "Informational video. No product links.";

  // Hook → problem → tips → CTA, all sourced from the article.
  const hook = article.hookTitle || article.title;
  const problem = firstSentences(article.quickAnswer || article.metaDescription, 2);

  const scenes = [
    { t: "0-3s", direction: "Cold-open on the single unresolved problem image. No intro.", vo: hook, caption: hook },
    ...takeaways.map((tip, i) => ({
      t: `${3 + i * 8}-${11 + i * 8}s`,
      direction: `Documentary b-roll illustrating: ${headings[i] || "key point"}. Restrained pacing.`,
      vo: tip,
      caption: tip.length > 70 ? `${tip.slice(0, 67)}...` : tip,
    })),
    {
      t: "closing",
      direction: "Static text card driving to the full blog article.",
      vo: "Full checklist and sources in the article — link in bio.",
      caption: "Read the full guide →",
    },
  ];

  // Product tie-in placement — disabled entirely when affiliate is inactive.
  const productTieIn = affiliateActive
    ? {
        enabled: true,
        placeAfterScene: Math.min(2, scenes.length - 1),
        cta: article.affiliatePlan?.cta?.decisionLabel || "Check current price",
        products: (article.affiliatePlan?.productSlots || []).map((s) => ({
          productId: s.productType || "",
          label: s.label || "",
        })),
      }
    : {
        enabled: false,
        reason: "활성 제휴 상품 0개 — 상품명·구매 CTA·affiliate URL·판매 표시 모두 비활성화",
        cta: null,
        products: [],
      };

  const magicLightPrompt = buildMagicLightPrompt({ hook, problem, scenes, article, productTieIn });

  // One campaign per platform (article × short × platform × product), so every
  // future click/order is attributable. productId is "none" when info-only.
  const productId = productTieIn.enabled && productTieIn.products[0]?.productId
    ? productTieIn.products[0].productId
    : "none";

  const campaigns = PLATFORMS.map((platform) => {
    const campaignId = makeCampaignId({ articleId: article.id, shortId, platform, productId });
    const tracked = buildTrackedUrl({ bloggerUrl, campaignId, platform, articleId: article.id, publicTrackingBase });
    return {
      campaignId,
      platform,
      productId,
      isProduction,
      bloggerUrl,
      utm: buildUtm({ campaignId, platform, articleId: article.id }),
      trackedUrl: tracked.url,
      trackedUrlStatus: tracked.status,
    };
  });

  const platforms = {};
  for (const p of PLATFORMS) platforms[p] = platformCopy(article, p, disclosure);

  return {
    shortId,
    articleId: article.id,
    status: "draft",
    mode: affiliateActive ? "commerce" : "informational",
    isProduction,
    productionNote: isProduction
      ? "발행된 글 기반 — Production 캠페인 집계 대상"
      : "미발행 글(art_004~006 등) 기반 — Preview 전용, Production 집계 제외",
    hook,
    problem,
    solutionTips: takeaways,
    scenes,
    voiceOver: scenes.map((s) => s.vo),
    captions: scenes.map((s) => s.caption),
    productTieIn,
    cta: productTieIn.enabled ? productTieIn.cta : "Read the full guide (info only)",
    magicLightPrompt,
    platforms,
    bloggerUrl,
    affiliateDisclosure: disclosure,
    campaigns,
    createdAt: new Date().toISOString(),
  };
}

function buildMagicLightPrompt({ hook, problem, scenes, article, productTieIn }) {
  const productLine = productTieIn.enabled
    ? productTieIn.products.map((p) => p.label).filter(Boolean).join(", ") || "(linked products)"
    : "(no product tie-in — informational only)";
  return `[ATLAS SHOPPING SHORT — MagicLight Prompt]

Source Article: ${article.title}
Style: ATLAS documentary tone, restrained narration, natural light, minimal on-screen text.
Duration: 30-60s, 9:16 vertical.

Hook (0-3s): ${hook}
Core Problem: ${problem}

Scene Plan:
${scenes.map((s, i) => `${i + 1}. [${s.t}] ${s.direction}\n   VO: ${s.vo}`).join("\n")}

Product Tie-in: ${productLine}

Closing: Drive viewers to the full blog article. Fact-based, no exaggerated claims, no fabricated prices.`;
}
