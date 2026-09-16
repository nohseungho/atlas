import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs";

// Local UI only. Explicitly abort every publish request, even if a test regresses.
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/atlas/unified-publish", async (route) => {
  const request = route.request();
  if (request.method() === "POST" && request.postDataJSON()?.action === "publish") throw new Error("Actual publishing is forbidden in browser tests");
  return route.continue();
});
try {
  await page.goto("http://localhost:3002/atlas/unified-publish");
  await page.getByRole("button", { name: "오늘 자료 업데이트", exact: true }).click();
  await page.getByRole("button", { name: "오늘 자료 업데이트", exact: true }).waitFor({ timeout: 40000 });
  const domestic = page.getByRole("region", { name: "국내 Naver", exact: true });
  const global = page.getByRole("region", { name: "해외 Blogger", exact: true });
  for (const region of [domestic, global]) {
    assert.equal(await region.locator("[data-slot]").count(), 5);
    assert.equal(await region.getByRole("button", { name: "선택 · 원고와 쇼츠 준비" }).count(), 5);
    await region.getByRole("button", { name: "선택 · 원고와 쇼츠 준비" }).first().click();
    await region.getByRole("heading", { name: /원고 최종 점검/ }).waitFor();
    assert.equal(await region.getByRole("button", { name: "신규 글 발행" }).isDisabled(), true);
  }
  await domestic.getByRole("checkbox", { name: "수호 마스터 이미지를 본문에 사용" }).check();
  await domestic.getByRole("button", { name: "원고 저장", exact: true }).click();
  for (const name of ["제목 확인", "본문 확인", "이미지·사용 권한·캐릭터 확인", "제휴 고지 확인", "링크·가격 근거 확인"]) await domestic.getByRole("checkbox", { name, exact: true }).check();
  await domestic.getByRole("button", { name: "최종 점검 승인", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent === "신규 글 발행" && !b.disabled));
  // Editing invalidates the local publish gate immediately, then the stored approval.
  const title = domestic.getByRole("textbox", { name: "제목", exact: true });
  const original = await title.inputValue();
  await title.fill(`${original} `);
  assert.equal(await domestic.getByRole("button", { name: "신규 글 발행" }).isDisabled(), true);
  await title.fill(original);
  await domestic.getByRole("button", { name: "원고 저장", exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll("fieldset")].some((f) => f.disabled));
  fs.mkdirSync(".atlas-data", { recursive: true });
  await page.screenshot({ path: ".atlas-data/unified-browser.png", fullPage: true });
  const state = await (await page.request.get("http://localhost:3002/api/atlas/unified-publish")).json();
  const draft = Object.values(state.drafts).find((d) => d.channelId === "korea_naver");
  assert.equal(draft.state, "draft");
  assert.equal(draft.shorts.product.id, draft.product.id);
  await domestic.getByRole("button", { name: "같은 상품으로 쇼핑쇼츠 제작" }).click();
  await page.waitForURL(/\/atlas\/shorts-studio\?productId=/);
  const transferred = await page.evaluate((id) => JSON.parse(localStorage.getItem("atlas.products")).find((p) => p.id === id), draft.product.id);
  assert.equal(transferred.sourceUrl, draft.product.sourceUrl);
  assert.equal(transferred.character, "suho");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ domesticSlots: 5, globalSlots: 5, approvalGate: "passed", editRevokesApproval: "passed", shortsTransfer: "passed", pageErrors: errors, actualPublishRequests: 0 }));
} finally { await browser.close(); }
