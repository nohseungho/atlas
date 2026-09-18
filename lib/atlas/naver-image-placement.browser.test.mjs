// 실제 브라우저(DOM Selection)에서 커서가 "문단 끝"에 놓이는지 검증한다.
// 로컬 Edge/Chrome이 없으면 skip. 네트워크/네이버 접속 없음.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { createRequire } from "module";
import { caretToEndOfElement } from "./naver-image-placement.js";

const require = createRequire(import.meta.url);
const EDGE_PATHS = process.platform === "win32"
  ? ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"]
  : ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/usr/bin/microsoft-edge", "/usr/bin/google-chrome"];
const executablePath = [process.env.ATLAS_NAVER_BROWSER_PATH, ...EDGE_PATHS].filter(Boolean).find((p) => fs.existsSync(p));

const PARAGRAPH = "국내 제조, 순동 일체형 단자, 콘센트별 개별 스위치, 과부하 차단, 4구, 1.5m 케이블 구성입니다.";
// 좁은 폭으로 강제 줄바꿈시켜 "콘센트별 개|별" 처럼 시각적 줄 끝이 단어 중간에 오게 만든다.
const HTML = `<!doctype html><html><body><div contenteditable="true" style="width:120px;font-size:16px;word-break:break-all">
<p class="se-text-paragraph" id="p1">첫 번째 문단입니다.</p>
<p class="se-text-paragraph" id="p2">${PARAGRAPH}</p>
<p class="se-text-paragraph" id="p3">마지막 문단입니다.</p>
</div></body></html>`;

test("caretToEndOfElement places the caret at the paragraph end so Enter never splits text", { skip: executablePath ? false : "no local Edge/Chrome" }, async () => {
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(HTML);
    const p2 = page.locator("#p2");

    // 기존 방식(click + End)은 줄바꿈된 문단에서 시각적 줄 끝(단어 중간)에 멈춘다 → 재현
    await p2.click();
    await p2.press("End");
    await page.keyboard.press("Enter");
    const legacyTexts = await page.locator(".se-text-paragraph").allInnerTexts();
    const legacyIntact = legacyTexts.map((t) => t.trim()).includes(PARAGRAPH);
    await page.close();

    // 새 방식: Selection API로 문단 끝에 커서 → Enter 후에도 문단 원문 유지
    const fresh = await browser.newPage();
    await fresh.setContent(HTML);
    const caret = await fresh.locator("#p2").first().evaluate(caretToEndOfElement);
    assert.equal(caret.ok, true, JSON.stringify(caret));
    assert.equal(caret.text, PARAGRAPH);
    await fresh.keyboard.press("Enter");
    const texts = (await fresh.locator(".se-text-paragraph").allInnerTexts()).map((t) => t.trim());
    assert.equal(texts[1], PARAGRAPH, "paragraph must stay verbatim after Enter");
    assert.ok(!texts.some((t) => t && PARAGRAPH.startsWith(t) && t !== PARAGRAPH), "no partial paragraph fragments");
    assert.equal(texts[0], "첫 번째 문단입니다.");
    assert.equal(texts.at(-1), "마지막 문단입니다.");
    // 새 줄이 p2 바로 뒤에 생겼는지
    const afterP2 = await fresh.locator("#p2").first().evaluate((el) => (el.nextElementSibling?.innerText || "").trim());
    assert.equal(afterP2, "");

    // 참고 기록: 기존 방식이 실제로 문단을 쪼갰는지 (환경에 따라 다를 수 있어 assert하지 않음)
    console.log(`legacy click+End kept paragraph intact: ${legacyIntact} | legacy paragraphs: ${JSON.stringify(legacyTexts.map((t) => t.trim()))}`);
  } finally {
    await browser.close();
  }
});
