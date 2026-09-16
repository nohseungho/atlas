import test from "node:test";
import assert from "node:assert/strict";
import { WEIGHTS, selectionMetrics, selectTopFive, exclusionKeys, identityKeys } from "./unified-selection.js";
import { feedSignals, communitySignal, koreaPopularEntries } from "./unified-evidence.js";
import { parseFeed } from "./unified-products.js";
import { applyCollected, prepareMaterial, reconcileChannel, publishedExclusions, migrateResults } from "./unified-workflow.js";

const now = Date.now(); const checkedAt = new Date(now).toISOString();
function candidate(id, signals = {}, channel = "global_blogger") {
  const sourceUrl = channel === "global_blogger" ? `https://www.dealnews.com/product/${id}.html` : `https://www.ppomppu.co.kr/zboard/view.php?id=ppomppu&no=${id}`;
  return { id, name: `Product ${id}`, channel, sourceUrl, source: channel === "global_blogger" ? "DealNews" : "뽐뿌", checkedAt, publishedAt: checkedAt,
    priceText: "$10", currentPrice: 10, features: ["1kg"], evidence: `Product ${id} for $10`, priceNotice: "Prices may change", reason: "Candidate",
    signals: Object.fromEntries(Object.entries(signals).map(([k, v]) => [k, { sourceUrl, checkedAt, quote: `${k} evidence`, ...v }])) };
}
const popular = { popularity: { kind: "popular_feed" } };
const discount = { discount: { kind: "explicit_percent", percent: 20 } };
const practical = { practicality: { kind: "specifications" } };
const stateFor = (...products) => ({ channels: Object.fromEntries(["korea_naver", "global_blogger"].map((c) => [c, { slots: products.filter((p) => p.channel === c), candidates: products.filter((p) => p.channel === c) }])), drafts: {} });

test("40/30/20/10 are exact, missing evidence receives no invented points", () => {
  assert.deepEqual(WEIGHTS, { popularity: 40, price: 30, practicality: 20, trust: 10 });
  const rank = selectionMetrics(candidate("one", { ...popular, ...discount, ...practical }), now);
  assert.equal(rank.score, 72); // 40 + (40 * .3) + (50 * .2) + 10
  const empty = selectionMetrics(candidate("two"), now);
  assert.equal(empty.components.popularity, 0); assert.equal(empty.components.price, 0);
  assert.equal(empty.discountPercent, null); assert.equal(empty.badge, null);
});
test("popular + verified discount wins, discount-only cannot enter first three", () => {
  const picks = selectTopFive([candidate("p", popular), candidate("sale", { discount: { kind: "explicit_percent", percent: 90 } }), candidate("both", { ...popular, ...discount })], new Set(), now);
  assert.equal(picks.length, 5); assert.equal(picks[0].id, "both"); assert.equal(picks[1].id, "p");
  assert.equal(picks[2], null); assert.equal(picks[3].id, "sale");
});
test("fabricated, stale, unknown-host evidence cannot qualify", () => {
  const p = candidate("bad", { popularity: { kind: "popular_feed", sourceUrl: "https://evil.invalid", checkedAt }, discount: { kind: "explicit_percent", percent: 120 } });
  assert.ok(selectTopFive([p], new Set(), now).every((p) => p === null));
  const old = candidate("old", { popularity: { kind: "popular_feed", checkedAt: "2020-01-01" } });
  assert.equal(selectionMetrics(old, now).components.popularity, 0);
});
test("same product under different merchant/price/tracking links appears once, published aliases excluded", () => {
  const a = { ...candidate("a", popular), name: "[Shop A] Brand AB-123 1TB (12,000원/무료)" };
  const b = { ...candidate("b", popular), name: "[Shop B] Brand AB-123 1TB (13,000원/무료)" };
  assert.equal(selectTopFive([a, b], new Set(), now).filter(Boolean).length, 1);
  assert.equal(selectTopFive([b], exclusionKeys([{ product: a }]), now).filter(Boolean).length, 0);
  assert.deepEqual(identityKeys({ sourceUrl: "http://www.ppomppu.co.kr/zboard/view.php?id=ppomppu&no=123&page=3" }), identityKeys({ sourceUrl: "https://ppomppu.co.kr/zboard/view.php?id=ppomppu&no=123" }));
});
test("explicit comparison calculates discount, savings alone does not invent a regular price", () => {
  const base = { xml: "<description>Save $10 today</description>", title: "Drive for $20", currentPrice: 20, sourceUrl: "https://www.dealnews.com/a", checkedAt };
  assert.equal(feedSignals(base).discount, undefined);
  assert.equal(feedSignals({ ...base, title: "Sale up to 80% off" }).discount, undefined);
  assert.equal(feedSignals({ ...base, title: "Drive 25% off" }).discount.percent, 25);
  const s = feedSignals({ ...base, xml: "<description>Regular price: $40</description>" }).discount;
  assert.equal(s.regularPrice, 40); assert.equal(s.percent, 50);
});
test("source adapters verify actual recommendation labels and active popular page", () => {
  assert.equal(communitySignal('<span id="vote_list_btn_txt">10</span><span id="vote_anti_list_btn_txt">2</span>', "https://ppomppu.co.kr/a", checkedAt).up, 10);
  assert.equal(communitySignal("1000 views", "https://ppomppu.co.kr/a", checkedAt), null);
  const row = '<tr class="baseList bbs_new1"><a class="baseList-title" href="view.php?id=ppomppu&no=123">[판매처] 물티슈 10팩</a><td title="26.09.16 10:00:00"></td></tr>';
  assert.equal(koreaPopularEntries(row).length, 0);
  assert.equal(koreaPopularEntries('<a id="current" href="?hotlist_flag=999">핫/인기</a>' + row).length, 1);
});
test("sitewide sales and from-price promotions never become individual products", () => {
  const xml = (title, type = "deal") => `<item><title>${title}</title><link>https://www.dealnews.com/a</link><pubDate>${checkedAt}</pubDate><dealnews:dealType>${type}</dealnews:dealType></item>`;
  assert.equal(parseFeed(xml("Shop sale up to 70% off", "sale"), "global_blogger", checkedAt).length, 0);
  assert.equal(parseFeed(xml("Golf Deals for Clubs from $1"), "global_blogger", checkedAt).length, 0);
});
test("blog/shorts prepare independently and retries preserve edited drafts and evidence", () => {
  const p = candidate("independent", popular); const state = stateFor(p);
  const first = prepareMaterial(state, p.id, "shorts");
  assert.equal(first.prepared.blog, undefined); assert.ok(first.prepared.shorts);
  assert.equal(first.images[0].characterId, "miji"); assert.ok(first.images[0].src.endsWith("ATLAS-MIJI-MASTER.png"));
  assert.equal(first.shorts.evidenceSnapshot.checkedAt, checkedAt);
  assert.deepEqual(first.shorts.evidenceSnapshot.signals, p.signals);
  first.title = "My reviewed title";
  prepareMaterial(state, p.id, "blog"); prepareMaterial(state, p.id, "shorts");
  assert.equal(state.drafts[p.id].title, "My reviewed title");
  const onlyBlog = stateFor(p); prepareMaterial(onlyBlog, p.id, "blog"); assert.equal(onlyBlog.drafts[p.id].shorts, undefined);
});
test("published and uncertain products cannot be recommended or prepared again", () => {
  const p = candidate("already", popular); const state = stateFor(p);
  prepareMaterial(state, p.id, "blog").state = "needs_reconciliation";
  assert.throws(() => prepareMaterial(state, p.id, "shorts"));
  applyCollected(state, state.channels);
  assert.equal(state.channels.global_blogger.slots.filter(Boolean).length, 0);
});
test("read-only recovery restores result URL, is idempotent, and other channel failure preserves it", () => {
  const p = candidate("recover", popular); const kr = candidate("12345", popular, "korea_naver"); const state = stateFor(p, kr);
  const draft = prepareMaterial(state, p.id, "blog"); draft.state = "publishing"; draft.attemptedAt = checkedAt;
  const post = { id: "post-123", title: draft.title, url: "https://owned-blog.blogspot.com/2026/09/new.html", content: p.sourceUrl, published: checkedAt };
  reconcileChannel(state, p.channel, [post]);
  assert.equal(draft.state, "published"); assert.equal(state.results[p.channel][p.id].publishedUrl, post.url);
  reconcileChannel(state, kr.channel, [], { error: "offline" });
  reconcileChannel(state, p.channel, [post]);
  assert.equal(state.results[p.channel][p.id].publishedUrl, post.url); assert.equal(state.history.length, 1);
  assert.ok(publishedExclusions(state).has(identityKeys(p)[0]));
  assert.equal(migrateResults(state).results[p.channel][p.id].externalId, "post-123");
});
test("ambiguous/missing/older remote posts never unlock an uncertain publication", () => {
  const p = candidate("uncertain", popular); const state = stateFor(p); const draft = prepareMaterial(state, p.id, "blog");
  draft.state = "publishing"; draft.attemptedAt = checkedAt;
  const post = { id: "1", title: draft.title, url: "https://owned-blog.blogspot.com/a", content: p.sourceUrl, published: checkedAt };
  reconcileChannel(state, p.channel, [post, { ...post, id: "2" }]); assert.equal(draft.state, "needs_reconciliation");
  reconcileChannel(state, p.channel, []); assert.equal(draft.state, "needs_reconciliation");
  reconcileChannel(state, p.channel, [{ ...post, published: "2020-01-01" }]); assert.equal(draft.state, "needs_reconciliation");
});
test("Naver protected post can never be adopted by recovery", () => {
  const p = candidate("protected", popular, "korea_naver"); const state = stateFor(p); const draft = prepareMaterial(state, p.id, "blog");
  draft.state = "publishing"; draft.attemptedAt = checkedAt;
  reconcileChannel(state, p.channel, [{ id: "224407589323", title: draft.title, content: p.sourceUrl, url: "https://blog.naver.com/who-ami/224407589323", published: checkedAt }]);
  assert.notEqual(draft.state, "published"); assert.equal(Object.keys(state.results[p.channel]).length, 0);
});
test("new evidence archives edited material and synchronizes the two new preparations", () => {
  const p = candidate("revision", popular); const state = stateFor(p);
  prepareMaterial(state, p.id, "blog").bodyText = "Human edited body";
  state.channels.global_blogger.slots[0] = { ...p, checkedAt: new Date(now + 1000).toISOString() };
  const newDraft = prepareMaterial(state, p.id, "shorts");
  prepareMaterial(state, p.id, "blog");
  assert.equal(state.archives[p.id][0].bodyText, "Human edited body");
  assert.equal(state.archives[p.id].length, 1);
  assert.equal(newDraft.shorts.evidenceSnapshot.checkedAt, newDraft.product.checkedAt);
});
test("reconciliation learns external publications and retains them after failures or RSS rollover", () => {
  const p = candidate("external", popular); const state = stateFor(p);
  const post = { id: "external", title: p.name, url: "https://owned-blog.blogspot.com/external", content: p.sourceUrl };
  reconcileChannel(state, p.channel, [post]);
  reconcileChannel(state, p.channel, []);
  reconcileChannel(state, p.channel, [], { error: "offline" });
  applyCollected(state, state.channels);
  assert.equal(state.channels.global_blogger.slots.filter(Boolean).length, 0);
});
test("channel master images cannot be substituted even inside local asset paths", () => {
  const p = candidate("master", popular); const state = stateFor(p);
  const draft = prepareMaterial(state, p.id, "blog");
  draft.images[0].src = "public/atlas/characters/ATLAS-SUO-MASTER.png";
  assert.throws(() => prepareMaterial(state, p.id, "shorts"));
});
