// Pinterest promotion kit (V1) — turns a PUBLISHED article into the four things
// a manual pin needs: a 2:3 image with a hook burned in, a pin title, an English
// description, and the live article link.
//
// No paid AI API and no Pinterest API: the image is the article's own featured
// asset re-delivered through the Cloudinary transformation URL it already lives
// on, so generating a kit costs one image delivery and nothing else. Publishing
// the pin stays a human step — this module only prepares the material.
//
// Pure (no IO), so every rule below is unit-testable without a server.

export const PIN_WIDTH = 1000;
export const PIN_HEIGHT = 1500; // 2:3 — Pinterest's standard portrait ratio
export const PIN_TITLE_MAX = 100;
export const DESCRIPTION_MIN = 300;
export const DESCRIPTION_MAX = 500;
const HOOK_MAX = 52;

// V1 ships a curated hook for the first live article; everything else derives
// one from its own title. A curated line is editorial copy, not a fact about
// the article, so it is kept here rather than invented per request.
const CURATED_HOOKS = {
  art_013: "WHAT TRIP CANCELLATION INSURANCE REALLY COVERS",
};

const CTA = "Read the full ATLAS guide before you book.";

// Cloudinary reads `,` and `/` as transformation separators inside a text
// layer, so they are removed rather than escaped — a hook never needs them.
function sanitizeOverlayText(value) {
  return String(value || "")
    .replace(/[,/\\]/g, " ")
    .replace(/[^\w\s&'’·.:-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripParenthetical(title) {
  return String(title || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

// Cuts at a word boundary — a hook that ends mid-word reads as a rendering bug.
function truncateAtWord(text, max) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : s.slice(0, max)).replace(/[\s.,:;-]+$/, "");
}

// A hook cut to length often lands on a connector ("...DEDUCTIBLES BEFORE A"),
// which reads as a sentence someone forgot to finish. Those trailing words are
// dropped so the line ends on something meaningful.
const DANGLING_WORDS = new Set([
  "A", "AN", "THE", "AND", "OR", "OF", "FOR", "TO", "IN", "ON", "AT", "BY", "WITH",
  "FROM", "BEFORE", "AFTER", "INTO", "ABOUT", "THAN", "THAT", "IS", "ARE", "YOUR", "YOU", "VS",
]);

export function deriveHook(article) {
  const curated = CURATED_HOOKS[article?.id];
  if (curated) return curated;
  const base = sanitizeOverlayText(stripParenthetical(article?.title)).toUpperCase();
  const words = truncateAtWord(base, HOOK_MAX).split(" ").filter(Boolean);
  while (words.length > 1 && DANGLING_WORDS.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

export function derivePinTitle(article) {
  const base = stripParenthetical(article?.title) || String(article?.title || "").trim();
  return truncateAtWord(base, PIN_TITLE_MAX);
}

// Assembles the description out of the article's OWN sentences — quick answer,
// meta description, core question, takeaways — never invented claims. Whole
// sentences only, so the text never stops mid-thought at the 500-char ceiling.
export function buildPinDescription(article) {
  const pool = [
    article?.quickAnswer,
    article?.metaDescription,
    article?.coreQuestion,
    ...(article?.keyTakeaways || []),
    article?.excerpt,
  ];

  const seen = new Set();
  let text = "";
  for (const raw of pool) {
    const sentence = String(raw || "").replace(/\s+/g, " ").trim();
    if (!sentence) continue;
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    const withPeriod = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
    const next = text ? `${text} ${withPeriod}` : withPeriod;
    if (next.length > DESCRIPTION_MAX - CTA.length - 1) continue;
    seen.add(key);
    text = next;
    if (text.length + CTA.length + 1 >= DESCRIPTION_MIN) break;
  }

  const full = text ? `${text} ${CTA}` : CTA;
  return full.length <= DESCRIPTION_MAX ? full : truncateAtWord(full, DESCRIPTION_MAX);
}

// Splits a Cloudinary delivery URL into its base and the versioned asset path,
// dropping whatever transformation the article record happened to store. Returns
// null for anything that is not a Cloudinary upload URL — the caller reports
// that instead of shipping a broken image.
export function parseCloudinaryUrl(url) {
  const match = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload)\/(.+)$/.exec(String(url || ""));
  if (!match) return null;
  const [, base, rest] = match;
  const parts = rest.split("?")[0].split("/").filter(Boolean);
  const versionAt = parts.findIndex((p) => /^v\d+$/.test(p));
  // Without a version segment the remainder is only a public id when it carries
  // no transformation component (those always contain a `,` or an `x_y:` pair).
  const assetParts = versionAt >= 0 ? parts.slice(versionAt) : parts.filter((p) => !/[,:]/.test(p));
  if (!assetParts.length) return null;
  const assetPath = assetParts.join("/");
  return { base, assetPath: /\.[a-z0-9]+$/i.test(assetPath) ? assetPath : `${assetPath}.jpg` };
}

const enc = (value) => encodeURIComponent(sanitizeOverlayText(value));

// The pin composition, as one Cloudinary URL:
//   fill to 1000x1500 (2:3, auto-focus) → darken → hook centred, wrapped inside
//   800px so long hooks flow onto more lines instead of being cut → brand line
//   pinned above the bottom edge.
export function buildPinImage({ sourceUrl, hook, brandLine, filename }) {
  const parsed = parseCloudinaryUrl(sourceUrl);
  if (!parsed) return null;
  const layers = [
    `c_fill,g_auto,w_${PIN_WIDTH},h_${PIN_HEIGHT},q_auto`,
    "e_brightness:-38",
    "e_saturation:-12",
    `l_text:Arial_68_bold_center:${enc(hook)},co_white,w_800,c_fit`,
    "fl_layer_apply,g_center,y_-30",
    `l_text:Arial_27_center:${enc(brandLine)},co_rgb:e2e8f0,w_820,c_fit`,
    "fl_layer_apply,g_south,y_96",
  ];
  const url = `${parsed.base}/${layers.join("/")}/${parsed.assetPath}`;
  const attachment = String(filename || "atlas-pin").replace(/\.jpg$/i, "");
  return {
    url,
    // Content-Disposition comes from Cloudinary, so the download keeps this
    // filename without the page having to re-fetch the bytes itself.
    downloadUrl: `${parsed.base}/${layers.join("/")}/fl_attachment:${encodeURIComponent(attachment)}/${parsed.assetPath}`,
    filename: `${attachment}.jpg`,
    width: PIN_WIDTH,
    height: PIN_HEIGHT,
  };
}

export function pinFilename(articleId) {
  return `atlas-pin-${articleId}`;
}

function brandLineFor(publishedUrl) {
  try {
    return `ATLAS · ${new URL(publishedUrl).host}`;
  } catch {
    return "ATLAS";
  }
}

// The featured asset is the article's own hero; a kit is only built from an
// image the article actually published with.
export function pickSourceAsset(article) {
  const assets = article?.visualAssets || [];
  return (
    assets.find((a) => a.key === "featured") ||
    assets.find((a) => a.publicUrl || a.url) ||
    null
  );
}

/**
 * Builds the whole kit. Returns { ok, issues, kit } — never a partial kit
 * presented as complete.
 */
export function buildPinterestKit({ article, now = new Date() } = {}) {
  const issues = [];
  if (!article) return { ok: false, issues: ["article not found"], kit: null };
  const link = String(article.publishedUrl || "").trim();
  if (article.status !== "published" || !link) issues.push("아직 발행되지 않은 글입니다 (공개 URL 없음).");

  const asset = pickSourceAsset(article);
  const sourceUrl = asset?.publicUrl || asset?.url || "";
  const hook = deriveHook(article);
  const image = sourceUrl ? buildPinImage({ sourceUrl, hook, brandLine: brandLineFor(link), filename: pinFilename(article.id) }) : null;
  if (!sourceUrl) issues.push("대표 이미지가 없어 핀 이미지를 만들 수 없습니다.");
  else if (!image) issues.push("대표 이미지가 Cloudinary 이미지가 아니라 2:3 핀으로 변환할 수 없습니다.");
  if (!hook) issues.push("훅 문구를 만들 수 없습니다 (제목 없음).");

  const description = buildPinDescription(article);
  if (description.length < DESCRIPTION_MIN) {
    issues.push(`설명이 ${description.length}자로 최소 ${DESCRIPTION_MIN}자에 못 미칩니다 (본문 요약 문장 부족).`);
  }

  if (issues.length) return { ok: false, issues, kit: null };

  return {
    ok: true,
    issues: [],
    kit: {
      articleId: article.id,
      articleTitle: article.title,
      hook,
      title: derivePinTitle(article),
      description,
      link,
      image: { ...image, sourceAssetKey: asset.key || "", sourceUrl },
      createdAt: now.toISOString(),
    },
  };
}
