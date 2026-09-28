import { canonicalNaverUrl } from "../korea-product-pipeline.js";
import { xmlValue } from "../unified-evidence.js";

const normalized = (value) => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

// An exact public RSS title and a who-ami permalink are both required. Ambiguous
// matches never change a draft; the user can verify those on Naver directly.
export function matchingPublicKoreaPosts(xml, drafts) {
  const posts = [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const title = xmlValue(item, "title");
    const url = canonicalNaverUrl(xmlValue(item, "link"), "who-ami");
    return { title, url, publishedAt: xmlValue(item, "pubDate") };
  }).filter((post) => /^https:\/\/blog\.naver\.com\/who-ami\/\d{6,}$/.test(post.url));

  return drafts.flatMap((draft) => {
    if (!draft.topicId || draft.state === "published" || draft.publishedUrl) return [];
    if (drafts.filter((item) => item.topicId && normalized(item.title) === normalized(draft.title)).length !== 1) return [];
    const matches = posts.filter((post) => normalized(post.title) === normalized(draft.title));
    return matches.length === 1 ? [{ id: draft.id, ...matches[0] }] : [];
  });
}
