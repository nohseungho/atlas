// Live refresh helpers — pure string operations used by
// app/api/atlas/live-refresh/route.js to edit EXISTING public Blogger HTML
// without regenerating it. Kept here (not in the route) so they are testable
// and so the route file exports only Next.js handlers.
import { isPublicImageUrl, normalizeImageSrc } from "./revenue-layout-engine.js";
import { GLOBAL_LAYOUT } from "./operating-policy.js";

function esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function figure(asset, { eager } = {}) {
  const loading = eager ? `loading="eager" fetchpriority="high"` : `loading="lazy"`;
  return `<figure style="margin:${GLOBAL_LAYOUT.figureMargin};font-family:system-ui,-apple-system,sans-serif;">
  <img src="${esc(asset.publicUrl)}" alt="${esc(asset.alt)}" width="1600" height="900" ${loading} style="display:block;width:100%;max-width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:${GLOBAL_LAYOUT.figureRadiusPx}px;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(15,23,42,.08);" />
</figure>`;
}

// Inserts each requested figure once: `before` is an H2 heading text (case-
// insensitive, entity-tolerant) the figure goes in front of; "top" puts it
// before the first block. An asset already present in the HTML, or whose
// heading cannot be found, is skipped rather than guessed.
export function insertFiguresIntoLiveHtml(liveHtml, placements = []) {
  let html = String(liveHtml || "");
  const applied = [];
  const skipped = [];
  for (const { asset, before } of placements) {
    if (!asset || !isPublicImageUrl(asset.publicUrl)) { skipped.push({ key: asset?.key, reason: "no public url" }); continue; }
    const present = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi), (m) => normalizeImageSrc(m[1])).includes(normalizeImageSrc(asset.publicUrl));
    if (present) { skipped.push({ key: asset.key, reason: "already in live html" }); continue; }
    if (before === "top") {
      html = `${figure(asset, { eager: true })}\n${html}`;
      applied.push({ key: asset.key, before });
      continue;
    }
    const target = String(before || "").replace(/&amp;/g, "&").trim().toLowerCase();
    const h2 = Array.from(html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)).find((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().toLowerCase() === target
    );
    if (!h2) { skipped.push({ key: asset.key, reason: `heading not found: ${before}` }); continue; }
    html = `${html.slice(0, h2.index)}${figure(asset)}\n${html.slice(h2.index)}`;
    applied.push({ key: asset.key, before });
  }
  return { html, applied, skipped };
}

// Appends (or inserts before a marker heading) a block of HTML into a page,
// unless the page already contains the block's marker text.
export function insertIntoPageHtml(pageHtml, block, { markerText, beforeHeading } = {}) {
  const html = String(pageHtml || "");
  if (markerText && html.includes(markerText)) return { html, applied: false, reason: "already present" };
  if (beforeHeading) {
    const target = beforeHeading.trim().toLowerCase();
    // Blogger pages written in the visual editor often carry their section
    // titles as plain <p> lines, so a paragraph whose whole text equals the
    // heading counts as the heading too.
    const h = Array.from(html.matchAll(/<(h[1-4]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)).find((m) => m[2].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().toLowerCase() === target);
    if (h) return { html: `${html.slice(0, h.index)}${block}\n${html.slice(h.index)}`, applied: true, reason: `inserted before ${beforeHeading}` };
  }
  return { html: `${html}\n${block}`, applied: true, reason: "appended" };
}


// Replaces exactly one live <img> — the one whose src contains `matchSrc` — with a
// new public https src (and alt). Every other byte of the live HTML is kept, so
// structure, links, FAQ, Sources and the search description are untouched.
// Used for character/asset corrections on posts that were published outside the
// ATLAS article pipeline (no local record to re-assemble from).
export function replaceLiveImage(liveHtml, { matchSrc, newSrc, newAlt } = {}) {
  const html = String(liveHtml || "");
  const needle = String(matchSrc || "").trim();
  if (!needle) return { html, applied: false, reason: "matchSrc required" };
  if (!isPublicImageUrl(newSrc)) return { html, applied: false, reason: "newSrc must be a public https image URL" };
  const tags = Array.from(html.matchAll(/<img\b[^>]*>/gi)).filter((m) => m[0].includes(needle));
  if (tags.length !== 1) return { html, applied: false, reason: tags.length ? `matchSrc matches ${tags.length} images` : "matchSrc not found" };
  const [tag] = tags;
  const oldSrc = (tag[0].match(/\ssrc=["']([^"']+)["']/i) || [])[1] || "";
  const oldAlt = (tag[0].match(/\salt=["']([^"']*)["']/i) || [])[1] || "";
  let next = tag[0].replace(/(\ssrc=["'])[^"']+(["'])/i, `$1${esc(newSrc)}$2`);
  if (typeof newAlt === "string" && newAlt.trim()) {
    next = /\salt=["'][^"']*["']/i.test(next) ? next.replace(/(\salt=["'])[^"']*(["'])/i, `$1${esc(newAlt)}$2`) : next.replace(/^<img\b/i, `<img alt="${esc(newAlt)}"`);
  }
  return { html: `${html.slice(0, tag.index)}${next}${html.slice(tag.index + tag[0].length)}`, applied: true, before: { src: oldSrc, alt: oldAlt }, after: { src: newSrc, alt: newAlt || oldAlt } };
}
