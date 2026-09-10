import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { naverEditorTarget } from "../lib/atlas/korea-product-pipeline.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const GENERATED_PREFIX = "atlas-generated://";

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

function safeName(value) {
  return String(value || "asset").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function assetCopy(image) {
  const role = String(image.role || "");
  if (role === "body_usage") return {
    kicker: "멀티탭 사용 공간 체크",
    title: "공간마다 필요한 멀티탭이 다릅니다",
    columns: [["TV 주변", "대기전력 기기 수와 콘센트 간격 확인"], ["책상", "충전기·모니터 어댑터 간섭 확인"], ["충전 공간", "USB보다 정격 용량과 안전 인증 우선"]],
    footer: "사용 기기 수보다 정격 용량과 배치가 먼저입니다.",
  };
  if (role === "body_switch_compare") return {
    kicker: "스위치 방식 비교",
    title: "개별 스위치형 vs 통합 스위치형",
    columns: [["개별 스위치", "기기별 전원을 끄기 편함"], ["통합 스위치", "한 번에 전체 전원을 관리"], ["선택 기준", "자주 끄는 기기 수와 사용 습관"]],
    footer: "편의성보다 실제 사용 패턴에 맞는 방식이 오래 갑니다.",
  };
  if (role === "body_safety") return {
    kicker: "멀티탭 안전 점검",
    title: "이 네 가지는 꼭 확인하세요",
    columns: [["발열", "플러그와 본체가 뜨겁지 않은지"], ["먼지", "콘센트 주변 먼지와 이물질 제거"], ["습기", "물기 많은 장소와 젖은 손 피하기"], ["고출력 가전", "히터·전열기구 문어발 연결 금지"]],
    footer: "이상 발열·변색·탄 냄새가 있으면 즉시 사용을 중단하세요.",
  };
  if (role === "product_reasons") return {
    kicker: "수호의 제품 추천",
    title: image.alt || "이 제품을 추천하는 이유",
    columns: [["사용성", "매일 편하게 쓸 수 있는지"], ["기본기", "핵심 기능이 충실한지"], ["선택", "가격과 옵션이 내게 맞는지"]],
    footer: "좋은 제품은 필요한 기능을 쉽고 편하게 해줍니다.",
  };
  if (role === "product_fit") return {
    kicker: "이런 분께 추천합니다",
    title: image.alt || "나에게 잘 맞는 제품인지 확인하세요",
    columns: [["간편함", "복잡한 설정보다 쉬운 사용을 원하는 분"], ["실용성", "자주 쓰는 기능을 중요하게 보는 분"], ["합리적 선택", "필요한 만큼 제대로 사고 싶은 분"]],
    footer: "사용 목적이 분명하면 제품 선택도 쉬워집니다.",
  };
  if (role === "product_check") return {
    kicker: "구매 전 마지막 확인",
    title: image.alt || "결제 전에 이것만 확인하세요",
    columns: [["모델명", "원하는 옵션과 정확히 같은지"], ["가격", "쿠폰과 배송비를 포함한 금액인지"], ["배송", "도착 예정일과 반품 조건은 어떤지"]],
    footer: "판매 페이지의 최신 정보가 최종 기준입니다.",
  };
  return {
    kicker: "ATLAS 생활비연구소",
    title: image.alt || "구매 전 체크 포인트",
    columns: [["확인", image.placement || "본문 내용과 함께 확인하세요."]],
    footer: "실제 제품 사양과 사용 환경을 함께 확인하세요.",
  };
}

function characterDataUri(character) {
  const file = character === "miji" ? "ATLAS-MIJI-MASTER.png" : "ATLAS-SUO-MASTER.png";
  const source = path.join(process.cwd(), "public", "atlas", "characters", file);
  return fs.existsSync(source) ? `data:image/png;base64,${fs.readFileSync(source).toString("base64")}` : "";
}

async function renderGeneratedAssets(context, draft) {
  const images = Array.isArray(draft.images) ? draft.images : [];
  const generated = images.filter((img) => String(img.src || "").startsWith(GENERATED_PREFIX));
  if (!generated.length) return draft;
  const dir = path.join(process.cwd(), ".atlas-data", "korea-assets", safeName(draft.id));
  fs.mkdirSync(dir, { recursive: true });
  const renderPage = await context.newPage();
  await renderPage.setViewportSize({ width: 1200, height: 800 });
  const characterImage = characterDataUri(draft.character);
  for (const image of generated) {
    const copy = assetCopy(image);
    const showCharacter = characterImage && String(image.role || "") === "product_reasons";
    const columns = copy.columns.map(([head, body]) => `<div class="box"><div class="head">${escapeHtml(head)}</div><div class="body">${escapeHtml(body)}</div></div>`).join("");
    const character = showCharacter ? `<img class="character" src="${characterImage}" alt="${draft.character === "miji" ? "미지" : "수호"}">` : "";
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f4f4f5;font-family:"Malgun Gothic","Apple SD Gothic Neo",Arial,sans-serif;color:#18181b}.card{position:relative;overflow:hidden;width:1200px;height:800px;padding:72px;background:linear-gradient(145deg,#fff,#f4f4f5);display:flex;flex-direction:column;justify-content:space-between}.kicker{font-size:26px;font-weight:700;color:#52525b}.title{font-size:58px;line-height:1.18;font-weight:900;letter-spacing:-2px;max-width:${showCharacter ? "780px" : "1000px"};margin-top:18px}.grid{position:relative;z-index:2;display:grid;grid-template-columns:repeat(${Math.min(copy.columns.length,4)},1fr);gap:18px;margin-top:44px;max-width:${showCharacter ? "820px" : "none"}.box{border:2px solid #d4d4d8;border-radius:24px;background:rgba(255,255,255,.94);padding:28px;min-height:190px}.head{font-size:30px;font-weight:900}.body{font-size:23px;line-height:1.55;margin-top:16px;color:#52525b}.footer{position:relative;z-index:2;border-top:2px solid #e4e4e7;padding-top:24px;font-size:26px;font-weight:700;color:#3f3f46}.character{position:absolute;right:-15px;bottom:-150px;width:390px;z-index:1}</style></head><body><div class="card">${character}<div><div class="kicker">${escapeHtml(copy.kicker)}</div><div class="title">${escapeHtml(copy.title)}</div><div class="grid">${columns}</div></div><div class="footer">${escapeHtml(copy.footer)}</div></div></body></html>`;
    await renderPage.setContent(html, { waitUntil: "load" });
    const output = path.join(dir, `${safeName(image.id || image.role)}.png`);
    await renderPage.locator(".card").screenshot({ path: output, type: "png" });
    image.src = output;
    image.generatedLocalPath = output;
  }
  await renderPage.close();
  return draft;
}

async function firstVisible(scope, selectors) {
  for (const selector of selectors) {
    const locator = scope.locator(selector).first();
    try { if (await locator.count() && await locator.isVisible({ timeout: 600 })) return locator; } catch {}
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
  const loginVisible = /nidlogin\.login\.naver\.com|nid\.naver\.com/i.test(url) || await page.locator("input#id, input[name='id']").count().catch(() => 0);
  if (loginVisible) throw Object.assign(new Error("네이버 로그인 1회가 필요합니다. 열린 Edge에서 로그인한 뒤 같은 작업을 다시 실행하세요."), { code: "NAVER_LOGIN_REQUIRED" });
}

async function replaceText(locator, text) {
  await locator.click();
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  try { await locator.fill(text); } catch { await locator.press("Backspace"); await locator.type(text, { delay: 1 }); }
}

async function setTitle(scope, title) {
  const el = await firstVisible(scope, [".se-documentTitle .se-text-paragraph", ".se-documentTitle [contenteditable='true']", "textarea[name='title']", "input[name='title']", "[data-placeholder*='제목'][contenteditable='true']"]);
  if (!el) throw Object.assign(new Error("네이버 제목 입력 영역을 찾지 못했습니다."), { code: "NAVER_TITLE_EDITOR_NOT_FOUND" });
  await replaceText(el, title);
}

async function setBody(scope, draft) {
  const el = await firstVisible(scope, [".se-component-content [contenteditable='true']", ".se-section-text .se-text-paragraph", ".se-main-container [contenteditable='true']", "[contenteditable='true'][data-placeholder*='내용']"]);
  if (!el) throw Object.assign(new Error("네이버 본문 입력 영역을 찾지 못했습니다."), { code: "NAVER_BODY_EDITOR_NOT_FOUND" });
  if (draft.contentType === "existing_post_update" && draft.updateMode === "images_only") return el;
  const text = [draft.affiliateUrl ? draft.affiliateDisclosure : "", draft.bodyText || "", draft.affiliateUrl ? `제품 확인하기: ${draft.affiliateUrl}` : ""].filter(Boolean).join("\n\n");
  await replaceText(el, text);
  return el;
}

function usableImages(draft) {
  return (draft.images || []).filter((img) => { const src = String(img.src || "").trim(); return src && !/^https?:\/\//i.test(src) && fs.existsSync(src); });
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

async function findAnchor(scope, keywords = []) {
  const cleaned = keywords.map((v) => String(v || "").trim()).filter(Boolean);
  if (!cleaned.length) return null;
  const blocks = scope.locator(".se-text-paragraph, .se-component-content p, [contenteditable='true'] p");
  const count = Math.min(await blocks.count().catch(() => 0), 300);
  let best = null; let bestScore = 0;
  for (let i = 0; i < count; i += 1) {
    const block = blocks.nth(i);
    const text = String(await block.innerText().catch(() => ""));
    const score = cleaned.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = block; }
  }
  return best;
}

async function moveCursorAfter(locator) {
  if (!locator) return false;
  try { await locator.click(); await locator.press("End"); await locator.press("Enter"); return true; } catch { return false; }
}

async function uploadImages(page, scope, draft) {
  const images = usableImages(draft);
  if (!images.length) return { uploaded: 0, requested: (draft.images || []).length, placements: [] };
  const placements = [];
  for (const image of images) {
    const anchor = await findAnchor(scope, image.anchorKeywords || []);
    const matched = await moveCursorAfter(anchor);
    if (!matched) {
      const body = await firstVisible(scope, [".se-main-container [contenteditable='true']", ".se-section-text .se-text-paragraph", "[contenteditable='true']"]);
      if (body) { await body.click(); await body.press("End").catch(() => {}); await body.press("Enter").catch(() => {}); }
    }
    await uploadOne(page, scope, image.src);
    placements.push({ id: image.id || image.role, matched, keywords: image.anchorKeywords || [] });
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
    await renderGeneratedAssets(context, draft);
    await page.goto(naverEditorTarget(draft), { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1200);
    await ensureLoggedIn(page);
    const scope = await editorScope(page);
    if (draft.contentType !== "existing_post_update" || draft.updateMode !== "images_only") await setTitle(scope, draft.title || "");
    await setBody(scope, draft);
    const images = await uploadImages(page, scope, draft);
    if (!publish) result = { status: "staged", editorUrl: page.url(), imageUpload: images, message: "네이버 편집기에 자동 반영했습니다. 발행은 승인 전이라 실행하지 않았습니다." };
    else { await clickPublish(page, scope); result = { status: "published", editorUrl: page.url(), publishedUrl: page.url(), imageUpload: images, message: "네이버 발행 동작을 완료했습니다." }; }
  } catch (error) {
    if (error?.code === "NAVER_LOGIN_REQUIRED") result = { status: "login_required", errorCode: error.code, message: error.message, editorUrl: page.url(), keepOpen: true };
    else { result = { status: "error", errorCode: error?.code || "NAVER_AUTOMATION_FAILED", message: error?.message || String(error) }; await context.close().catch(() => {}); }
  }
  fs.writeFileSync(outputPath, JSON.stringify(result), "utf8");
  if (result.status !== "login_required") await context.close().catch(() => {});
}

main().catch((error) => {
  const outputPath = process.argv[3];
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify({ status: "error", errorCode: error?.code || "NAVER_WORKER_FAILED", message: error?.message || String(error) }), "utf8");
  process.exitCode = 1;
});
