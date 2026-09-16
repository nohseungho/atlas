// Only first-party, public RSS/page endpoints. No keys, scraping bypass or paid services.
export const SOURCE_CONFIG = {
  korea_naver: { name: "뽐뿌 할인정보", url: "https://www.ppomppu.co.kr/rss.php?id=ppomppu", popularUrl: "https://www.ppomppu.co.kr/zboard/zboard.php?id=ppomppu&hotlist_flag=999", host: "ppomppu.co.kr" },
  global_blogger: { name: "DealNews", url: "https://www.dealnews.com/?rss=1", popularUrl: "https://www.dealnews.com/?rss=1&sort=hotness", host: "dealnews.com" },
};
export function decodeText(value) {
  return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&#(?:x([a-f0-9]+)|(\d+));/gi, (_, hex, dec) => {
      const code = parseInt(hex || dec, hex ? 16 : 10); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
export function xmlValue(xml, name) { return decodeText(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(xml)?.[1]); }
export async function readPublicSource(raw, host) {
  const url = new URL(raw);
  if (url.hostname !== host && url.hostname !== `www.${host}`) throw new Error("Unexpected source");
  url.protocol = "https:";
  const res = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Source HTTP ${res.status}`);
  const reader = res.body.getReader(); const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("Source too large"); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  const encoding = /euc-kr/i.test(`${res.headers.get("content-type")} ${bytes.subarray(0, 500).toString()}`) ? "euc-kr" : "utf-8";
  return new TextDecoder(encoding).decode(bytes);
}
export function feedSignals({ xml, title, sourceUrl, checkedAt, currentPrice, popular = false }) {
  const evidence = (quote, extra) => ({ sourceUrl, checkedAt, quote, ...extra });
  const signals = {};
  // A popular-list membership is a source claim, never a market-wide sales rank.
  if (popular) signals.popularity = evidence(sourceUrl.includes("ppomppu.co.kr") ? "뽐뿌 핫/인기 목록에 포함" : "Listed in DealNews Most Popular Deals", { kind: "popular_feed" });
  if (xmlValue(xml, "dealnews:staffPick") === "true") signals.quality = evidence("DealNews editor selection (staffPick=true)", { kind: "editor_pick" });
  // Restrict price claims to the item's title. Never derive a regular price from a savings amount.
  const percent = /(?:\b(\d{1,2}(?:\.\d+)?)%\s*off\b|(\d{1,2}(?:\.\d+)?)%\s*할인)/i.exec(title);
  if (percent && !/up to|최대|추가|extra|coupon|쿠폰/i.test(title)) signals.discount = evidence(percent[0], { kind: "explicit_percent", percent: Number(percent[1] || percent[2]) });
  const text = `${title} ${xmlValue(xml, "description")}`;
  const regular = /(?:regular(?:ly)?(?: price)?|list price|was)\s*:?\s*\$([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  if (regular && Number.isFinite(currentPrice) && currentPrice > 0) {
    const regularPrice = Number(regular[1].replaceAll(",", ""));
    if (regularPrice > currentPrice) signals.discount = evidence(`${regular[0]}; current $${currentPrice}`, { kind: "explicit_comparison", regularPrice, currentPrice, currency: "USD", percent: Math.round((1 - currentPrice / regularPrice) * 1000) / 10 });
  }
  const specs = title.match(/\d+(?:\.\d+)?\s*(?:kg|gb|tb|ml|mah|inch|pack|개|매|팩|롤)(?![a-z])/gi) || [];
  const quantity = title.match(/(\d+)\s*(?:개|팩|롤|매|[- ]?pack)(?![a-z])/i);
  const consumable = /휴지|키친타올|세제|생수|물티슈|toilet paper|paper towel|detergent|tissue/i.test(title);
  if (specs.length) signals.practicality = evidence(specs.join(" · "), { kind: consumable && Number(quantity?.[1]) >= 2 ? "consumable_multipack" : "specifications" });
  return signals;
}
export function communitySignal(html, sourceUrl, checkedAt) {
  const up = /id=["']vote_list_btn_txt["'][^>]*>\s*([\d,]+)\s*</i.exec(html);
  const down = /id=["']vote_anti_list_btn_txt["'][^>]*>\s*([\d,]+)\s*</i.exec(html);
  if (!up || !down) return null;
  return { kind: "community_votes", up: Number(up[1].replaceAll(",", "")), down: Number(down[1].replaceAll(",", "")), sourceUrl, checkedAt,
    quote: `뽐뿌 추천 ${up[1]} · 다른 의견 ${down[1]} (판매량·품질 보증 아님)` };
}
export function koreaPopularEntries(html) {
  // Only the active first-party hot/popular list, never a normal board with a matching link.
  if (!/id=["']current["'][^>]*href=["'][^"']*hotlist_flag=999/i.test(html)) return [];
  return [...html.matchAll(/<tr\b[^>]*class=["']baseList\s[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(([, row]) => {
    const anchor = /<a\b[^>]*class=["']baseList-title\s*[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    const date = /title=["'](\d{2})\.(\d{2})\.(\d{2}) (\d{2}:\d{2}:\d{2})["']/i.exec(row);
    if (!anchor || !date) return [];
    const link = new URL(decodeText(anchor[1]), "https://www.ppomppu.co.kr/zboard/");
    const no = link.searchParams.get("no");
    if (link.searchParams.get("id") !== "ppomppu" || !/^\d+$/.test(no || "")) return [];
    return [{ title: decodeText(anchor[2]), sourceUrl: `https://www.ppomppu.co.kr/zboard/view.php?id=ppomppu&no=${no}`, publishedAt: `20${date[1]}-${date[2]}-${date[3]}T${date[4]}+09:00` }];
  });
}
