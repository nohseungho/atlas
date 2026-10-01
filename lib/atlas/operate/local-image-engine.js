import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const DEFAULT_URL = "http://127.0.0.1:8188";

function engineUrl() {
  return process.env.ATLAS_COMFY_URL || DEFAULT_URL;
}

function localUrl(url) {
  try {
    const parsed = new URL(url);
    return ["127.0.0.1", "localhost"].includes(parsed.hostname);
  } catch { return false; }
}

function installation() {
  const locations = [process.env.ATLAS_COMFY_DIR,
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, "ComfyUI"),
    path.join(path.dirname(process.cwd()), "ComfyUI")].filter(Boolean);
  for (const dir of locations) {
    const main = path.join(dir, "main.py");
    const python = path.join(dir, "venv", "Scripts", "python.exe");
    if (fs.existsSync(main) && fs.existsSync(python)) return { dir, main, python };
  }
  return null;
}

export async function imageEngineStatus() {
  const url = engineUrl();
  try {
    const response = await fetch(new URL("/system_stats", url), { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (response.ok) return { ready: true, message: "로컬 이미지 생성기 연결됨" };
    return { ready: false, installed: Boolean(installation()), message: `이미지 생성기 응답 ${response.status}` };
  } catch {
    if (!localUrl(url)) return { ready: false, installed: false, message: "설정된 이미지 제작 PC에 연결할 수 없습니다." };
    const installed = Boolean(installation());
    return { ready: false, installed, message: installed
      ? "이미지 제작 엔진 연결이 끊겼습니다. 자동 연결을 시도합니다."
      : "이 PC에서 이미지 제작 엔진 설치 위치를 찾지 못했습니다." };
  }
}

async function startEngine() {
  const current = await imageEngineStatus();
  if (current.ready || !localUrl(engineUrl())) return current;
  const found = installation();
  if (!found) return current;

  let child;
  let logPath = "";
  let logFd;
  try {
    const port = new URL(engineUrl()).port || "8188";
    const logDir = path.join(process.cwd(), ".atlas", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    logPath = path.join(logDir, "comfy-engine.log");
    logFd = fs.openSync(logPath, "a");
    child = spawn(found.python, [found.main, "--listen", "127.0.0.1", "--port", port, "--lowvram"], {
      cwd: found.dir, detached: true, stdio: ["ignore", logFd, logFd], windowsHide: true,
    });
    child.unref();
  } catch (error) {
    return { ready: false, installed: true, message: `이미지 엔진 시작 실패: ${error.message}` };
  } finally {
    if (logFd !== undefined) fs.closeSync(logFd);
  }
  let spawnError = "";
  child.on("error", (error) => { spawnError = error.message; });
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (spawnError || child.exitCode !== null) break;
    const status = await imageEngineStatus();
    if (status.ready) return status;
  }
  const status = await imageEngineStatus();
  return status.ready ? status : { ...status, message: spawnError
    ? `이미지 엔진 시작 실패: ${spawnError}`
    : child.exitCode !== null ? `이미지 엔진이 실행 중 종료됐습니다 (코드 ${child.exitCode}). ${logPath} 파일을 확인하세요.`
      : "이미지 엔진이 아직 시작 중입니다. 잠시 뒤 다시 연결을 누르세요." };
}

export function connectImageEngine() {
  // React 개발 모드의 중복 요청도 한 프로세스만 시작한다.
  if (!globalThis.__atlasComfyStart) {
    globalThis.__atlasComfyStart = startEngine().finally(() => { globalThis.__atlasComfyStart = null; });
  }
  return globalThis.__atlasComfyStart;
}
