import { createHash } from "node:crypto";
import { canonicalizeProductUrl } from "./product-import/url-guard.js";
import { stampChannelIdentity, validateChannelIdentity, assertNaverWriteTarget } from "./character-channel-policy.js";

export const SOURCES = {
  korea_naver: { name: "뽐뿌 할인정보", url: "https://www.ppomppu.co.kr/rss.php?id=ppomppu", host: "ppomppu.co.kr" },
  global_blogger: { name: "DealNews", url: "https://www.dealnews.com/?rss=1", host: "dealnews.com" },
};
export const CHECKS = ["title", "body", "images", "disclosure", "links"];
export const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function decode(value) {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : "").replace(/\s+/g, " ").trim();
}
export function slots(items = []) { return Array.from({ length: 5 }, (_, i) => items[i] || null); }
export function parseFeed(xml, channel, checkedAt = new Date().toISOString()) {
  const source = SOURCES[channel];
  if (!source) throw new Error("Unknown channel");
  const seen = new Set();
  return [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap((match) => {
    const tag = (name) => decode(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(match[1])?.[1] || "");
    const name = tag("title");
    const rawUrl = tag("link");
    const url = canonicalizeProductUrl(rawUrl) ? rawUrl : "";
    const publishedAt = new Date(tag("pubDate")).getTime();
    const age = Date.parse(checkedAt) - publishedAt;
    if (!name || !url || !Number.isFinite(age) || age < -3600000 || age > 72 * 3600000 || seen.has(url)) return [];
    const host = new URL(url).hostname;
    if (host !== source.host && !host.endsWith(`.${source.host}`)) return [];
    seen.add(url);
    const priceText = channel === "global_blogger" ? name.match(/\$[\d,]+(?:\.\d{1,2})?/)?.[0] : name.match(/[\d,]+\s*원/)?.[0] || name.match(/\(([\d,]{3,})(?:원)?\s*[,/]/)?.[1];
    const features = [...new Set(name.match(/\d+(?:\.\d+)?\s*(?:kg|gb|tb|ml|mah|w|개|매|팩|미|인치|inch|pack)\b/gi) || [])];
    const category = tag("dealnews:category");
    if (category) features.push(category);
    return [{ id: digest([channel, canonicalizeProductUrl(url)]).slice(0, 24), channel, name, sourceUrl: url, source: source.name,
      checkedAt, publishedAt: new Date(publishedAt).toISOString(), priceText: priceText || "가격 미확인",
      features: features.length ? features : ["상세 사양은 원문에서 확인 필요"], reason: `${source.name}에 최근 게시된 할인 후보`,
      evidence: name, trendVerified: false, priceNotice: "게시글에 기재된 가격입니다. 옵션·배송비·쿠폰·재고에 따라 변동될 수 있습니다." }];
  }).slice(0, 5);
}
export async function collectChannel(channel) {
  const source = SOURCES[channel];
  const checkedAt = new Date().toISOString();
  try {
    const res = await fetch(source.url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("피드 크기 초과"); }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const encoding = /euc-kr/i.test(bytes.subarray(0, 200).toString()) ? "euc-kr" : "utf-8";
    const items = parseFeed(new TextDecoder(encoding).decode(bytes), channel, checkedAt);
    return { slots: slots(items), checkedAt, source, error: items.length ? "" : "최근 72시간 내 확인 가능한 상품 근거가 없습니다." };
  } catch { return { slots: slots(), checkedAt, source, error: "출처에 연결하지 못했습니다. 확인되지 않은 상품은 표시하지 않습니다." }; }
}
export function prepareProduct(product) {
  if (Date.now() - Date.parse(product.checkedAt) > 86400000) throw new Error("오늘 자료 업데이트가 필요합니다.");
  const korean = product.channel === "korea_naver";
  const draft = stampChannelIdentity({ id: product.id, product, title: product.name,
    bodyText: korean ? `${product.name}\n\n가격 근거: ${product.priceText}\n${product.priceNotice}\n\n선정 근거: ${product.reason}\n${product.features.join("\n")}\n\n출처: ${product.sourceUrl}\n확인시각: ${product.checkedAt}\n판매량 순위와 직접 사용 후기는 검증하지 않았습니다.` : `${product.name}\n\nReported price: ${product.priceText}\nPrice, availability, shipping and coupon conditions may change.\n\nListed by ${product.source}. Specifications and suitability require checking the original listing.\nSource: ${product.sourceUrl}\nChecked: ${product.checkedAt}\nThis is not a verified sales ranking or a hands-on review.`,
    disclosure: korean ? "제휴 링크가 없는 정보성 글입니다." : "Informational content. No affiliate links.",
    productUrl: product.sourceUrl, images: [], logNo: "", contentType: "new_product_review", state: "draft", publishedUrl: "",
  }, product.channel);
  assertIdentity(draft);
  draft.shorts = shortsMaterial(draft);
  return draft;
}
export function shortsMaterial(draft) {
  const p = draft.product;
  const product = stampChannelIdentity({ ...p, productUrl: draft.productUrl, affiliateLink: "", currentPrice: null,
    currency: draft.channelId === "korea_naver" ? "KRW" : "USD", priceSource: `${p.source}: ${p.priceText}`,
    priceCheckedAt: p.checkedAt, benefit: p.reason, caption: draft.bodyText, note: draft.disclosure, imageRightsConfirmed: false }, draft.channelId);
  const identity = validateChannelIdentity(product, draft.channelId);
  if (!identity.ok) throw new Error(identity.issues.join("; "));
  return { product, script: draft.bodyText, disclosure: draft.disclosure, status: "materials_ready", renderedVideo: false };
}
export function assertIdentity(draft) {
  const result = validateChannelIdentity(draft, draft.channelId);
  if (!result.ok) throw new Error(result.issues.join("; "));
  if (draft.logNo || draft.externalId || draft.publishedUrl) throw new Error("기존 글 수정 및 중복 발행 금지");
  if (draft.channelId === "korea_naver") assertNaverWriteTarget(draft);
}
export function reviewHash(draft) { return digest([draft.title, draft.bodyText, draft.disclosure, draft.productUrl, draft.images, draft.product, draft.channelId]); }
export function assertReady(draft) {
  assertIdentity(draft);
  if (!["draft", "approved"].includes(draft.state)) throw new Error("이미 발행을 시도한 글입니다. 결과 확인 전 재발행할 수 없습니다.");
  if (!draft.title.trim() || !draft.bodyText.trim() || !draft.disclosure.trim() || !canonicalizeProductUrl(draft.productUrl)) throw new Error("제목·본문·고지·링크를 확인하세요.");
  if (!draft.images.length) throw new Error("채널 이미지를 선택하세요.");
  const age = Date.now() - Date.parse(draft.product.checkedAt);
  if (!Number.isFinite(age) || age < -3600000 || age > 86400000) throw new Error("상품 근거가 오래되었습니다. 자료 업데이트 후 다시 준비하세요.");
}
export function assertApproved(draft) {
  assertReady(draft);
  if (draft.state !== "approved" || draft.approvedHash !== reviewHash(draft)) throw new Error("최종 점검 승인이 필요합니다.");
}
export function publishedUrlFor(draft, result) {
  const url = new URL(result.publishedUrl);
  if (url.protocol !== "https:") throw new Error("발행 URL 확인 실패");
  if (draft.channelId === "korea_naver") {
    const logNo = /^\/who-ami\/(\d+)\/?$/.exec(url.pathname)?.[1] || (url.pathname === "/PostView.naver" && url.searchParams.get("blogId") === "who-ami" ? url.searchParams.get("logNo") : "");
    if (url.hostname !== "blog.naver.com" || !logNo || result.status !== "published") throw new Error("신규 글 URL 확인 실패");
    assertNaverWriteTarget({ logNo });
  } else if (!result.externalId) throw new Error("Blogger 글 ID 확인 실패");
  return url.href;
}
export function renderDraft(draft) {
  return `<h1>${escapeHtml(draft.title)}</h1>${draft.bodyText.split(/\n+/).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}<p>${escapeHtml(draft.disclosure)}</p><p><a href="${escapeHtml(draft.productUrl)}" rel="nofollow">${draft.channelId === "korea_naver" ? "상품 근거 확인" : "View source"}</a></p>`;
}
