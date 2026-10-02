import { checkUserApproval } from "../lib/atlas/operate/publish-approval-store.js";
import { readJson } from "../lib/data-store.js";
import fs from "fs";
import { createKoreaDocument } from "../lib/atlas/article-document.js";
import { insertNaverDocument, findNaverEditorScope } from "../lib/atlas/naver-document-editor.js";
import { assertNewPost, createPublishTransactions } from "../lib/atlas/publish-transaction.js";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { naverEditorTarget } from "../lib/atlas/korea-product-pipeline.js";
import { assertNaverWriteTarget } from "../lib/atlas/character-channel-policy.js";

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
    try { if (await locator.count() && await locator.isVisible({ timeout: 600 })) return locator; } catch {}
  }
  return null;
}

async function dismissEditorPopups(page, scope) {
  // "작성 중인 글" 복구 안내와 도움말 패널만 닫는다. 본문/발행 버튼은 건드리지 않는다.
  const selectors = [
    "button.se-popup-button-cancel",
    "button.se-help-panel-close-button",
    ".se-help-panel button[aria-label*='닫기']",
    ".se-help-panel button[title*='닫기']",
    "[class*='help'] button[aria-label*='닫기']",
    "[class*='help'] button[title*='닫기']",
  ];
  for (const candidate of [scope, page, ...page.frames()]) {
    for (const selector of selectors) {
      const buttons = candidate.locator(selector);
      const count = Math.min(await buttons.count().catch(() => 0), 10);
      for (let i = 0; i < count; i += 1) {
        const button = buttons.nth(i);
        if (await button.isVisible().catch(() => false)) {
          await button.click({ force: true }).catch(() => {});
          await page.waitForTimeout(250);
        }
      }
    }
  }
}

async function ensureLoggedIn(page) {
  const isLoginPage = async () => {
    const url = page.url();
    return /nidlogin\.login\.naver\.com|nid\.naver\.com/i.test(url)
      || Boolean(await page.locator("input#id, input[name='id']").count().catch(() => 0));
  };
  if (!await isLoginPage()) return;

  console.log("네이버 로그인을 기다립니다. 열린 Edge에서 로그인하면 자동으로 계속 진행됩니다.");
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    if (!await isLoginPage()) {
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
      return;
    }
  }
  throw Object.assign(new Error("5분 안에 네이버 로그인이 완료되지 않았습니다. Edge 창을 유지합니다."), { code: "NAVER_LOGIN_TIMEOUT" });
}

async function replaceText(locator, text) {
  await locator.click();
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  try { await locator.fill(text); } catch { await locator.press("Backspace"); await locator.type(text, { delay: 1 }); }
}

async function setTitle(scope, title) {
  const selectors = [
    ".se-documentTitle .se-text-paragraph", ".se-documentTitle [contenteditable='true']", "textarea[name='title']", "input[name='title']", "[data-placeholder*='제목'][contenteditable='true']",
    // fallback: SmartEditor ONE 변형 마크업
    ".se-title-text .se-text-paragraph", ".se-title-text", ".se-section-documentTitle .se-text-paragraph", ".se-documentTitle", ".se-placeholder-title", "[placeholder*='제목']",
  ];
  let el = await firstVisible(scope, selectors);
  if (!el) {
    // 제목 영역이 보이지 않으면 렌더 대기 후 1회 재시도
    try { await scope.locator(".se-documentTitle, .se-title-text").first().waitFor({ state: "attached", timeout: 15000 }); } catch {}
    el = await firstVisible(scope, selectors) || (await scope.locator(".se-documentTitle, .se-title-text").first().count() ? scope.locator(".se-documentTitle, .se-title-text").first() : null);
  }
  if (!el) throw Object.assign(new Error("네이버 제목 입력 영역을 찾지 못했습니다."), { code: "NAVER_TITLE_EDITOR_NOT_FOUND" });
  await replaceText(el, title);
}

async function uploadOne(page, scope, file) {
  const directInputs = scope.locator("input[type='file']");
  if (await directInputs.count().catch(() => 0)) { await directInputs.first().setInputFiles(file); await page.waitForTimeout(1200); return; }
  const photoButton = await firstVisible(scope, ["button:has-text('사진')", "button[aria-label*='사진']", "button:has-text('이미지')", "[role='button']:has-text('사진')"]);
  if (!photoButton) throw Object.assign(new Error("네이버 사진 업로드 버튼을 찾지 못했습니다."), { code: "NAVER_IMAGE_BUTTON_NOT_FOUND" });
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 5000 });
  await photoButton.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
  await page.waitForTimeout(1500);
}

async function firstVisibleAcrossScopes(page, preferredScope, selectors) {
  const candidates = [preferredScope, page, ...page.frames()];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const found = await firstVisible(candidate, selectors);
    if (found) return found;
  }
  return null;
}

async function exactButtonAcrossScopes(page, preferredScope, labels, { last = false } = {}) {
  const candidates = [preferredScope, page, ...page.frames()];
  const seen = new Set();
  const pattern = new RegExp(`^(?:${labels.join("|")})$`);
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const buttons = candidate.locator("button").filter({ hasText: pattern });
    const count = Math.min(await buttons.count().catch(() => 0), 20);
    for (let step = 0; step < count; step += 1) {
      const i = last ? count - 1 - step : step;
      const button = buttons.nth(i);
      if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) return button;
    }
  }
  return null;
}

async function clickPublish(page, scope) {
  await dismissEditorPopups(page, scope);
  const openPublish = await exactButtonAcrossScopes(page, scope, ["발행", "발행하기"]);
  if (!openPublish) {
    throw Object.assign(new Error("네이버 실제 발행 button을 찾지 못했습니다."), {
      code: "NAVER_PUBLISH_BUTTON_NOT_FOUND",
    });
  }

  await openPublish.click();
  await page.waitForTimeout(1200);
  await dismissEditorPopups(page, scope);

  const finalButton = await exactButtonAcrossScopes(page, page, ["발행", "발행하기", "확인"], { last: true });
  if (!finalButton) {
    throw Object.assign(new Error("네이버 최종 발행 확인 button을 찾지 못했습니다."), {
      code: "NAVER_FINAL_PUBLISH_BUTTON_NOT_FOUND",
    });
  }
  await finalButton.click();
  await page.waitForTimeout(2500);

  if (/Post(?:Write|Update)Form\.naver/i.test(page.url())) {
    throw Object.assign(new Error("발행 후에도 편집기 화면에 남아 있어 신규 글 발행을 확인하지 못했습니다."), {
      code: "NAVER_PUBLISH_NOT_CONFIRMED",
    });
  }
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const draft = payload.draft;
  const publish = Boolean(payload.publish);
  assertNaverWriteTarget(draft);
  assertNewPost(draft);
  if (publish) {
    createPublishTransactions().verify(payload.transaction);
    if (payload.transaction.channel !== "korea" || payload.transaction.articleId !== draft.id) throw Object.assign(new Error("승인된 글과 네이버 발행 대상이 다릅니다."), { code: "PUBLISH_TRANSACTION_MISMATCH" });
  }
  fs.mkdirSync(profileDir(), { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir(), { executablePath: findBrowserExecutable(), headless: false, viewport: null, args: ["--start-maximized"], permissions: ["clipboard-read", "clipboard-write"] });
  // Edge의 첫 탭은 새 탭 페이지(ntp.msn.com)로 자동 이동하며 그 사이에 goto가 "interrupted by another
  // navigation"으로 끊긴다. 첫 탭은 그대로 두고 항상 새 탭에서 작업하며, 이동 후 실제 주소를 확인해 재시도한다.
  await context.waitForEvent("page", { timeout: 1500 }).catch(() => {});
  const page = await context.newPage();
  const gotoEditor = async (target) => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(600);
        if (/naver\.com/i.test(page.url())) return;
        lastError = new Error(`편집기 이동 결과가 예상과 다릅니다: ${page.url()}`);
      } catch (error) {
        lastError = error;
        if (!/interrupted by another navigation/i.test(String(error?.message))) throw error;
      }
      await page.waitForTimeout(800);
    }
    throw Object.assign(lastError || new Error("편집기 이동 실패"), { code: "NAVER_EDITOR_NAVIGATION_FAILED" });
  };
  let result;
  let publishAttempted = false;
  try {
    // Canonical document uses the reviewed files as-is; no card generation during publishing.
    const editorTarget = naverEditorTarget(draft);
    await gotoEditor(editorTarget);
    await page.waitForTimeout(1200);
    await ensureLoggedIn(page);
    // 네이버 로그인은 블로그 홈으로 돌려보낼 수 있으므로 로그인 완료 후 신규 글쓰기 주소를 다시 연다.
    if (!/PostWriteForm\.naver/i.test(page.url())) {
      await gotoEditor(editorTarget);
      await page.waitForTimeout(1200);
      await ensureLoggedIn(page);
    }
    await dismissEditorPopups(page, page);
    const scope = await findNaverEditorScope(page);
    await dismissEditorPopups(page, scope);
    await setTitle(scope, draft.title || "");
    const document = payload.document || createKoreaDocument(draft);
    const images = await insertNaverDocument(page, scope, document, {
      uploadImage: (file) => uploadOne(page, scope, file), exists: fs.existsSync,
    });
    const titleText = await scope.locator(".se-documentTitle, .se-title-text, textarea[name='title'], input[name='title']").first().evaluate((element) => element.value ?? element.innerText ?? element.textContent);
    if (String(titleText || "").trim() !== draft.title.trim()) throw Object.assign(new Error("네이버 편집기의 제목이 미리보기와 다릅니다."), { code: "NAVER_TITLE_MISMATCH" });
    if (publish) {
      createPublishTransactions().verify(payload.transaction);
      const current = (readJson("korea-drafts.json").items || []).find((item) => item.id === draft.id);
      const checked = current ? checkUserApproval("korea", current) : { issues: ["발행할 초안을 찾지 못했습니다."] };
      if (checked.issues.length) throw Object.assign(new Error(checked.issues[0]), { code: "APPROVAL_CHANGED" });
    }
    if (!publish) result = { status: "staged", keepOpen: true, editorUrl: page.url(), imageUpload: images, message: "네이버 편집기에 자동 반영했습니다. 발행은 승인 전이라 실행하지 않았습니다." };
    else { publishAttempted = true; await clickPublish(page, scope); result = { status: "published", editorUrl: page.url(), publishedUrl: page.url(), imageUpload: images, message: "네이버 발행 동작을 완료했습니다." }; }
  } catch (error) {
    // Leave the failed editor visible for diagnosis; never click Publish here.
    const keepOpen = true;
    result = {
      status: error?.code === "NAVER_LOGIN_REQUIRED" ? "login_required" : "error",
      errorCode: error?.code || "NAVER_AUTOMATION_FAILED",
      message: error?.message || String(error),
      editorUrl: page.url(),
      keepOpen,
      publishAttempted,
    };
    if (!keepOpen) await context.close().catch(() => {});
  }
  fs.writeFileSync(outputPath, JSON.stringify(result), "utf8");
  if (!result.keepOpen) await context.close().catch(() => {});
}

main().catch((error) => {
  const outputPath = process.argv[3];
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify({ status: "error", errorCode: error?.code || "NAVER_WORKER_FAILED", message: error?.message || String(error) }), "utf8");
  process.exitCode = 1;
});
