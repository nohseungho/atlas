import fs from "fs";
import os from "os";
import path from "path";
import { chromium } from "playwright-core";
import { naverEditorTarget } from "./korea-product-pipeline.js";

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
  if (!found) {
    const err = new Error("Microsoft Edge/Chrome 실행 파일을 찾지 못했습니다.");
    err.code = "NAVER_BROWSER_NOT_FOUND";
    throw err;
  }
  return found;
}

function profileDir() {
  const configured = String(process.env.ATLAS_NAVER_PROFILE_DIR || "").trim();
  if (configured) return configured;
  return path.join(os.homedir(), ".atlas", "naver-profile");
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
  const probes = [".se-documentTitle", ".se-component-content", "[contenteditable='true']", "textarea[name='title']"];
  for (const scope of scopes) {
    for (const probe of probes) {
      try {
        if (await scope.locator(probe).count()) return scope;
      } catch {}
    }
  }
  return page;
}

async function ensureLoggedIn(page) {
  const url = page.url();
  const loginVisible = /nidlogin\.login\.naver\.com|nid\.naver\.com/i.test(url)
    || await page.locator("input#id, input[name='id']").count().catch(() => 0);
  if (!loginVisible) return;
  const err = new Error("네이버 로그인 1회가 필요합니다. 열린 Edge에서 로그인한 뒤 같은 작업을 다시 실행하세요. 로그인 세션은 ATLAS 전용 프로필에 보존됩니다.");
  err.code = "NAVER_LOGIN_REQUIRED";
  throw err;
}

async function replaceText(locator, text) {
  await locator.click();
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  try {
    await locator.fill(text);
  } catch {
    await locator.press("Backspace");
    await locator.type(text, { delay: 1 });
  }
}

async function setTitle(scope, title) {
  const titleEl = await firstVisible(scope, [
    ".se-documentTitle .se-text-paragraph",
    ".se-documentTitle [contenteditable='true']",
    "textarea[name='title']",
    "input[name='title']",
    "[data-placeholder*='제목'][contenteditable='true']",
  ]);
  if (!titleEl) {
    const err = new Error("네이버 제목 입력 영역을 찾지 못했습니다.");
    err.code = "NAVER_TITLE_EDITOR_NOT_FOUND";
    throw err;
  }
  await replaceText(titleEl, title);
}

async function setBody(scope, draft) {
  const bodyEl = await firstVisible(scope, [
    ".se-component-content [contenteditable='true']",
    ".se-section-text .se-text-paragraph",
    ".se-main-container [contenteditable='true']",
    "[contenteditable='true'][data-placeholder*='내용']",
  ]);
  if (!bodyEl) {
    const err = new Error("네이버 본문 입력 영역을 찾지 못했습니다.");
    err.code = "NAVER_BODY_EDITOR_NOT_FOUND";
    throw err;
  }
  if (draft.contentType === "existing_post_update" && draft.updateMode === "images_only") return bodyEl;

  const text = [
    draft.affiliateUrl ? draft.affiliateDisclosure : "",
    draft.bodyText || "",
    draft.affiliateUrl ? `제품 확인하기: ${draft.affiliateUrl}` : "",
  ].filter(Boolean).join("\n\n");
  await replaceText(bodyEl, text);
  return bodyEl;
}

function usableImagePaths(draft) {
  return (draft.images || [])
    .map((img) => String(img.src || "").trim())
    .filter((src) => src && !/^https?:\/\//i.test(src) && fs.existsSync(src));
}

async function uploadImages(page, scope, draft) {
  const files = usableImagePaths(draft);
  if (!files.length) return { uploaded: 0, requested: (draft.images || []).length };

  const directInput = scope.locator("input[type='file']").first();
  if (await directInput.count().catch(() => 0)) {
    await directInput.setInputFiles(files);
    await page.waitForTimeout(1200);
    return { uploaded: files.length, requested: (draft.images || []).length };
  }

  const photoButton = await firstVisible(scope, [
    "button:has-text('사진')",
    "button[aria-label*='사진']",
    "button:has-text('이미지')",
    "[role='button']:has-text('사진')",
  ]);
  if (!photoButton) {
    const err = new Error("네이버 사진 업로드 버튼을 찾지 못했습니다.");
    err.code = "NAVER_IMAGE_BUTTON_NOT_FOUND";
    throw err;
  }
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 5000 });
  await photoButton.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(files);
  await page.waitForTimeout(1500);
  return { uploaded: files.length, requested: (draft.images || []).length };
}

async function clickPublish(page, scope) {
  const openPublish = await firstVisible(scope, [
    "button:has-text('발행')",
    "button[aria-label*='발행']",
    "[role='button']:has-text('발행')",
  ]);
  if (!openPublish) {
    const err = new Error("네이버 발행 버튼을 찾지 못했습니다.");
    err.code = "NAVER_PUBLISH_BUTTON_NOT_FOUND";
    throw err;
  }
  await openPublish.click();
  await page.waitForTimeout(700);
  const finalButton = await firstVisible(page, ["button:has-text('발행')", "button:has-text('확인')", "[role='button']:has-text('발행')"]);
  if (finalButton) await finalButton.click();
  await page.waitForTimeout(1600);
}

export async function runNaverBrowserJob(draft, { publish = false } = {}) {
  fs.mkdirSync(profileDir(), { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir(), {
    executablePath: findBrowserExecutable(),
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });
  const page = context.pages()[0] || await context.newPage();
  try {
    await page.goto(naverEditorTarget(draft), { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1200);
    await ensureLoggedIn(page);
    const scope = await editorScope(page);
    if (draft.contentType !== "existing_post_update" || draft.updateMode !== "images_only") await setTitle(scope, draft.title || "");
    await setBody(scope, draft);
    const images = await uploadImages(page, scope, draft);
    if (!publish) {
      return { status: "staged", editorUrl: page.url(), imageUpload: images, message: "네이버 편집기에 자동 반영했습니다. 발행은 승인 전이라 실행하지 않았습니다." };
    }
    await clickPublish(page, scope);
    return { status: "published", editorUrl: page.url(), publishedUrl: page.url(), imageUpload: images, message: "네이버 발행 동작을 완료했습니다." };
  } catch (error) {
    if (error?.code === "NAVER_LOGIN_REQUIRED") {
      return { status: "login_required", errorCode: error.code, message: error.message, editorUrl: page.url(), keepOpen: true };
    }
    await context.close().catch(() => {});
    throw error;
  }
}
