// 네이버 전용 Edge 세션 유지 — 기존 네이버 자동화 프로필(~/.atlas/naver-profile)로 창을 한 번만 열고
// 종료하지 않는다. 작업 스크립트는 로컬 디버깅 포트(127.0.0.1)로 이 창에 붙었다가 떨어지므로,
// 작업이 실패해 코드를 고쳐도 창과 로그인 세션이 그대로 남는다.
//
//   node scripts/naver-session-keeper.mjs            창을 열고 네이버 블로그 관리 화면으로 이동, 계속 대기
//   ATLAS_NAVER_CDP_PORT (기본 9333)
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const PORT = Number(process.env.ATLAS_NAVER_CDP_PORT || 9333);

function findBrowserExecutable() {
  const found = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((p) => fs.existsSync(p));
  if (!found) throw new Error("Microsoft Edge 실행 파일을 찾지 못했습니다.");
  return found;
}

const profile = String(process.env.ATLAS_NAVER_PROFILE_DIR || "").trim() || path.join(os.homedir(), ".atlas", "naver-profile");
const context = await chromium.launchPersistentContext(profile, {
  executablePath: findBrowserExecutable(),
  headless: false,
  viewport: { width: 1600, height: 1000 },
  // 디버깅 포트는 이 PC 안(127.0.0.1)에서만 열린다.
  args: [`--remote-debugging-port=${PORT}`, "--remote-debugging-address=127.0.0.1"],
});
const page = context.pages()[0] || (await context.newPage());
// 로그인이 필요하면 네이버가 로그인 화면으로 보낸다. 창은 사용자가 로그인할 때까지(그리고 그 뒤에도) 유지한다.
await page.goto("https://blog.naver.com/PostUpdateForm.naver?blogId=who-ami&logNo=224420731235", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
console.log(JSON.stringify({ status: "session_open", port: PORT, profile }));
context.on("close", () => {
  console.log(JSON.stringify({ status: "session_closed_by_user" }));
  process.exit(0);
});
await new Promise(() => {});
