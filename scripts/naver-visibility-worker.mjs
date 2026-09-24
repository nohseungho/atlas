// 네이버 공개 글 비공개 전환 worker — 기존 네이버 Edge 자동화(naver-browser-worker)와 같은 로그인 프로필·
// 같은 보호 글 차단(assertNaverWriteTarget)을 쓴다. 본문·제목·이미지는 건드리지 않고, 기존 글 편집기의
// 발행 설정에서 공개 범위만 "비공개"로 바꿔 저장한다. 삭제·신규 발행 없음.
//
//   node scripts/naver-visibility-worker.mjs inspect <logNo>   발행 설정 창만 열어 항목을 읽고 저장 없이 닫는다
//   node scripts/naver-visibility-worker.mjs private <logNo>   비공개로 저장한 뒤 익명 접근으로 비공개 여부를 확인한다
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { assertNaverWriteTarget } from "../lib/atlas/character-channel-policy.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const BLOG_ID = "who-ami";
const [, , mode, logNo] = process.argv;
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

async function main() {
  if (!["inspect", "private"].includes(mode) || !/^\d{9,}$/.test(String(logNo || ""))) {
    throw new Error("사용법: naver-visibility-worker.mjs <inspect|private> <logNo>");
  }
  // 보호 글(224407589323 등)은 여기서 막힌다.
  assertNaverWriteTarget({ blogId: BLOG_ID, logNo, contentType: "existing_post_update" });
  fs.mkdirSync(shotDir, { recursive: true });

  const before = await publicBodyVisible(logNo);
  const context = await chromium.launchPersistentContext(profileDir(), {
    executablePath: findBrowserExecutable(),
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });
  const page = await context.newPage();
  const result = { mode, logNo, publicBeforeVisible: before };
  try {
    await page.goto(`https://blog.naver.com/PostUpdateForm.naver?blogId=${BLOG_ID}&logNo=${logNo}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    // 기존 자동화와 같이, 로그인 화면이면 열린 Edge에서 사용자가 로그인할 때까지 기다린 뒤(기본 5분, ATLAS_NAVER_LOGIN_WAIT_MIN) 편집기를 다시 연다.
    if (/nid\.naver\.com|nidlogin/i.test(page.url())) {
      console.log("네이버 로그인을 기다립니다. 열린 Edge 창에서 로그인해 주세요.");
      const deadline = Date.now() + Number(process.env.ATLAS_NAVER_LOGIN_WAIT_MIN || 5) * 60 * 1000;
      while (/nid\.naver\.com|nidlogin/i.test(page.url()) && Date.now() < deadline) await page.waitForTimeout(1000);
      if (/nid\.naver\.com|nidlogin/i.test(page.url())) throw Object.assign(new Error("제한 시간 안에 네이버 로그인이 완료되지 않았습니다."), { code: "NAVER_LOGIN_REQUIRED" });
      await page.goto(`https://blog.naver.com/PostUpdateForm.naver?blogId=${BLOG_ID}&logNo=${logNo}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(4000);
    }
    await dismissPopups(page);

    const open = await visibleButton(page, ["발행"]);
    if (!open) throw new Error("편집기의 발행 버튼을 찾지 못했습니다.");
    await open.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(shotDir, `${logNo}-${mode}-panel.png`) });

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

    const privateOption = await visibilityOption(page, "비공개");
    result.privateOptionFound = Boolean(privateOption);

    if (mode === "inspect") {
      result.status = "inspected";
      return;
    }
    if (!privateOption) throw new Error("발행 설정에서 '비공개' 선택지를 찾지 못했습니다.");
    await privateOption.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(shotDir, `${logNo}-private-selected.png`) });

    const confirm = await visibleButton(page, ["발행", "수정", "확인"]);
    if (!confirm) throw new Error("발행 설정 창의 최종 버튼을 찾지 못했습니다.");
    await confirm.click();
    await page.waitForTimeout(4000);
    result.afterUrl = page.url();
    result.publicAfterVisible = await publicBodyVisible(logNo);
    result.status = result.publicAfterVisible ? "not_confirmed" : "private_confirmed";
  } catch (error) {
    result.status = "error";
    result.errorCode = error?.code || "NAVER_VISIBILITY_FAILED";
    result.message = String(error?.message || error);
    await page.screenshot({ path: path.join(shotDir, `${logNo}-${mode}-error.png`) }).catch(() => {});
  } finally {
    // 점검 모드는 어떤 것도 저장하지 않고 창을 닫는다(설정 창만 열어 본 상태).
    await context.close().catch(() => {});
    console.log(JSON.stringify(result));
  }
}

main().catch((error) => {
  console.log(JSON.stringify({ status: "error", message: String(error?.message || error) }));
  process.exitCode = 1;
});
