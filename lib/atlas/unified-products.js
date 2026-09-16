import { createHash } from "node:crypto";
import { canonicalizeProductUrl } from "./product-import/url-guard.js";
import { stampChannelIdentity, validateChannelIdentity, assertNaverWriteTarget, getCharacterDefinition } from "./character-channel-policy.js";
import { SOURCE_CONFIG, xmlValue, readPublicSource, feedSignals, communitySignal, koreaPopularEntries } from "./unified-evidence.js";
import { productName, selectTopFive } from "./unified-selection.js";

export const SOURCES = SOURCE_CONFIG;
export const CHECKS = ["title", "body", "images", "disclosure", "links"];
export const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function slots(items = []) { return Array.from({ length: 5 }, (_, i) => items[i] || null); }
export function parseFeed(xml, channel, checkedAt = new Date().toISOString(), { popular = false } = {}) {
  const source = SOURCES[channel];
  if (!source) throw new Error("Unknown channel");
  const seen = new Set();
  return [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap((match) => {
    const tag = (name) => xmlValue(match[1], name);
    const title = tag("title");
    if (channel === "global_blogger" && (tag("dealnews:dealType") === "sale" || /\b(?:up to|deals|sale|clearance|from\s+\$|gift card.*purchase|w\/ car purchase)/i.test(title))) return [];
    const name = productName(title);
    const rawUrl = tag("link");
    const url = canonicalizeProductUrl(rawUrl) ? rawUrl : "";
    const publishedAt = new Date(tag("pubDate")).getTime();
    const age = Date.parse(checkedAt) - publishedAt;
    if (!name || !url || !Number.isFinite(age) || age < -3600000 || age > 72 * 3600000 || seen.has(url)) return [];
    const host = new URL(url).hostname;
    if (host !== source.host && !host.endsWith(`.${source.host}`)) return [];
    seen.add(url);
    const structuredPrice = tag("dealnews:price");
    const usdPrice = /<dealnews:price\b[^>]*currency=["']USD["']/i.test(match[1]) && /^\d+(?:\.\d+)?$/.test(structuredPrice) ? `$${structuredPrice}` : "";
    const priceText = channel === "global_blogger" ? usdPrice || title.match(/\bfor\s+(\$[\d,]+(?:\.\d{1,2})?)/i)?.[1] : title.match(/[\d,]+\s*원/)?.[0] || title.match(/\(([\d,]{3,})(?:원)?\s*[,/]/)?.[1];
    const currentPrice = priceText ? Number(priceText.replace(/[^\d.]/g, "")) : null;
    const expires = tag("dealnews:expires");
    if (expires && Date.parse(expires) < Date.parse(checkedAt)) return [];
    const signals = feedSignals({ xml: match[1], title, sourceUrl: url, checkedAt, currentPrice, popular });
    if (popular && signals.popularity) signals.popularity.sourceUrl = source.popularUrl;
    const features = [...new Set(name.match(/\d+(?:\.\d+)?\s*(?:kg|gb|tb|ml|mah|w|개|매|팩|미|인치|inch|pack)\b/gi) || [])];
    const category = tag("dealnews:category");
    if (category) features.push(category);
    return [{ id: digest([channel, canonicalizeProductUrl(url)]).slice(0, 24), channel, name, sourceUrl: url, source: source.name,
      checkedAt, publishedAt: new Date(publishedAt).toISOString(), priceText: priceText || "가격 미확인", currentPrice,
      currency: channel === "korea_naver" ? "KRW" : "USD", regularPrice: signals.discount?.regularPrice ?? null, discountPercent: null, signals,
      features: features.length ? features : ["상세 사양은 원문에서 확인 필요"], reason: `${source.name}에 최근 게시된 할인 후보`,
      evidence: usdPrice ? `${title} (RSS price: ${usdPrice})` : title, trendVerified: false, priceNotice: "게시글에 기재된 가격입니다. 옵션·배송비·쿠폰·재고에 따라 변동될 수 있습니다." }];
  }).slice(0, 40);
}
export async function collectChannel(channel) {
  const source = SOURCES[channel];
  const checkedAt = new Date().toISOString();
  try {
    const urls = [source.url, source.popularUrl].filter(Boolean);
    const feeds = await Promise.allSettled(urls.map((url) => readPublicSource(url, source.host)));
    const items = feeds.flatMap((feed, i) => {
      if (feed.status !== "fulfilled") return [];
      const xml = channel === "korea_naver" && i === 1 ? koreaPopularEntries(feed.value).map((p) => `<item><title>${escapeHtml(p.title)}</title><link>${escapeHtml(p.sourceUrl)}</link><pubDate>${p.publishedAt}</pubDate></item>`).join("") : feed.value;
      return parseFeed(xml, channel, checkedAt, { popular: i === 1 });
    });
    if (!items.length) throw new Error("No recent candidates");
    if (channel === "korea_naver") {
      // Four bounded workers; one page failure cannot erase the feed or other evidence.
      const queue = items.filter((p) => !p.signals.popularity);
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (queue.length) {
          const product = queue.shift();
          try {
            const html = await readPublicSource(product.sourceUrl, source.host);
            const signal = communitySignal(html, product.sourceUrl, new Date().toISOString());
            if (signal) product.signals.popularity = signal;
          } catch { /* Missing evidence stays missing; never estimate votes. */ }
        }
      }));
    }
    return { candidates: items, slots: selectTopFive(items), checkedAt, source, error: "" };
  } catch { return { candidates: [], slots: slots(), checkedAt, source, error: "출처에 연결하지 못했습니다. 확인되지 않은 상품은 표시하지 않습니다." }; }
}
export function prepareProduct(product, { includeShorts = true } = {}) {
  const age = Date.now() - Date.parse(product.checkedAt);
  if (!Number.isFinite(age) || age < -3600000 || age > 86400000) throw new Error("오늘 자료 업데이트가 필요합니다.");
  const korean = product.channel === "korea_naver";
  const draft = stampChannelIdentity({ id: product.id, product, title: product.name,
    bodyText: korean ? `${product.name}\n\n가격 근거: ${product.priceText}\n${product.priceNotice}\n\n선정 근거: ${product.reason}\n${product.features.join("\n")}\n\n출처: ${product.sourceUrl}\n확인시각: ${product.checkedAt}\n판매량 순위와 직접 사용 후기는 검증하지 않았습니다.` : `${product.name}\n\nReported price: ${product.priceText}\nPrice, availability, shipping and coupon conditions may change.\n\nListed by ${product.source}. Specifications and suitability require checking the original listing.\nSource: ${product.sourceUrl}\nChecked: ${product.checkedAt}\nThis is not a verified sales ranking or a hands-on review.`,
    disclosure: korean ? "제휴 링크가 없는 정보성 글입니다." : "Informational content. No affiliate links.",
    productUrl: product.sourceUrl, images: [], logNo: "", contentType: "new_product_review", state: "draft", publishedUrl: "",
  }, product.channel);
  const character = getCharacterDefinition(draft.character);
  draft.images = [{ id: "presenter", role: "presenter", src: character.masterAssetPath, previewSrc: `/${character.masterAssetPath.replace(/^public\//, "")}`, alt: character.displayName, channelId: draft.channelId, characterId: draft.character }];
  draft.evidenceSnapshot = { sourceUrl: product.sourceUrl, checkedAt: product.checkedAt, quote: product.evidence, signals: structuredClone(product.signals || {}), discountPercent: product.discountPercent ?? null };
  const lines = Object.values(product.signals || {}).map((s) => `${s.quote}\n${s.sourceUrl}\n${s.checkedAt}`).join("\n\n");
  if (lines) draft.bodyText += `\n\n${korean ? "확인한 공개 근거" : "Public source evidence"}\n${lines}`;
  assertIdentity(draft);
  if (includeShorts) draft.shorts = shortsMaterial(draft);
  return draft;
}
export function shortsMaterial(draft) {
  const p = draft.product;
  const product = stampChannelIdentity({ ...p, productUrl: draft.productUrl, affiliateLink: "", currentPrice: p.currentPrice ?? null, listPrice: p.regularPrice ?? null,
    currency: draft.channelId === "korea_naver" ? "KRW" : "USD", priceSource: `${p.source}: ${p.priceText}`,
    priceCheckedAt: p.checkedAt, benefit: p.reason, caption: draft.bodyText, note: draft.disclosure, imageRightsConfirmed: false }, draft.channelId);
  const identity = validateChannelIdentity(product, draft.channelId);
  if (!identity.ok) throw new Error(identity.issues.join("; "));
  return { product, evidenceSnapshot: draft.evidenceSnapshot, images: draft.images, script: draft.bodyText, disclosure: draft.disclosure, status: "materials_ready", renderedVideo: false };
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
