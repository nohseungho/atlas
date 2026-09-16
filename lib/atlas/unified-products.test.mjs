import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { slots, parseFeed, prepareProduct, assertReady, assertApproved, reviewHash, renderDraft, publishedUrlFor } from "./unified-products.js";
import { readUnified, mutateUnified } from "./unified-store.js";

const now = new Date().toISOString();
const item = (name, link, date = now) => `<item><title><![CDATA[${name}]]></title><link>${link}</link><pubDate>${date}</pubDate></item>`;
const fixture = item("[판매처] 테스트 제품 1kg (12,000원/무료)", "https://www.ppomppu.co.kr/zboard/view.php?id=ppomppu&amp;no=123");
const product = () => parseFeed(fixture, "korea_naver", now)[0];
const ready = () => ({ ...prepareProduct(product()), images: [{ src: "public/atlas/characters/ATLAS-SUO-MASTER.png" }] });

test("exactly five slots without fabricated fillers, even when source returns more", () => {
  assert.equal(slots().length, 5); assert.ok(slots().every((p) => p === null));
  assert.equal(slots([1, 2, 3, 4, 5, 6]).length, 5);
});
test("RSS preserves evidence, checks age and host, deduplicates, never claims a trend", () => {
  const data = parseFeed(fixture + fixture + item("old", "https://ppomppu.co.kr/old", "2000-01-01") + item("bad", "http://localhost/a"), "korea_naver", now);
  assert.equal(data.length, 1); assert.equal(data[0].priceText, "12,000원");
  assert.equal(data[0].trendVerified, false); assert.equal(data[0].checkedAt, now);
  assert.ok(data[0].features.includes("1kg"));
});
test("global feed retains referral link and uses source price, missing prices stay unknown", () => {
  const p = parseFeed(item("Drive 1TB for $39.99", "https://www.dealnews.com/drive/123.html?iref=rss"), "global_blogger", now)[0];
  assert.equal(p.priceText, "$39.99"); assert.ok(p.sourceUrl.endsWith("?iref=rss"));
  assert.equal(prepareProduct(p).character, "miji");
  assert.equal(parseFeed(item("Unknown price", "https://www.dealnews.com/other"), "global_blogger", now)[0].priceText, "가격 미확인");
});
test("blog and shopping shorts retain the same product, evidence and channel", () => {
  const draft = prepareProduct(product());
  assert.equal(draft.character, "suho"); assert.equal(draft.logNo, "");
  assert.equal(draft.shorts.product.id, draft.product.id);
  assert.equal(draft.shorts.product.sourceUrl, draft.product.sourceUrl);
  assert.equal(draft.shorts.product.character, "suho");
  assert.equal(draft.shorts.renderedVideo, false);
});
test("approval requires current content and rejects cross-channel assets and all existing targets", () => {
  const draft = ready();
  assert.throws(() => assertApproved(draft));
  draft.state = "approved"; draft.approvedHash = reviewHash(draft);
  assert.doesNotThrow(() => assertApproved(draft));
  assert.throws(() => assertApproved({ ...draft, title: "changed" }));
  for (const logNo of ["224407589323", "12345"]) assert.throws(() => assertReady({ ...draft, logNo }));
  assert.throws(() => assertReady({ ...draft, images: [{ src: "https://res.cloudinary.com/demo/image/upload/atlas/articles/miji.png" }] }));
  assert.throws(() => assertReady({ ...draft, character: "miji" }));
  for (const state of ["published", "publishing", "needs_reconciliation"]) assert.throws(() => assertApproved({ ...draft, state }));
  assert.throws(() => assertReady({ ...draft, product: { ...draft.product, checkedAt: "invalid" } }));
});
test("only concrete new Naver post URLs count as success", () => {
  const draft = ready();
  for (const publishedUrl of ["https://blog.naver.com/who-ami", "https://blog.naver.com/PostWriteForm.naver", "https://blog.naver.com/who-ami/224407589323", "https://evil.test/who-ami/123"]) assert.throws(() => publishedUrlFor(draft, { status: "published", publishedUrl }));
  assert.equal(publishedUrlFor(draft, { status: "published", publishedUrl: "https://blog.naver.com/who-ami/999999" }), "https://blog.naver.com/who-ami/999999");
});
test("draft HTML escapes untrusted source content", () => {
  assert.ok(renderDraft({ ...ready(), title: '<script>alert(1)</script>' }).includes("&lt;script&gt;"));
});
test("durable store preserves another channel URL, locks concurrent writes and survives reload", async () => {
  const original = process.cwd();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-unified-test-"));
  process.chdir(temp);
  try {
    await mutateUnified((state) => { state.drafts.kr = { state: "published", publishedUrl: "https://blog.naver.com/who-ami/999999" }; });
    await mutateUnified(async (state) => {
      state.drafts.global = { state: "needs_reconciliation" };
      await assert.rejects(mutateUnified(() => {}));
    });
    assert.equal(readUnified().drafts.kr.publishedUrl, "https://blog.naver.com/who-ami/999999");
    assert.equal(readUnified().drafts.global.state, "needs_reconciliation");
  } finally { process.chdir(original); fs.rmSync(temp, { recursive: true, force: true }); }
});
