// 실제 이미지 생성 단계. scripts/atlas-image-worker.mjs를 별도 프로세스로 돌려
// 로컬 PNG 파일을 만들고, 그 파일 경로를 초안/기사에 연결한다.
//
// 유료 이미지 API를 쓰지 않는다. 이미 설치된 playwright-core + Edge만 쓴다.
// 발행 게이트는 여기서 만들어진 실제 파일이 있어야만 통과한다.
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { ensurePlaywrightCore, findBrowserExecutable } from "../naver-browser-publisher.js";
import { compositionFor } from "./scene-composition.js";
import { creditLine, fetchScene, sceneFor } from "./scene-library.js";

// 장면 사진을 받아 렌더 작업 하나로 만든다. 장면이 선언되지 않은 역할은
// 렌더하지 않는다 — 카드형으로 되돌아가지 않기 위해서다.
async function sceneJob({ topicId, role, id, outPath, channel }) {
  const scene = sceneFor(topicId, role);
  if (!scene) return null;
  const composition = compositionFor(channel, role);
  if (!composition) return null;
  const meta = await fetchScene(scene.file);
  const ext = String(meta.filePath).toLowerCase();
  return {
    id,
    outPath,
    composition,
    label: scene.label || "",
    credit: creditLine(meta),
    scenePath: meta.filePath,
    sceneMime: ext.endsWith(".png") ? "image/png" : ext.endsWith(".webp") ? "image/webp" : "image/jpeg",
    sceneFile: scene.file,
  };
}

function runWorker(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(process.cwd(), "scripts", "atlas-image-worker.mjs");
    const child = spawn(process.execPath, [workerPath, inputPath, outputPath], {
      cwd: process.cwd(),
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", () => resolve());
  });
}

async function render({ character, layout, images }) {
  if (!images.length) return { status: "ok", results: [] };
  ensurePlaywrightCore();
  const browserPath = findBrowserExecutable();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-image-"));
  const inputPath = path.join(tempDir, "input.json");
  const outputPath = path.join(tempDir, "output.json");
  fs.writeFileSync(inputPath, JSON.stringify({ character, layout, browserPath, images }), "utf8");
  try {
    await runWorker(inputPath, outputPath);
    if (!fs.existsSync(outputPath)) {
      const err = new Error("이미지 렌더 결과 파일을 받지 못했습니다.");
      err.code = "ATLAS_IMAGE_WORKER_NO_RESULT";
      throw err;
    }
    const result = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (result.status === "error") {
      const err = new Error(result.message || "이미지 생성에 실패했습니다.");
      err.code = result.errorCode || "ATLAS_IMAGE_RENDER_FAILED";
      throw err;
    }
    return result;
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

const KOREA_ASSET_DIR = () => path.join(process.cwd(), ".atlas-data", "korea-assets");

function safePart(value) {
  return String(value || "asset").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

// 국내: card 문구를 가진 슬롯만 생성한다. role "product_photo"는 실제 제품 사진 자리이므로
// 절대 자동 생성하지 않는다. 이미 연결된 이미지는 force 없이는 덮어쓰지 않는다(기존 자산 보존).
export async function renderKoreaDraftImages(draft, { force = false } = {}) {
  const dir = path.join(KOREA_ASSET_DIR(), safePart(draft.id));
  const targets = (draft.images || []).filter((img) => {
    if (img.role === "product_photo") return false;
    const src = String(img.src || "").trim();
    if (!force && src && !src.startsWith("atlas-generated://") && fs.existsSync(src)) return false;
    return true;
  });
  const jobs = (await Promise.all(targets.map((img) => sceneJob({
    topicId: draft.topicId,
    role: img.role,
    id: img.id,
    channel: "korea",
    outPath: path.join(dir, `${safePart(img.id)}.png`),
  })))).filter(Boolean);
  const rendered = await render({ character: draft.character || "suho", layout: "korea", images: jobs });
  const byId = new Map(rendered.results.map((r) => [r.id, r]));
  const images = (draft.images || []).map((img) => {
    const hit = byId.get(img.id);
    return hit ? { ...img, src: hit.outPath, generatedLocalPath: hit.outPath, generatedAt: new Date().toISOString() } : img;
  });
  return { images, rendered: rendered.results };
}

// 해외: public/images/articles/<slug>/<key>.png 를 실제로 만든다.
// Cloudinary 업로드(공개 URL)는 별도 단계이며 여기서 하지 않는다.
export async function renderGlobalArticleImages(article, { force = false } = {}) {
  const assets = Array.isArray(article.visualAssets) ? article.visualAssets : [];
  const targets = assets.filter((asset) => {
    if (!asset.localSrc) return false;
    const file = path.join(process.cwd(), "public", asset.localSrc.replace(/^\//, ""));
    return force || !fs.existsSync(file);
  });
  const jobs = (await Promise.all(targets.map((asset) => sceneJob({
    topicId: article.topicId,
    role: asset.role || asset.key,
    id: asset.key,
    channel: "global",
    outPath: path.join(process.cwd(), "public", asset.localSrc.replace(/^\//, "")),
  })))).filter(Boolean);
  const rendered = await render({ character: article.character || "miji", layout: "global", images: jobs });
  return { rendered: rendered.results };
}

export function globalLocalImageStatus(article) {
  const assets = (Array.isArray(article?.visualAssets) ? article.visualAssets : []).filter((a) => a?.required !== false);
  const ready = assets.filter((a) => {
    if (!a.localSrc) return false;
    const file = path.join(process.cwd(), "public", String(a.localSrc).replace(/^\//, ""));
    return fs.existsSync(file);
  });
  return { total: assets.length, ready: ready.length, missing: assets.filter((a) => !ready.includes(a)).map((a) => a.key) };
}

export function koreaLocalImageStatus(draft) {
  const images = (draft?.images || []).filter((img) => img.role !== "product_photo" && img.optional !== true && img.required !== false);
  const ready = images.filter((img) => {
    const src = String(img.src || "").trim();
    return Boolean(src) && !src.startsWith("atlas-generated://") && fs.existsSync(src);
  });
  const productPhotos = (draft?.images || []).filter((img) => img.role === "product_photo");
  return {
    total: images.length,
    ready: ready.length,
    missing: images.filter((img) => !ready.includes(img)).map((img) => img.id),
    productPhotoTotal: productPhotos.length,
    productPhotoReady: productPhotos.filter((img) => String(img.src || "").trim() && fs.existsSync(String(img.src))).length,
  };
}
