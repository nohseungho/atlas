import fs from "fs";
import { createKoreaDocument, documentIssues } from "./article-document.js";
import { assertNewPost, createPublishTransactions } from "./publish-transaction.js";
import { checkUserApproval } from "./operate/publish-approval-store.js";
import { canonicalNaverUrl } from "./korea-product-pipeline.js";
import os from "os";
import path from "path";
import { execFileSync, spawn } from "child_process";

const EDGE_PATHS = process.platform === "win32"
  ? [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ]
  : process.platform === "darwin"
    ? ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
    : ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable", "/usr/bin/google-chrome"];

export function findBrowserExecutable() {
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
  return configured || path.join(os.homedir(), ".atlas", "naver-profile");
}

function playwrightPackagePath() {
  return path.join(process.cwd(), "node_modules", "playwright-core", "package.json");
}

function hasPlaywrightCore() {
  return fs.existsSync(playwrightPackagePath());
}

export function ensurePlaywrightCore() {
  if (hasPlaywrightCore()) return;
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  try {
    execFileSync(npm, [
      "install",
      "--no-save",
      "--package-lock=false",
      "--no-audit",
      "--no-fund",
      "playwright-core@1.55.0",
    ], {
      cwd: process.cwd(),
      stdio: "inherit",
      windowsHide: true,
    });
  } catch (cause) {
    const err = new Error("네이버 자동화용 브라우저 제어 모듈을 자동 설치하지 못했습니다. npm 연결 상태를 확인한 뒤 다시 실행하세요.");
    err.code = "NAVER_PLAYWRIGHT_BOOTSTRAP_FAILED";
    err.cause = cause;
    throw err;
  }
}

export function getNaverAutomationDoctor() {
  let browserPath = "";
  let browserOk = false;
  try {
    browserPath = findBrowserExecutable();
    browserOk = true;
  } catch {}
  return {
    ok: browserOk,
    platform: process.platform,
    node: process.version,
    browserOk,
    browserPath,
    profileDir: profileDir(),
    playwrightCoreInstalled: hasPlaywrightCore(),
    playwrightCoreAutoBootstrap: true,
    isolatedWorker: true,
  };
}

function runWorker(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(process.cwd(), "scripts", "naver-browser-worker.mjs");
    const child = spawn(process.execPath, [workerPath, inputPath, outputPath], {
      cwd: process.cwd(),
      stdio: "inherit",
      windowsHide: false,
      detached: false,
    });
    // Bound the worker lifetime and return its verified result.
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; clearInterval(poll); clearTimeout(deadline);
      let keepOpen = false;
      try { keepOpen = JSON.parse(fs.readFileSync(outputPath, 'utf8')).keepOpen === true; } catch {}
      if (keepOpen) child.unref(); else child.kill();
      fn(value);
    };
    const deadline = setTimeout(() => finish(reject, Object.assign(new Error("네이버 작업 시간이 초과됐습니다. 게시 결과를 확인하세요."), { code: "NAVER_WORKER_TIMEOUT" })), 8 * 60 * 1000);
    const poll = setInterval(() => { if (fs.existsSync(outputPath)) finish(resolve); }, 1000);
    child.once("error", (err) => finish(reject, err));
    child.once("exit", (code) => {
      if (code === 0 || fs.existsSync(outputPath)) finish(resolve);
      else finish(reject, new Error(`네이버 자동화 worker가 종료되었습니다. exit=${code}`));
    });
  });
}

export async function runNaverBrowserJob(draft, { publish = false } = {}) {
  assertNewPost(draft);
  const document = createKoreaDocument(draft);
  const issues = documentIssues(document, draft);
  if (issues.length) throw Object.assign(new Error(issues[0]), { code: "NAVER_DOCUMENT_INVALID" });
  const transactions = createPublishTransactions();
  const approval = publish ? checkUserApproval("korea", draft) : null;
  if (approval?.issues.length) throw Object.assign(new Error(approval.issues[0]), { code: "USER_PUBLISH_APPROVAL_REQUIRED" });
  ensurePlaywrightCore();
  findBrowserExecutable();
  fs.mkdirSync(profileDir(), { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-naver-"));
  const inputPath = path.join(tempDir, "input.json");
  const outputPath = path.join(tempDir, "output.json");
  let transaction = null;
  try {
    transaction = publish ? transactions.claim("korea", draft, approval.packet) : null;
    fs.writeFileSync(inputPath, JSON.stringify({ draft, publish, document, transaction }), "utf8");
    await runWorker(inputPath, outputPath);
    if (!fs.existsSync(outputPath)) {
      const err = new Error("네이버 자동화 결과 파일을 받지 못했습니다.");
      err.code = "NAVER_WORKER_NO_RESULT";
      throw err;
    }
    const result = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (result.status === "error") {
      const err = new Error(result.message || "네이버 자동화에 실패했습니다.");
      err.code = result.errorCode || "NAVER_AUTOMATION_FAILED";
      err.publishAttempted = result.publishAttempted;
      throw err;
    }
    if (publish) {
      const url = canonicalNaverUrl(result.publishedUrl, draft.blogId);
      const logNo = /(?:logNo=|who-ami\/)(\d+)/.exec(url || "")?.[1];
      const receipt = transactions.finish(transaction, { platform: "naver", postId: logNo, logNo, url });
      result.publishedUrl = receipt.url;
      result.postId = logNo;
    }
    return result;
  } catch (error) {
    if (transaction && transactions.read("korea", draft.id)?.state === "PUBLISHING") {
      if (error.publishAttempted === false) transactions.failedBeforePublish(transaction, error);
      else transactions.uncertain(transaction, error);
    }
    throw error;
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}
