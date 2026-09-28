import { readPublicSource } from "../unified-evidence.js";

// Ppomppu's public page may disclose an outbound seller link as a base64
// target. It is only a candidate: product-import checks the actual offer,
// price and redirects before any draft is created.
export function sellerUrlFromPpomppu(html) {
  for (const match of String(html).matchAll(/[?&]target=([A-Za-z0-9+/=%]+)/g)) {
    try {
      const decoded = Buffer.from(decodeURIComponent(match[1]), "base64").toString("utf8");
      const url = new URL(decoded);
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password
          && url.hostname !== "ppomppu.co.kr" && !url.hostname.endsWith(".ppomppu.co.kr")) return url.toString();
    } catch { /* Ignore malformed links. */ }
  }
  return "";
}

export async function sellerUrlForCandidate(candidate) {
  try {
    const url = new URL(candidate.sourceUrl);
    if (!["ppomppu.co.kr", "www.ppomppu.co.kr"].includes(url.hostname)) return "";
    return sellerUrlFromPpomppu(await readPublicSource(candidate.sourceUrl, "ppomppu.co.kr"));
  } catch { return ""; }
}
