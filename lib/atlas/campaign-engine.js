// ─── Campaign / Attribution Engine (ATLAS R2) ────────────────────────────────
// Generates collision-free campaign IDs that let every click/order be traced
// back to article → short → platform → product, and builds the UTM structure
// that carries that attribution through a click.
//
// Honesty boundaries baked in:
//   • A local dev URL cannot receive real reader clicks, and we have no public
//     tracking endpoint or affiliate tracking link confirmed. So buildTrackedUrl
//     reports BLOCKED_PUBLIC_TRACKING_ENDPOINT rather than emitting a link that
//     would look live but isn't.
//   • We never attach unverified affiliate parameters to a Blogger URL.

const PLATFORM_CODE = { youtube: "yt", instagram: "ig", tiktok: "tt", blog: "bl" };

function slugPart(value, fallback) {
  const s = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || fallback;
}

// campaignId = c_<article>_<short>_<platform>_<product>. Deterministic, so the
// same tuple always maps to the same id (no duplicate campaigns) and every id
// is reversible back to its parts.
export function makeCampaignId({ articleId, shortId, platform, productId = "none" }) {
  const p = PLATFORM_CODE[platform] || slugPart(platform, "xx");
  return [
    "c",
    slugPart(articleId, "art"),
    slugPart(shortId, "shr"),
    p,
    slugPart(productId, "none"),
  ].join("__");
}

export function parseCampaignId(campaignId) {
  const parts = String(campaignId || "").split("__");
  if (parts.length !== 5 || parts[0] !== "c") return null;
  const [, articleId, shortId, platformCode, productId] = parts;
  const platform =
    Object.keys(PLATFORM_CODE).find((k) => PLATFORM_CODE[k] === platformCode) || platformCode;
  return { articleId, shortId, platform, productId };
}

export function buildUtm({ campaignId, platform, articleId }) {
  return {
    utm_source: platform,
    utm_medium: "shorts",
    utm_campaign: campaignId,
    utm_content: articleId,
  };
}

// Attempt to build the actual outbound tracked URL. Without a confirmed public
// tracking endpoint or affiliate tracking link, this is honestly BLOCKED.
export function buildTrackedUrl({ bloggerUrl, campaignId, platform, articleId, publicTrackingBase = null }) {
  const utm = buildUtm({ campaignId, platform, articleId });
  if (!publicTrackingBase) {
    return {
      status: "BLOCKED_PUBLIC_TRACKING_ENDPOINT",
      url: null,
      utm,
      note:
        "공개 추적 endpoint/제휴 tracking link가 확인되지 않았습니다. 로컬 주소는 실제 외부 클릭을 받을 수 없습니다.",
    };
  }
  // Only reached if a real, verified public base is supplied by configuration.
  const qs = new URLSearchParams({ ...utm, r: bloggerUrl || "" }).toString();
  return { status: "READY", url: `${publicTrackingBase}?${qs}`, utm };
}

export function makeShortId(articleId, existingIds = []) {
  const base = `shr_${slugPart(articleId, "art")}`;
  let n = 1;
  let candidate = `${base}_${String(n).padStart(2, "0")}`;
  const taken = new Set(existingIds);
  while (taken.has(candidate)) {
    n += 1;
    candidate = `${base}_${String(n).padStart(2, "0")}`;
  }
  return candidate;
}
