import { canonicalizeProductUrl } from "./product-import/url-guard.js";

export const WEIGHTS = Object.freeze({ popularity: 40, price: 30, practicality: 20, trust: 10 });
const DAY = 86400000;
export function productName(value) {
  return String(value || "").normalize("NFKC").replace(/^\s*\[[^\]]+\]\s*/, "")
    .replace(/\s+for\s+\$[\d,.]+[\s\S]*$/i, "")
    .replace(/\s*\([^)]*(?:[\d,]+\s*원|[\d,]{3,}\s*\/)[^)]*\)\s*$/, "").trim();
}
export function identityKeys(product = {}) {
  const keys = [];
  const name = productName(product.name || product.productName || product.title).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (name.length >= 4) keys.push(`name:${name}`);
  if (product.gtin) keys.push(`gtin:${product.gtin}`);
  if (product.sku && product.brand) keys.push(`model:${String(product.brand).toLowerCase()}:${String(product.sku).toLowerCase()}`);
  const bodyLinks = String(product.bodyMarkdown || product.bodyHtml || product.content || "").replaceAll("&amp;", "&").match(/https?:\/\/(?:www\.)?(?:ppomppu\.co\.kr|dealnews\.com)\/[^\s<>"')]+/g) || [];
  for (const raw of [product.sourceUrl, product.productUrl, product.canonicalUrl, ...bodyLinks]) {
    const url = canonicalizeProductUrl(raw);
    if (url) {
      const parsed = new URL(url); parsed.protocol = "https:"; parsed.searchParams.delete("iref");
      if (parsed.hostname === "ppomppu.co.kr") for (const key of ["page", "divpage", "hotlist_flag"]) parsed.searchParams.delete(key);
      keys.push(`url:${parsed.href}`);
    }
  }
  return [...new Set(keys)];
}
export function exclusionKeys(records = []) {
  return new Set(records.flatMap((row) => identityKeys(row.product || row)));
}
export function isExcluded(product, excluded) { return identityKeys(product).some((key) => excluded.has(key)); }
function verified(signal, product, now) {
  const age = now - Date.parse(signal?.checkedAt);
  if (!signal?.sourceUrl || !signal?.quote || !Number.isFinite(age) || age < -3600000 || age > DAY) return false;
  try {
    const signalHost = new URL(signal.sourceUrl).hostname.replace(/^www\./, "");
    return signalHost === new URL(product.sourceUrl).hostname.replace(/^www\./, "");
  } catch { return false; }
}
export function selectionMetrics(product, now = Date.now()) {
  const s = product.signals || {};
  const pop = verified(s.popularity, product, now) ? s.popularity : null;
  const popularity = pop?.kind === "popular_feed" ? 100 : pop?.kind === "community_votes" ? Math.min(100, Math.max(0, pop.up - pop.down) * 5) : 0;
  const popular = pop?.kind === "popular_feed" || (pop?.kind === "community_votes" && pop.up - pop.down >= 5);
  const discount = verified(s.discount, product, now) && Number.isFinite(s.discount.percent) && s.discount.percent > 0 && s.discount.percent < 100 ? s.discount : null;
  const quality = verified(s.quality, product, now) && s.quality.kind === "editor_pick";
  const practical = verified(s.practicality, product, now) ? s.practicality : null;
  const practicality = practical?.kind === "consumable_multipack" ? 100 : practical?.kind === "specifications" ? 50 : 0;
  const price = discount ? Math.min(100, discount.percent * 2) : 0;
  const age = now - Date.parse(product.checkedAt);
  const publishedAge = now - Date.parse(product.publishedAt);
  const trust = Number.isFinite(age) && age >= -3600000 && age <= DAY && Number.isFinite(publishedAge) && publishedAge >= -3600000 && publishedAge <= 3 * DAY ? 60 + 40 * Math.max(0, 1 - Math.max(0, publishedAge) / (3 * DAY)) : 0;
  const score = (popularity * WEIGHTS.popularity + price * WEIGHTS.price + practicality * WEIGHTS.practicality + trust * WEIGHTS.trust) / 100;
  // Gates outrank the score: a discount alone never occupies slots 1–3.
  const tier = popular && discount ? 2 : popular || quality ? 1 : 0;
  const badge = popular ? "인기템" : practical?.kind === "consumable_multipack" ? "쟁여둘 때" : discount && practicality > 0 ? "가성비" : discount ? "지금 할인" : null;
  const reason = popular && discount ? `인기 근거와 ${discount.percent}% 할인 표기를 함께 확인했어요.`
    : popular ? "공개 추천 반응이 확인된 상품이라 먼저 비교해 보세요."
    : badge === "쟁여둘 때" ? "여러 개 묶음의 생활 소모품으로 필요한 수량을 비교해 보세요."
    : discount ? `${discount.percent}% 할인 표기가 있어 구매 조건을 비교하기 좋아요.` : "추가 근거를 확인 중이에요.";
  return { score, tier, badge, reason, discountPercent: discount?.percent ?? null, components: { popularity, price, practicality, trust } };
}
export function selectTopFive(candidates = [], excluded = new Set(), now = Date.now()) {
  const eligible = candidates.filter((p) => !isExcluded(p, excluded)).map((p) => ({ ...p, selection: selectionMetrics(p, now) }))
    .filter((p) => p.selection.badge && p.selection.components.trust > 0)
    .sort((a, b) => b.selection.tier - a.selection.tier || b.selection.score - a.selection.score || a.id.localeCompare(b.id));
  const unique = []; const seen = new Set(excluded);
  for (const p of eligible) {
    if (isExcluded(p, seen)) continue;
    identityKeys(p).forEach((key) => seen.add(key)); unique.push(p);
  }
  const strong = unique.filter((p) => p.selection.tier > 0);
  const weak = unique.filter((p) => p.selection.tier === 0);
  const result = Array.from({ length: 5 }, () => null);
  for (let i = 0; i < Math.min(strong.length, 5); i++) result[i] = strong[i];
  for (let i = 3; i < 5; i++) if (!result[i]) result[i] = weak.shift() || null;
  return result.map((p) => p ? { ...p, badge: p.selection.badge, reason: p.selection.reason, discountPercent: p.selection.discountPercent } : null);
}
