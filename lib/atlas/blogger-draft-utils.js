// Pure helpers for "Blogger 초안 반영" (draft sync). No external imports so they
// stay unit-testable without a running server or any Blogger/Google call.

// Title normalization allowed ONLY for: trim, collapse whitespace, case-insensitive,
// HTML entity normalization, and smart-quote/dash normalization. Partial matches are
// never treated as equal — this is an exact normalized-title comparison.
export function normalizeTitle(title) {
  return String(title || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Selects the single DRAFT that exactly matches (normalized) the article title.
//   { match: "found", post }         → exactly one match
//   { match: "none" }                → zero matches (caller may create a DRAFT)
//   { match: "multiple", candidates }→ 2+ matches (caller must NOT auto-pick)
export function selectDraftCandidate(drafts, title) {
  const target = normalizeTitle(title);
  const matches = (drafts || []).filter((d) => normalizeTitle(d.title) === target);
  if (matches.length === 1) return { match: "found", post: matches[0] };
  if (matches.length === 0) return { match: "none" };
  return { match: "multiple", candidates: matches.map((m) => ({ id: m.id, title: m.title })) };
}

// Safety validation for HTML about to be pushed to a Blogger DRAFT. Returns
// { ok, imgCount, cloudinaryCount, issues[] }. `ok` is false only on integrity/
// safety problems — image count is reported for the caller to assert separately,
// so an image-less article does not fail this generic gate.
export function validateDraftHtml(html) {
  const s = String(html || "");
  const issues = [];
  const imgCount = (s.match(/<img\b/gi) || []).length;
  const cloudinaryCount = (s.match(/https:\/\/res\.cloudinary\.com\//g) || []).length;

  if (/```/.test(s)) issues.push("code fence present");
  if ((s.match(/<h1\b/gi) || []).length > 1) issues.push("duplicate h1");
  if (/\bdata:image\//i.test(s)) issues.push("data URL image");
  if (/(PLACEHOLDER|example\.com|YOUR_[A-Z_]+|xxxx+|\/path\/to\/)/i.test(s)) issues.push("placeholder/fake URL");
  if (/AFFILIATE_LINK/i.test(s)) issues.push("affiliate link token");
  if (/(buy now|amazon\.[a-z]|product-card|\/go\/aff|add to cart)/i.test(s)) issues.push("sales/affiliate surface");

  return { ok: issues.length === 0, imgCount, cloudinaryCount, issues };
}
