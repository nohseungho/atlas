import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs";

const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; let blockedPublishRequests = 0;
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/**", async (route) => {
  const request = route.request();
  const data = request.method() === "POST" ? request.postDataJSON() : null;
  if (data?.action === "publish" || /\/api\/(?:publish|atlas\/korea-publish)(?:\?|$)/.test(request.url())) {
    blockedPublishRequests++; return route.abort();
  }
  return route.continue();
});
const api = "http://localhost:3002/api/atlas/unified-publish";
async function action(button, actionName) {
  const response = page.waitForResponse((r) => r.url() === api && r.request().method() === "POST" && r.request().postDataJSON()?.action === actionName);
  await button.click();
  const res = await response; assert.equal(res.status(), 200, await res.text());
  return res.json();
}
try {
  await page.goto("http://localhost:3002/atlas/unified-publish");
  const fresh = await action(page.getByRole("button", { name: "오늘 자료 업데이트", exact: true }), "refresh");
  for (const channel of ["korea_naver", "global_blogger"]) {
    assert.equal(fresh.channels[channel].slots.length, 5);
    assert.ok(fresh.channels[channel].slots.filter(Boolean).length > 0, `No live evidence for ${channel}`);
    const title = channel === "korea_naver" ? "국내 Naver" : "해외 Blogger";
    const region = page.getByRole("region", { name: title, exact: true });
    assert.equal(await region.locator("[data-slot]").count(), 5);
    const card = region.locator("[data-slot]").filter({ has: page.getByRole("button", { name: "선택", exact: true }) }).first();
    assert.equal(await card.locator("[data-badge]").count(), 1);
    assert.equal(await card.getByText(/확인 시각:/).isVisible(), false);
    await card.getByText("상세보기", { exact: true }).click();
    assert.equal(await card.getByText(/확인 시각:/).isVisible(), true);
    await card.getByText("상세보기", { exact: true }).click();
    await card.getByRole("button", { name: "선택", exact: true }).click();
    const picked = fresh.channels[channel].slots.find(Boolean);
    const shorts = await action(card.getByRole("button", { name: "쇼핑쇼츠 준비", exact: true }), "prepareShorts");
    assert.equal(shorts.drafts[picked.id].shorts.evidenceSnapshot.checkedAt, picked.checkedAt);
    assert.equal(shorts.drafts[picked.id].shorts.product.channelId, channel);
    const prepared = await action(card.getByRole("button", { name: "블로그 준비", exact: true }), "prepareBlog");
    const draft = prepared.drafts[picked.id];
    assert.ok(draft.bodyText.includes(picked.checkedAt));
    assert.ok(draft.images[0].src.endsWith(channel === "korea_naver" ? "ATLAS-SUO-MASTER.png" : "ATLAS-MIJI-MASTER.png"));
    assert.equal(await page.getByRole("button", { name: "신규 글 발행" }).count(), 0);
  }
  assert.equal(await page.getByText(/상태:|selectionMetrics|needs_reconciliation/).count(), 0);
  fs.mkdirSync(".atlas-data", { recursive: true });
  // Compact list view screenshots, with prepared materials collapsed.
  for (const region of [page.getByRole("region", { name: "국내 Naver", exact: true }), page.getByRole("region", { name: "해외 Blogger", exact: true })]) {
    await region.getByRole("button", { name: "선택", exact: true }).first().click();
  }
  await page.screenshot({ path: ".atlas-data/unified-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "해외 Blogger", exact: true }).click();
  assert.equal(await page.getByRole("region", { name: "국내 Naver", exact: true }).isVisible(), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: ".atlas-data/unified-mobile.png", fullPage: true });
  const global = page.getByRole("region", { name: "해외 Blogger", exact: true });
  const firstCard = global.locator("[data-slot]").filter({ has: page.getByRole("button", { name: "선택", exact: true }) }).first();
  await firstCard.getByRole("button", { name: "선택", exact: true }).click();
  await firstCard.getByRole("button", { name: "쇼츠 스튜디오 열기", exact: true }).click();
  await page.waitForURL(/\/atlas\/shorts-studio\?mode=photo&productId=/);
  const id = new URL(page.url()).searchParams.get("productId");
  const product = await page.evaluate((id) => JSON.parse(localStorage.getItem("atlas.products")).find((p) => p.id === id), id);
  assert.equal(product.character, "miji"); assert.equal(product.channelId, "global_blogger");
  assert.ok(product.checkedAt && product.signals.popularity);
  await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => canvas.width > 0));
  const imageNames = await page.evaluate(async (productId) => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open("atlas-photo-studio"); req.onsuccess = () => resolve(req.result); req.onerror = reject; });
    const rows = await new Promise((resolve, reject) => { const req = db.transaction("productImages").objectStore("productImages").index("productId").getAll(productId); req.onsuccess = () => resolve(req.result); req.onerror = reject; });
    db.close(); return rows.map((row) => row.name);
  }, id);
  assert.ok(imageNames.includes("ATLAS-MIJI-MASTER.png"));
  assert.deepEqual(errors, []); assert.equal(blockedPublishRequests, 0);
  // Deliberately nonexistent ID: proves the preparation-only gate without any real target.
  const forbidden = await page.request.post(api, { data: { action: "publish", id: "nonexistent-safety-check" } });
  assert.equal(forbidden.status(), 403);
  console.log(JSON.stringify({ liveSlots: Object.fromEntries(Object.entries(fresh.channels).map(([k, v]) => [k, v.slots.filter(Boolean).length])), details: "passed", independentPreparation: "passed", mijiImageTransfer: "passed", mobileOverflow: false, pageErrors: errors, externalPublications: 0 }));
} finally { await browser.close(); }
