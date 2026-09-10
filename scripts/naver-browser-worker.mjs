import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { naverEditorTarget } from "../lib/atlas/korea-product-pipeline.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const EDGE_PATHS = process.platform === "win32"
  ? [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ]
  : process.platform === "darwin"
    ? ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
    : ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable", "/usr/bin/google-chrome"];

function findBrowserExecutable() {
  const explicit = String(process.env.ATLAS_NAVER_BROWSER_PATH || "").trim();
  if (explicit && fs.existsSync(explicit)) return explicit;
  const found = EDGE_PATHS.find((p) => fs.existsSync(p));
  if (!found) throw Object.assign(new Error("Microsoft Edge/Chrome 실행 파일을 찾지 못했습니다."), { code: "NAVER_BROWSER_NOT_FOUND" });
  return found;
}

function profileDir() {
  const configured = String(process.env.ATLAS_NAVER_PROFILE_DIR || "").trim();
  return configured || path.join(os.homedir(), ".atlas", "naver-profile");
}

async function firstVisible(scope, selectors) {
  for (const selector of selectors) {
    const locator = scope.locator(selector).first();
    try {
      if (await locator.count() && await locator.isVisible({ timeout: 600 })) return locator;
    } catch {}
  }
  return null;
}

async function editorScope(page) {
  const scopes = [page, ...page.frames()];
  for (const scope of scopes) {
    for (const probe of [".se-documentTitle", ".se-component-content", "[contenteditable='true']", "textarea[name='title']"]) {
      try { if (await scope.locator(probe).count()) return scope; } catch {}
    }
  }
  return page;
}

async function ensureLoggedIn(page) {
  const url = page.url();
  const loginVisible = /nidlogin\.login\.naver\.com|nid\.naver\.com/i.test(url)
    || await page.locator("input#id, input[name='id']").count().catch(() => 0);
  if (loginVisible) throw Object.assign(new Error("네이버 로그인 1회가 필요합니다. 열린 Edge에서 로그인한 뒤 같은 작업을 다시 실행하세요."), { code: "NAVER_LOGIN_REQUIRED" });
}

async function replaceText(locator, text) {
  await locator.click();
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  try { await locator.fill(text); }
  catch { await locator.press("Backspace"); await locator.type(text, { delay: 1 }); }
}

async function setTitle(scope, title) {
  const el = await firstVisible(scope, [
    ".se-documentTitle .se-text-paragraph",
    ".se-documentTitle [contenteditable='true']",
    "textarea[name='title']",
    "input[name='title']",
    "[data-placeholder*='제목'][contenteditable='true']",
  ]);
  if (!el) throw Object.assign(new Error("네이버 제목 입력 영역을 찾지 못했습니다."), { code: "NAVER_TITLE_EDITOR_NOT_FOUND" });
  await replaceText(el, title);
}

async function setBody(scope, draft) {
  const el = await firstVisible(scope, [
    ".se-component-content [contenteditable='true']",
    ".se-section-text .se-text-paragraph",
    ".se-main-container [contenteditable='true']",
    "[contenteditable='true'][data-placeholder*='내용']",
  ]);
  if (!el) throw Object.assign(new Error("네이버 본문 입력 영역을 찾지 못했습니다."), { code: "NAVER_BODY_EDITOR_NOT_FOUND" });
  if (draft.contentType === "existing_post_update" && draft.updateMode === "images_only") return el;
  const text = [draft.affiliateUrl ? draft.affiliateDisclosure : "", draft.bodyText || "", draft.affiliateUrl ? `제품 확인하기: ${draft.affiliateUrl}` : ""].filter(Boolean).join("\n\n");
  await replaceText(el, text);
  return el;
}

function imageItems(draft) {
  return (draft.images || []).map((img) => ({ ...img, src: String(img.src || "").trim() })).filter((img) => img.src && !/^https?:\/\//i.test(img.src) && fs.existsSync(img.src));
}

async function findAnchor(scope, image) {
  const keywords = (image.anchorKeywords || []).map((v) => String(v || "").trim()).filter(Boolean);
  if (!keywords.length) return null;
  const blocks = scope.locator(".se-text-paragraph, .se-component-content p, [contenteditable='true'] p");
  const count = await blocks.count().catch(() => 0);
  let best = null;
  let bestScore = 0;
  for (let i = 0; i < Math.min(count, 250); i += 1) {
    const block = blocks.nth(i);
    let text = "";
    try { text = String(await block.innerText({ timeout: 300 })).trim(); } catch { continue; }
    if (!text) continue;
    const score = keywords.reduce((n, keyword) => n + (text.includes(keyword) ? 1 : 0), 0);
    if (score > bestScore) {
      best = block;
      bestScore = score;
      if (score === keywords.length) break;
    }
  }
  return bestScore > 0 ? { locator: best, score: bestScore, keywords } : null;
}

async function moveCaretAfterAnchor(anchor, bodyEl) {
  const target = anchor?.locator || bodyEl;
  await target.click();
  try { await target.press("End"); } catch {}
  try { await target.press("Enter"); } catch {}
}

async function uploadOne(page, scope, file) {
  const directInput = scope.locator("input[type='file']").first();
  if (await directInput.count().catch(() => 0)) {
    await directInput.setInputFiles(file);
    await page.waitForTimeout(1200);
    return;
  }
  const photoButton = await firstVisible(scope, ["button:has-text('사진')", "button[aria-label*='사진']", "button:has-text('이미지')", "[role='button']:has-text('사진')"]);
  if (!photoButton) throw Object.assign(new Error("네이버 사진 업로드 버튼을 찾지 못했습니다."), { code: "NAVER_IMAGE_BUTTON_NOT_FOUND" });
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 5000 });
  await photoButton.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
  await page.waitForTimeout(1500);
}

async function uploadImages(page, scope, draft, bodyEl) {
  const images = imageItems(draft);
  const placements = [];
  if (!images.length) return { uploaded: 0, requested: (draft.images || []).length, placements };

  const anchored = draft.contentType === "existing_post_update" && draft.updateMode === "images_only";
  for (const image of images) {
    const anchor = anchored ? await findAnchor(scope, image) : null;
    await moveCaretAfterAnchor(anchor, bodyEl);
    await uploadOne(page, scope, image.src);
    placements.push({
      id: image.id,
      placement: image.placement || "",
      matched: Boolean(anchor),
      matchedKeywords: anchor ? anchor.keywords.filter((keyword) => true).slice(0, anchor.score) : [],
    });
  }
  return { uploaded: images.length, requested: (draft.images || []).length, placements };
}

async function clickPublish(page, scope) {
  const openPublish = await firstVisible(scope, ["button:has-text('발행')", "button[aria-label*='발행']", "[role='button']:has-text('발행')"]);
  if (!openPublish) throw Object.assign(new Error("네이버 발행 버튼을 찾지 못했습니다."), { code: "NAVER_PUBLISH_BUTTON_NOT_FOUND" });
  await openPublish.click(); await page.waitForTimeout(700);
  const finalButton = await firstVisible(page, ["button:has-text('발행')", "button:has-text('확인')", "[role='button']:has-text('발행')"]);
  if (finalButton) await finalButton.click();
  await page.waitForTimeout(1600);
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const draft = payload.draft;
  const publish = Boolean(payload.publish);
  fs.mkdirSync(profileDir(), { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir(), { executablePath: findBrowserExecutable(), headless: false, viewport: null, args: ["--start-maximized"] });
  const page = context.pages()[0] || await context.newPage();
  let result;
  try {
    await page.goto(naverEditorTarget(draft), { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1200);
    await ensureLoggedIn(page);
    const scope = await editorScope(page);
    if (draft.contentType !== "existing_post_update" || draft.updateMode !== "images_only") await setTitle(scope, draft.title || "");
    const bodyEl = await setBody(scope, draft);
    const images = await uploadImages(page, scope, draft, bodyEl);
    if (!publish) {
      result = { status: "staged", editorUrl: page.url(), imageUpload: images, message: "네이버 편집기에 자동 반영했습니다. 발행은 승인 전이라 실행하지 않았습니다." };
    } else {
      await clickPublish(page, scope);
      result = { status: "published", editorUrl: page.url(), publishedUrl: page.url(), imageUpload: images, message: "네이버 발행 동작을 완료했습니다." };
    }
  } catch (error) {
    if (error?.code === "NAVER_LOGIN_REQUIRED") {
      result = { status: "login_required", errorCode: error.code, message: error.message, editorUrl: page.url(), keepOpen: true };
    } else {
      result = { status: "error", errorCode: error?.code || "NAVER_AUTOMATION_FAILED", message: error?.message || String(error) };
      await context.close().catch(() => {});
    }
  }
  fs.writeFileSync(outputPath, JSON.stringify(result), "utf8");
  if (result.status !== "login_required") await context.close().catch(() => {});
}

main().catch((error) => {
  const outputPath = process.argv[3];
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify({ status: "error", errorCode: error?.code || "NAVER_WORKER_FAILED", message: error?.message || String(error) }), "utf8");
  process.exitCode = 1;
});
