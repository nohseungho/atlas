import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const cfgPath = process.argv[2];
if (!cfgPath) throw new Error("config path required");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const { blogId, logNo, imagePaths = [], statusPath } = cfg;

function writeStatus(stage, message, extra = {}) {
  const body = { ok: !String(stage).startsWith("error"), stage, message, updatedAt: new Date().toISOString(), ...extra };
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify(body, null, 2), "utf8");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function findEdge() {
  const candidates = [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || "msedge.exe";
}

async function waitJson(url, timeoutMs = 30000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return await res.json();
    } catch (err) { last = err; }
    await sleep(500);
  }
  throw last || new Error(`timeout waiting for ${url}`);
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.seq = 0;
    this.pending = new Map();
  }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (!msg.id) return;
      const item = this.pending.get(msg.id);
      if (!item) return;
      this.pending.delete(msg.id);
      if (msg.error) item.reject(new Error(msg.error.message || "CDP error"));
      else item.resolve(msg.result || {});
    };
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws?.close(); } catch {} }
}

function docPrefix() {
  return `const d=(()=>{try{const f=document.querySelector('#mainFrame');if(f&&f.contentDocument)return f.contentDocument;}catch{}return document;})();`;
}

async function evalValue(cdp, body) {
  const r = await cdp.send("Runtime.evaluate", {
    expression: `(()=>{${docPrefix()}${body}})()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || "browser evaluate failed");
  return r.result?.value;
}

async function currentUrl(cdp) {
  return evalValue(cdp, "return location.href;");
}

async function navigate(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await sleep(2500);
}

async function waitUntil(cdp, fnBody, timeoutMs = 30000, interval = 700) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evalValue(cdp, fnBody)) return true;
    } catch {}
    await sleep(interval);
  }
  return false;
}

async function clickEdit(cdp) {
  return evalValue(cdp, `
    const docs=[document];
    try{const f=document.querySelector('#mainFrame');if(f?.contentDocument)docs.push(f.contentDocument);}catch{}
    for(const x of docs){
      const all=[...x.querySelectorAll('a,button,[role="button"]')];
      const el=all.find((n)=>{const t=(n.innerText||n.textContent||'').trim();return t==='수정'||t.startsWith('수정 ');});
      if(el){el.click();return true;}
    }
    return false;
  `);
}

async function editorReady(cdp) {
  return waitUntil(cdp, `return !!(d.querySelector('.se-editor,.se-content,.se-main-container') && d.querySelector('.se-text-paragraph,[contenteditable="true"]'));`, 45000);
}

async function waitForLoginOrEditor(cdp) {
  let announced = false;
  const started = Date.now();
  while (Date.now() - started < 10 * 60 * 1000) {
    if (await editorReady(cdp)) return true;
    const url = await currentUrl(cdp).catch(() => "");
    const loginLike = /nid\.naver\.com|login/i.test(url);
    if (loginLike && !announced) {
      announced = true;
      writeStatus("login_required", "Edge에서 네이버 로그인만 직접 완료하세요. 로그인 뒤 자동으로 계속됩니다.", { url });
    }
    await sleep(1200);
  }
  return false;
}

async function editorStats(cdp) {
  return evalValue(cdp, `
    const paras=[...d.querySelectorAll('.se-component.se-text .se-text-paragraph,.se-text-paragraph')].filter(e=>e.offsetParent!==null);
    const images=[...d.querySelectorAll('.se-component.se-image,img')].filter(e=>e.offsetParent!==null);
    return {paragraphs:paras.length,images:images.length,title:(d.querySelector('.se-documentTitle .se-text-paragraph')?.innerText||'').trim()};
  `);
}

async function focusParagraph(cdp, fraction) {
  return evalValue(cdp, `
    const paras=[...d.querySelectorAll('.se-component.se-text .se-text-paragraph,.se-text-paragraph')]
      .filter(e=>e.offsetParent!==null && !e.closest('.se-documentTitle'));
    if(!paras.length)return false;
    const idx=Math.max(0,Math.min(paras.length-1,Math.floor((paras.length-1)*${Number(fraction)})));
    const el=paras[idx];
    el.scrollIntoView({block:'center'});el.focus();
    const sel=(d.getSelection?d.getSelection():window.getSelection());
    const range=d.createRange();range.selectNodeContents(el);range.collapse(false);sel.removeAllRanges();sel.addRange(range);
    return true;
  `);
}

async function clickPhoto(cdp) {
  return evalValue(cdp, `
    const candidates=[...d.querySelectorAll('button,[role="button"]')];
    const el=d.querySelector('button[data-name="image"],button.se-image-toolbar-button') ||
      candidates.find(n=>/사진|이미지/.test((n.getAttribute('title')||'')+' '+(n.innerText||n.textContent||'')));
    if(!el)return false;el.click();return true;
  `);
}

async function setFileInput(cdp, filePath) {
  const expr = `(()=>{${docPrefix()}return d.querySelector('input[type="file"][accept*="image"],input[type="file"]');})()`;
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: false });
  const objectId = r.result?.objectId;
  if (!objectId) return false;
  const desc = await cdp.send("DOM.describeNode", { objectId });
  const backendNodeId = desc.node?.backendNodeId;
  if (!backendNodeId) return false;
  await cdp.send("DOM.setFileInputFiles", { files: [path.resolve(filePath)], backendNodeId });
  return true;
}

async function uploadAt(cdp, filePath, fraction) {
  const before = (await editorStats(cdp)).images;
  if (!(await focusParagraph(cdp, fraction))) throw new Error("본문 삽입 위치를 찾지 못했습니다.");
  await sleep(350);
  if (!(await clickPhoto(cdp))) throw new Error("사진 버튼을 찾지 못했습니다.");
  const foundInput = await waitUntil(cdp, "return !!d.querySelector('input[type=\"file\"]');", 12000, 300);
  if (!foundInput) throw new Error("사진 파일 선택 창을 찾지 못했습니다.");
  if (!(await setFileInput(cdp, filePath))) throw new Error("사진 파일을 에디터에 전달하지 못했습니다.");
  await sleep(3500);
  await waitUntil(cdp, `return [...d.querySelectorAll('.se-component.se-image,img')].filter(e=>e.offsetParent!==null).length>${before};`, 20000, 700);
}

async function main() {
  if (!/^[A-Za-z0-9._-]{2,80}$/.test(String(blogId || ""))) throw new Error("invalid blogId");
  if (!/^\d{5,30}$/.test(String(logNo || ""))) throw new Error("invalid logNo");
  for (const p of imagePaths) if (!fs.existsSync(p)) throw new Error(`image missing: ${p}`);

  const port = 9227;
  const profile = path.join(os.homedir(), ".atlas", "naver-edge-profile");
  fs.mkdirSync(profile, { recursive: true });
  writeStatus("starting", "ATLAS 국내용 네이버 편집 브라우저를 여는 중입니다.");

  const edge = findEdge();
  const postUrl = `https://blog.naver.com/${encodeURIComponent(blogId)}/${encodeURIComponent(logNo)}`;
  const child = spawn(edge, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    postUrl,
  ], { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();

  await waitJson(`http://127.0.0.1:${port}/json/version`, 30000);
  let targets = await waitJson(`http://127.0.0.1:${port}/json/list`, 30000);
  let target = targets.find((t) => t.type === "page" && /blog\.naver\.com/.test(t.url)) || targets.find((t) => t.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("Edge 탭을 찾지 못했습니다.");
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("DOM.enable");

  try {
    await navigate(cdp, postUrl);
    await sleep(2500);

    let clicked = await clickEdit(cdp).catch(() => false);
    if (!clicked) {
      const loginUrl = await currentUrl(cdp).catch(() => "");
      if (/nid\.naver\.com|login/i.test(loginUrl)) {
        writeStatus("login_required", "Edge에서 네이버 로그인만 직접 완료하세요. 로그인 뒤 자동으로 계속됩니다.");
        const loggedIn = await waitUntil(cdp, "return !/nid\\.naver\\.com|login/i.test(location.href);", 10 * 60 * 1000, 1200);
        if (!loggedIn) throw new Error("네이버 로그인 대기 시간이 초과되었습니다.");
        await navigate(cdp, postUrl);
        clicked = await clickEdit(cdp).catch(() => false);
      }
    }

    if (!clicked) {
      const fallback = `https://blog.naver.com/PostWriteForm.naver?blogId=${encodeURIComponent(blogId)}&logNo=${encodeURIComponent(logNo)}`;
      await navigate(cdp, fallback);
    }

    if (!(await waitForLoginOrEditor(cdp))) throw new Error("네이버 SmartEditor를 찾지 못했습니다.");
    writeStatus("editor_ready", "기존 글 편집창 연결 완료. 본문 이미지 배치를 시작합니다.", { stats: await editorStats(cdp) });

    const fractions = imagePaths.length <= 1 ? [0.55] : imagePaths.length === 2 ? [0.38, 0.72] : [0.28, 0.55, 0.8];
    for (let i = 0; i < imagePaths.length; i++) {
      writeStatus("placing_images", `본문 이미지 ${i + 1}/${imagePaths.length} 배치 중입니다.`);
      await uploadAt(cdp, imagePaths[i], fractions[i] ?? 0.8);
    }

    const stats = await editorStats(cdp);
    writeStatus("review_required", "이미지 배치 완료. 발행 버튼은 누르지 않았습니다. 열린 Edge에서 최종 화면만 확인하세요.", { stats, url: await currentUrl(cdp) });
  } finally {
    cdp.close();
  }
}

main().catch((err) => {
  writeStatus("error", `네이버 편집 자동화 중단: ${String(err?.message || err)}`);
  process.exitCode = 1;
});
