// 네이버 공개 글 비공개 전환 worker — 기존 네이버 Edge 자동화(naver-browser-worker)와 같은 로그인 프로필·
// 같은 보호 글 차단(assertNaverWriteTarget)을 쓴다. 본문·제목·이미지는 건드리지 않고, 기존 글 편집기의
// 발행 설정에서 공개 범위만 "비공개"로 바꿔 저장한다. 삭제·신규 발행 없음.
//
//   node scripts/naver-visibility-worker.mjs inspect <logNo...>   발행 설정 창만 열어 항목을 읽고 저장 없이 닫는다
//   node scripts/naver-visibility-worker.mjs private <logNo...>   비공개로 저장한 뒤 익명 접근으로 비공개 여부를 확인한다
// 로그인 대기 시간은 ATLAS_NAVER_LOGIN_WAIT_MIN(기본 5분).
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { assertNaverWriteTarget } from "../lib/atlas/character-channel-policy.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const BLOG_ID = "who-ami";
const mode = process.argv[2];
const shotDir = path.join(process.cwd(), ".atlas-data", "naver-visibility");

function findBrowserExecutable() {
  const explicit = String(process.env.ATLAS_NAVER_BROWSER_PATH || "").trim();
  if (explicit && fs.existsSync(explicit)) return explicit;
  const found = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((p) => fs.existsSync(p));
  if (!found) throw new Error("Microsoft Edge 실행 파일을 찾지 못했습니다.");
  return found;
}

function profileDir() {
  return String(process.env.ATLAS_NAVER_PROFILE_DIR || "").trim() || path.join(os.homedir(), ".atlas", "naver-profile");
}

// 익명(로그인 없는) 요청으로 본문이 보이는지. 비공개 글은 본문 컨테이너가 내려오지 않는다.
export async function publicBodyVisible(no) {
  const html = await (await fetch(`https://blog.naver.com/PostView.naver?blogId=${BLOG_ID}&logNo=${no}`)).text();
  return /se-main-container|postViewArea/.test(html);
}

// 캡처는 기록용이라 실패해도 진행을 막지 않는다(최대화 창에서 폰트 대기로 멈추는 경우가 있다).
async function snap(page, file) {
  await page.screenshot({ path: file, timeout: 8000, animations: "disabled", caret: "initial" }).catch(() => {});
}

async function frames(page) {
  return [page, ...page.frames()];
}

async function visibleButton(page, labels) {
  const pattern = new RegExp(`^\\s*(?:${labels.join("|")})\\s*$`);
  for (const scope of await frames(page)) {
    const buttons = scope.locator("button").filter({ hasText: pattern });
    const count = Math.min(await buttons.count().catch(() => 0), 20);
    for (let i = count - 1; i >= 0; i -= 1) {
      const b = buttons.nth(i);
      if (await b.isVisible().catch(() => false)) return b;
    }
  }
  return null;
}

// 발행 설정 창 안의 공개 범위 선택지(라벨 텍스트 기준).
async function visibilityOption(page, label) {
  for (const scope of await frames(page)) {
    const labels = scope.locator("label").filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) });
    const count = Math.min(await labels.count().catch(() => 0), 10);
    for (let i = 0; i < count; i += 1) {
      const l = labels.nth(i);
      if (await l.isVisible().catch(() => false)) return l;
    }
  }
  return null;
}

async function dismissPopups(page) {
  // 작성 중이던 글 복구 안내는 "취소"(복구 안 함)로 닫는다. 기존 글 본문을 그대로 두기 위해서다.
  for (const scope of await frames(page)) {
    for (const sel of ["button.se-popup-button-cancel", "button.se-help-panel-close-button"]) {
      const b = scope.locator(sel).first();
      if (await b.isVisible().catch(() => false)) {
        await b.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  }
}

async function processOne(page, logNo) {
  const result = { mode, logNo, publicBeforeVisible: await publicBodyVisible(logNo) };
  try {
    await page.goto(`https://blog.naver.com/PostUpdateForm.naver?blogId=${BLOG_ID}&logNo=${logNo}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    // 기존 자동화와 같이, 로그인 화면이면 열린 Edge에서 사용자가 로그인할 때까지 기다린 뒤(기본 5분, ATLAS_NAVER_LOGIN_WAIT_MIN) 편집기를 다시 연다.
    // 로그인 판정은 "로그인 입력창이 보이는가"로 한다. 로그인 직후 네이버ID 내 정보 페이지(nid.naver.com)로
    // 이동하는 경우가 있어 주소만 보면 로그인이 끝났는데도 계속 기다린다.
    const onLoginForm = async () => /nidlogin/i.test(page.url())
      || (/nid\.naver\.com/i.test(page.url()) && (await page.locator("input#id, input[name='id'], input#pw").count().catch(() => 0)) > 0);
    if (await onLoginForm()) {
      if (process.env.ATLAS_NAVER_NO_LOGIN_WAIT === "1" || process.env.ATLAS_NAVER_CDP) throw Object.assign(new Error("자동화 프로필에 네이버 로그인이 없습니다."), { code: "NAVER_LOGIN_REQUIRED" });
      console.log("네이버 로그인을 기다립니다. 열린 Edge 창에서 로그인해 주세요.");
      // ATLAS_NAVER_LOGIN_WAIT_MIN=0 이면 시간 제한 없이 로그인이 끝날 때까지 기다린다.
      const waitMin = Number(process.env.ATLAS_NAVER_LOGIN_WAIT_MIN ?? 5);
      const deadline = waitMin > 0 ? Date.now() + waitMin * 60 * 1000 : Infinity;
      while ((await onLoginForm()) && Date.now() < deadline) await page.waitForTimeout(1000);
      if (await onLoginForm()) throw Object.assign(new Error("제한 시간 안에 네이버 로그인이 완료되지 않았습니다."), { code: "NAVER_LOGIN_REQUIRED" });
      await page.goto(`https://blog.naver.com/PostUpdateForm.naver?blogId=${BLOG_ID}&logNo=${logNo}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(4000);
    }
    // 편집기 본문이 실제로 뜰 때까지 기다린다(로딩 중에 발행을 누르면 설정 창이 열리지 않는다).
    const ready = Date.now() + 45000;
    let editorReady = false;
    while (!editorReady && Date.now() < ready) {
      for (const scope of await frames(page)) {
        if (await scope.locator(".se-documentTitle, .se-component-content").first().isVisible().catch(() => false)) editorReady = true;
      }
      if (!editorReady) await page.waitForTimeout(1000);
    }
    if (!editorReady) throw new Error("편집기가 45초 안에 열리지 않았습니다.");
    await page.waitForTimeout(1500);
    await dismissPopups(page);

    const open = await visibleButton(page, ["발행"]);
    if (!open) throw new Error("편집기의 발행 버튼을 찾지 못했습니다.");
    await open.click();
    await page.waitForTimeout(1500);
    await snap(page, path.join(shotDir, `${logNo}-${mode}-panel.png`));

    const labels = [];
    for (const scope of await frames(page)) {
      const all = scope.locator("label");
      const n = Math.min(await all.count().catch(() => 0), 60);
      for (let i = 0; i < n; i += 1) {
        const l = all.nth(i);
        if (await l.isVisible().catch(() => false)) labels.push((await l.innerText().catch(() => "")).trim());
      }
    }
    result.panelLabels = labels.filter(Boolean);
    // 공개 설정 라디오(라벨이 없을 수도 있어 input 기준으로도 모은다).
    const radios = [];
    for (const scope of await frames(page)) {
      const all = scope.locator("input[type='radio']");
      const n = Math.min(await all.count().catch(() => 0), 40);
      for (let i = 0; i < n; i += 1) {
        const r = all.nth(i);
        radios.push({ id: await r.getAttribute("id").catch(() => ""), name: await r.getAttribute("name").catch(() => ""), value: await r.getAttribute("value").catch(() => ""), checked: await r.isChecked().catch(() => false) });
      }
    }
    result.panelRadios = radios;

    const privateOption = await visibilityOption(page, "비공개");
    result.privateOptionFound = Boolean(privateOption);

    if (mode === "inspect") {
      result.status = "inspected";
      return result;
    }
    if (!privateOption) throw new Error("발행 설정에서 '비공개' 선택지를 찾지 못했습니다.");

    // 설정 창이 DOM에 두 벌 있다. id="open_private" 도 두 개라 label[for] 는 문서상 첫 번째(보이지 않을 수
    // 있는) 라디오를 가리킨다. 그래서 선택·확인·저장 버튼을 모두 "화면에 실제로 보이는 설정 창" 안에서만 다룬다.
    let panel = null;
    for (const scope of await frames(page)) {
      const radios = await scope.$$('[id="open_private"]');
      for (const r of radios) {
        const root = await r.evaluateHandle((el) => {
          const visible = (n) => n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== "hidden";
          // 공개 설정 라디오와 "발행" 버튼을 함께 품은 가장 가까운 조상 = 설정 창
          for (let node = el.parentElement; node; node = node.parentElement) {
            const hasPublish = [...node.querySelectorAll("button")].some((b) => b.innerText.trim() === "발행" && visible(b));
            if (hasPublish) return visible(node) ? node : null;
          }
          return null;
        });
        if (root.asElement()) {
          panel = { radio: r, root: root.asElement() };
          break;
        }
      }
      if (panel) break;
    }
    if (!panel) throw new Error("화면에 보이는 발행 설정 창을 찾지 못했습니다.");

    // 보이는 설정 창 안의 "비공개" 라벨을 누른다.
    const privateLabel = await panel.radio.evaluateHandle((el) => {
      const box = el.closest("li, span, div") || el.parentElement;
      return box.querySelector("label") || null;
    });
    if (privateLabel.asElement()) await privateLabel.asElement().click();
    else await panel.radio.evaluate((el) => el.click());
    await page.waitForTimeout(700);

    // 저장 전 확인: 보이는 설정 창에서 비공개가 선택됐고, "이 설정을 기본값으로 유지"가 꺼져 있어야 한다
    // (켜져 있으면 앞으로 쓰는 글까지 비공개가 기본값이 된다). 확인하지 못하면 저장하지 않는다.
    const checked = await panel.radio.evaluate((el) => el.checked).catch(() => false);
    const keepDefault = await panel.root.evaluate((root) => {
      const label = [...root.querySelectorAll("label")].find((l) => l.innerText.trim() === "이 설정을 기본값으로 유지");
      if (!label) return null;
      const input = label.control || label.parentElement?.querySelector("input[type='checkbox']");
      return input ? input.checked : null;
    }).catch(() => null);
    const confirmHandle = await panel.root.evaluateHandle((root) => {
      const visible = (n) => n && n.getClientRects().length > 0;
      return [...root.querySelectorAll("button")].find((b) => b.innerText.trim() === "발행" && visible(b)) || null;
    });
    const confirm = confirmHandle.asElement();

    result.privateChecked = checked;
    result.keepDefaultChecked = keepDefault;
    await snap(page, path.join(shotDir, `${logNo}-private-selected.png`));
    if (!checked) throw new Error("비공개 선택이 확인되지 않아 저장하지 않았습니다.");
    if (keepDefault !== false) throw new Error("'이 설정을 기본값으로 유지'가 꺼져 있는지 확인하지 못해 저장하지 않았습니다.");
    if (!confirm) throw new Error("발행 설정 창 안의 최종 버튼을 찾지 못했습니다.");
    const dialogs = [];
    page.on("dialog", async (d) => {
      dialogs.push(d.message());
      await d.dismiss().catch(() => {}); // 예상하지 못한 확인창은 수락하지 않는다
    });
    await confirm.click();
    // 저장되면 편집기를 벗어난다. 20초 안에 벗어나지 않으면 화면을 남긴다.
    for (let i = 0; i < 20 && /Post(?:Update|Write)Form/i.test(page.url()); i += 1) await page.waitForTimeout(1000);
    result.dialogs = dialogs;
    await snap(page, path.join(shotDir, `${logNo}-after-click.png`));
    // 저장 반영을 기다린 뒤 익명 접근으로 확인한다(최대 30초).
    for (let i = 0; i < 6 && (await publicBodyVisible(logNo)); i += 1) await page.waitForTimeout(5000);
    result.afterUrl = page.url();
    result.publicAfterVisible = await publicBodyVisible(logNo);
    result.status = result.publicAfterVisible ? "not_confirmed" : "private_confirmed";
  } catch (error) {
    result.status = "error";
    result.errorCode = error?.code || "NAVER_VISIBILITY_FAILED";
    result.message = String(error?.message || error);
    await snap(page, path.join(shotDir, `${logNo}-${mode}-error.png`));
  }
  return result;
}

// 로그인은 창을 닫으면 풀리므로, 한 번 로그인한 같은 창에서 여러 글을 차례로 처리한다.
async function main() {
  const logNos = process.argv.slice(3);
  if (!["inspect", "private"].includes(mode) || !logNos.length || logNos.some((n) => !/^\d{9,}$/.test(n))) {
    throw new Error("사용법: naver-visibility-worker.mjs <inspect|private> <logNo> [logNo...]");
  }
  // 보호 글(224407589323 등)은 창을 열기 전에 막힌다.
  for (const logNo of logNos) assertNaverWriteTarget({ blogId: BLOG_ID, logNo, contentType: "existing_post_update" });
  fs.mkdirSync(shotDir, { recursive: true });
  // ATLAS_NAVER_CDP 가 있으면 naver-session-keeper.mjs 가 붙잡고 있는 창(같은 로그인 세션)의 탭을 그대로 쓴다.
  // 이 경우 창은 절대 닫지 않고 연결만 끊는다. 실패해도 창·로그인이 남아 코드를 고쳐 다시 실행할 수 있다.
  const cdp = String(process.env.ATLAS_NAVER_CDP || "").trim();
  const browser = cdp ? await chromium.connectOverCDP(cdp) : null;
  const context = browser
    ? browser.contexts()[0]
    : await chromium.launchPersistentContext(profileDir(), {
        executablePath: findBrowserExecutable(),
        headless: false,
        viewport: { width: 1600, height: 1000 },
      });
  const page = browser ? context.pages()[0] || (await context.newPage()) : await context.newPage();
  try {
    for (const logNo of logNos) {
      const result = await processOne(page, logNo);
      console.log(JSON.stringify(result));
      if (result.status !== "private_confirmed" && result.status !== "inspected") break; // 하나라도 실패하면 멈춘다
    }
  } finally {
    if (browser) {
      // 세션 유지 창에 붙은 경우: 창을 닫지 않고 프로세스만 끝낸다.
      process.exit(process.exitCode || 0);
    }
    // ATLAS_NAVER_KEEP_OPEN=1 이면 성공·실패와 관계없이 창과 프로필을 닫지 않는다(로그인 세션 유지).
    if (process.env.ATLAS_NAVER_KEEP_OPEN === "1") {
      console.log(JSON.stringify({ status: "window_kept_open" }));
      await new Promise(() => {});
    }
    await context.close().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({ status: "error", message: String(error?.message || error) }));
  process.exitCode = 1;
});
