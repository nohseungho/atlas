import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { naverEditorTarget } from "../lib/atlas/korea-product-pipeline.js";
import { assertNaverWriteTarget, getCharacterDefinition } from "../lib/atlas/character-channel-policy.js";
import { bodyHtmlFromDraft, bodyPlainTextFromDraft, caretToEndOfElement, escapeHtml, pickAnchorParagraphIndex, usableImages as filterUsableImages } from "../lib/atlas/naver-image-placement.js";

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

function assetCopy(image) {
  const role = String(image.role || "");
  // 초안이 슬롯별 카드 문구(image.card)를 직접 들고 있으면 그것을 우선한다. 역할 기본 문구는
  // 멀티탭 글 기준이라 다른 제품 초안에서는 맞지 않는다.
  const own = image.card && typeof image.card === "object" ? image.card : null;
  if (own && String(own.title || "").trim() && Array.isArray(own.columns) && own.columns.length) {
    return {
      kicker: String(own.kicker || "ATLAS 생활비연구소"),
      title: String(own.title),
      columns: own.columns.filter((c) => Array.isArray(c) && c.length === 2).slice(0, 4).map(([h, b]) => [String(h), String(b)]),
      footer: String(own.footer || "실제 제품 사양과 사용 환경을 함께 확인하세요."),
    };
  }
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
  const definition = getCharacterDefinition(character);
  const file = definition.masterFileName;
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
    const showCharacter = Boolean(characterImage);
    const columns = copy.columns.map(([head, body]) => `<div class="box"><div class="head">${escapeHtml(head)}</div><div class="body">${escapeHtml(body)}</div></div>`).join("");
    const character = showCharacter ? `<img class="character" src="${characterImage}" alt="${draft.character === "miji" ? "미지" : "수호"}">` : "";
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f4f4f5;font-family:"Malgun Gothic","Apple SD Gothic Neo",Arial,sans-serif;color:#18181b}.card{position:relative;overflow:hidden;width:1200px;height:800px;padding:72px;background:linear-gradient(145deg,#fff,#f4f4f5);display:flex;flex-direction:column;justify-content:space-between}.kicker{position:relative;z-index:2;font-size:26px;font-weight:700;color:#52525b}.title{position:relative;z-index:2;font-size:58px;line-height:1.18;font-weight:900;letter-spacing:-2px;max-width:${showCharacter ? "780px" : "1000px"};margin-top:18px}.grid{position:relative;z-index:2;display:grid;grid-template-columns:repeat(${Math.min(copy.columns.length,4)},1fr);gap:18px;margin-top:44px;max-width:${showCharacter ? "820px" : "none"}}.box{border:2px solid #d4d4d8;border-radius:24px;background:rgba(255,255,255,.94);padding:28px;min-height:190px}.head{font-size:30px;font-weight:900}.body{font-size:23px;line-height:1.55;margin-top:16px;color:#52525b}.footer{position:relative;z-index:2;border-top:2px solid #e4e4e7;padding-top:24px;font-size:26px;font-weight:700;color:#3f3f46;max-width:${showCharacter ? "760px" : "none"}}.character{position:absolute;right:-15px;bottom:-150px;width:390px;height:auto;z-index:1;pointer-events:none;-webkit-mask-image:linear-gradient(to right,transparent 0,#000 22%),linear-gradient(to bottom,transparent 0,#000 18%);-webkit-mask-composite:source-in;mask-image:linear-gradient(to right,transparent 0,#000 22%),linear-gradient(to bottom,transparent 0,#000 18%);mask-composite:intersect}</style></head><body><div class="card">${character}<div><div class="kicker">${escapeHtml(copy.kicker)}</div><div class="title">${escapeHtml(copy.title)}</div><div class="grid">${columns}</div></div><div class="footer">${escapeHtml(copy.footer)}</div></div></body></html>`;
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
  // 에디터가 iframe(#mainFrame) 안에서 늦게 뜨는 경우가 있어 제목 영역 기준으로 먼저 기다린다.
  const deadline = Date.now() + 20000;
  const probes = [".se-documentTitle", ".se-title-text", ".se-component-content", "[contenteditable='true']", "textarea[name='title']"];
  while (Date.now() < deadline) {
    const scopes = [page, ...page.frames()];
    for (const probe of probes) {
      for (const scope of scopes) {
        try { if (await scope.locator(probe).count()) return scope; } catch {}
      }
    }
    await page.waitForTimeout(500);
  }
  return page;
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

async function setBody(page, scope, draft) {
  const el = await firstVisible(scope, [".se-component-content [contenteditable='true']", ".se-section-text .se-text-paragraph", ".se-main-container [contenteditable='true']", "[contenteditable='true'][data-placeholder*='내용']"]);
  if (!el) throw Object.assign(new Error("네이버 본문 입력 영역을 찾지 못했습니다."), { code: "NAVER_BODY_EDITOR_NOT_FOUND" });
  if (draft.contentType === "existing_post_update" && draft.updateMode === "images_only") return el;
  const text = bodyPlainTextFromDraft(draft);
  const html = bodyHtmlFromDraft(draft);
  const pasted = await pasteHtml(page, el, html, text);
  if (!pasted) await replaceText(el, text);
  return el;
}

async function pasteHtml(page, locator, html, text) {
  const probe = String(text || "").split("\n").map((l) => l.trim()).find((l) => l.length > 12) || "";
  const hasProbe = async () => probe && (await locator.evaluate((el) => el.closest(".se-main-container, .se-component-content, body")?.innerText || "").catch(() => "")).includes(probe);
  await locator.click();
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await locator.press("Backspace").catch(() => {});
  await locator.evaluate((el, payload) => {
    const dt = new DataTransfer();
    dt.setData("text/html", payload.html);
    dt.setData("text/plain", payload.text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { html, text }).catch(() => {});
  await page.waitForTimeout(1500);
  if (await hasProbe()) return true;
  try {
    await page.evaluate(async (payload) => {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([payload.html], { type: "text/html" }), "text/plain": new Blob([payload.text], { type: "text/plain" }) })]);
    }, { html, text });
    await locator.click();
    await locator.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
    await page.waitForTimeout(1500);
    if (await hasProbe()) return true;
  } catch {}
  return false;
}

function usableImages(draft) {
  return filterUsableImages(draft.images || [], (src) => fs.existsSync(src));
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

const PARAGRAPH_SELECTOR = ".se-text-paragraph, .se-component-content p, [contenteditable='true'] p";

async function editorParagraphs(scope) {
  const blocks = scope.locator(PARAGRAPH_SELECTOR);
  const count = Math.min(await blocks.count().catch(() => 0), 300);
  const texts = [];
  for (let i = 0; i < count; i += 1) texts.push(String(await blocks.nth(i).innerText().catch(() => "")));
  return { blocks, texts };
}

// anchorKeywords를 포함하는 "문단 전체"를 찾는다. 키워드 문자열은 자르거나 바꾸지 않는다.
async function findAnchor(scope, keywords = []) {
  const { blocks, texts } = await editorParagraphs(scope);
  const index = pickAnchorParagraphIndex(texts, keywords);
  return index >= 0 ? blocks.nth(index) : null;
}

// 마지막 문단(안전한 문단 끝). anchor를 못 찾았을 때만 쓴다.
async function lastParagraph(scope) {
  const { blocks, texts } = await editorParagraphs(scope);
  for (let i = texts.length - 1; i >= 0; i -= 1) if (texts[i].trim()) return blocks.nth(i);
  return null;
}

// 문단 끝에 커서를 놓고 새 줄을 연다. 커서가 문단 끝이 아니면 Enter를 누르지 않는다(문장/단어 분할 방지).
async function openLineAfterParagraph(page, locator) {
  if (!locator) return { ok: false, reason: "no_paragraph" };
  const caret = await locator.evaluate(caretToEndOfElement).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
  if (!caret?.ok) return caret || { ok: false, reason: "caret_failed" };
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const after = String(await locator.innerText().catch(() => "")).trim();
  if (after !== caret.text) return { ok: false, reason: "paragraph_changed", before: caret.text, after };
  return { ok: true };
}

async function uploadImages(page, scope, draft) {
  const images = usableImages(draft);
  if (!images.length) return { uploaded: 0, requested: (draft.images || []).length, placements: [] };
  const placements = [];
  let uploaded = 0;
  for (const image of images) {
    const anchor = await findAnchor(scope, image.anchorKeywords || []);
    const matched = Boolean(anchor);
    let opened = await openLineAfterParagraph(page, anchor);
    if (!opened.ok && !matched) opened = await openLineAfterParagraph(page, await lastParagraph(scope));
    if (!opened.ok) {
      // 안전한 삽입 위치를 만들지 못하면 본문을 건드리지 않고 이미지를 건너뛴다.
      placements.push({ id: image.id || image.role, matched, skipped: true, reason: opened.reason, keywords: image.anchorKeywords || [] });
      continue;
    }
    await uploadOne(page, scope, image.src);
    uploaded += 1;
    placements.push({ id: image.id || image.role, matched, skipped: false, keywords: image.anchorKeywords || [] });
  }
  return { uploaded, requested: (draft.images || []).length, placements };
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
  fs.mkdirSync(profileDir(), { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir(), { executablePath: findBrowserExecutable(), headless: false, viewport: null, args: ["--start-maximized"], permissions: ["clipboard-read", "clipboard-write"] });
  const page = context.pages()[0] || await context.newPage();
  let result;
  try {
    await renderGeneratedAssets(context, draft);
    const editorTarget = naverEditorTarget(draft);
    await page.goto(editorTarget, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1200);
    await ensureLoggedIn(page);
    // 네이버 로그인은 블로그 홈으로 돌려보낼 수 있으므로 로그인 완료 후 신규 글쓰기 주소를 다시 연다.
    if (!/PostWriteForm\.naver/i.test(page.url())) {
      await page.goto(editorTarget, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1200);
      await ensureLoggedIn(page);
    }
    const scope = await editorScope(page);
    await dismissEditorPopups(page, scope);
    if (draft.contentType !== "existing_post_update" || draft.updateMode !== "images_only") await setTitle(scope, draft.title || "");
    await setBody(page, scope, draft);
    const images = await uploadImages(page, scope, draft);
    if (!publish) result = { status: "staged", editorUrl: page.url(), imageUpload: images, message: "네이버 편집기에 자동 반영했습니다. 발행은 승인 전이라 실행하지 않았습니다." };
    else { await clickPublish(page, scope); result = { status: "published", editorUrl: page.url(), publishedUrl: page.url(), imageUpload: images, message: "네이버 발행 동작을 완료했습니다." }; }
  } catch (error) {
    const keepOpen = publish || error?.code === "NAVER_LOGIN_REQUIRED";
    result = {
      status: error?.code === "NAVER_LOGIN_REQUIRED" ? "login_required" : "error",
      errorCode: error?.code || "NAVER_AUTOMATION_FAILED",
      message: error?.message || String(error),
      editorUrl: page.url(),
      keepOpen,
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
