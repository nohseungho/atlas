// ATLAS 로컬 이미지 렌더 워커 — 유료 API를 쓰지 않는다.
//
// 이미지는 "자유 라이선스 실제 장면 사진 + 캐릭터 패널"로 만든다.
// 예전에는 모든 이미지를 같은 텍스트 카드 틀로 찍어내서 한 글의 이미지가 전부
// 같은 구도의 PPT 슬라이드처럼 보였다. 이제 배경 사진과 패널 구도가 역할마다 다르다.
//
// 캐릭터 마스터는 lib/atlas/character-channel-policy.js가 정한 파일만 쓴다.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { getCharacterDefinition } from "../lib/atlas/character-channel-policy.js";
import { PANEL_SHAPE } from "../lib/atlas/operate/scene-composition.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const [, , inputPath, outputPath] = process.argv;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function dataUri(file, mime = "image/png") {
  return fs.existsSync(file) ? `data:${mime};base64,${fs.readFileSync(file).toString("base64")}` : "";
}

function characterDataUri(characterId) {
  const definition = getCharacterDefinition(characterId);
  return dataUri(path.join(process.cwd(), definition.masterAssetPath));
}

// 패널 구도를 CSS로 옮긴다. shape/side/scale/gravity 조합이 역할마다 달라서
// 같은 인물 이미지를 써도 화면에서 차지하는 자리와 크기가 매번 다르다.
function panelStyle(composition) {
  const { side, shape, scale, focus } = composition;
  const edge = side === "left" ? "left:4.5%;" : "right:4.5%;";
  const objectPosition = focus === "face" ? "center 18%" : "center 30%";

  if (shape === PANEL_SHAPE.COLUMN) {
    const width = Math.round(30 * scale);
    return {
      wrapper: `position:absolute;top:0;bottom:0;${side === "left" ? "left:0;" : "right:0;"}width:${width}%;overflow:hidden;box-shadow:0 0 60px rgba(15,23,42,.35);`,
      image: `width:100%;height:100%;object-fit:cover;object-position:${objectPosition};`,
    };
  }
  if (shape === PANEL_SHAPE.BADGE) {
    const size = Math.round(520 * scale);
    return {
      wrapper: `position:absolute;bottom:7%;${edge}width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:7px solid rgba(255,255,255,.94);box-shadow:0 14px 40px rgba(15,23,42,.4);`,
      image: `width:100%;height:100%;object-fit:cover;object-position:${objectPosition};`,
    };
  }
  if (shape === PANEL_SHAPE.CUTIN) {
    const width = Math.round(560 * scale);
    return {
      wrapper: `position:absolute;bottom:0;${edge}width:${width}px;height:${Math.round(width * 1.15)}px;overflow:hidden;border-radius:18px 18px 0 0;border:6px solid rgba(255,255,255,.9);border-bottom:none;box-shadow:0 -6px 34px rgba(15,23,42,.34);`,
      image: `width:100%;height:100%;object-fit:cover;object-position:${objectPosition};`,
    };
  }
  // portrait-card
  const width = Math.round(620 * scale);
  return {
    wrapper: `position:absolute;top:50%;${edge}transform:translateY(-50%);width:${width}px;height:${Math.round(width * 1.28)}px;overflow:hidden;border-radius:22px;border:8px solid rgba(255,255,255,.95);box-shadow:0 18px 48px rgba(15,23,42,.42);`,
    image: `width:100%;height:100%;object-fit:cover;object-position:${objectPosition};`,
  };
}

function sceneHtml({ sceneUri, characterUri, composition, label, credit, characterName, width, height }) {
  const panel = panelStyle(composition);
  const labelSide = composition.side === "left" ? "right:5%;" : "left:5%;";
  const labelTop = composition.gravity === "north" ? "top:7%;" : composition.gravity === "south" ? "bottom:14%;" : "top:50%;transform:translateY(-50%);";
  const labelHtml = label
    ? `<div style="position:absolute;${labelSide}${labelTop}max-width:44%;padding:14px 22px;background:rgba(15,23,42,.72);color:#fff;border-radius:10px;font-size:34px;font-weight:700;letter-spacing:-.5px;line-height:1.25;backdrop-filter:blur(2px);">${escapeHtml(label)}</div>`
    : "";
  const characterHtml = characterUri
    ? `<div style="${panel.wrapper}"><img alt="${escapeHtml(characterName)}" src="${characterUri}" style="${panel.image}"></div>`
    : "";
  const creditHtml = credit
    ? `<div style="position:absolute;left:0;right:0;bottom:0;padding:9px 18px;background:rgba(15,23,42,.62);color:#e2e8f0;font-size:19px;">Photo: ${escapeHtml(credit)}</div>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;font-family:"Malgun Gothic","Apple SD Gothic Neo",system-ui,-apple-system,Arial,sans-serif}
.card{position:relative;overflow:hidden;width:${width}px;height:${height}px;background:#0f172a}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
</style></head><body><div class="card">
<img class="bg" alt="" src="${sceneUri}">
${characterHtml}${labelHtml}${creditHtml}
</div></body></html>`;
}

async function main() {
  const job = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const images = Array.isArray(job.images) ? job.images : [];
  const characterUri = characterDataUri(job.character);
  const characterName = getCharacterDefinition(job.character).displayName;
  const width = job.layout === "global" ? 1600 : 1200;
  const height = job.layout === "global" ? 900 : 800;
  const results = [];

  const browser = await chromium.launch({ executablePath: job.browserPath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    for (const image of images) {
      if (!image.scenePath || !fs.existsSync(image.scenePath)) {
        throw Object.assign(new Error(`장면 사진이 준비되지 않았습니다: ${image.id}`), { code: "SCENE_FILE_MISSING" });
      }
      const html = sceneHtml({
        sceneUri: dataUri(image.scenePath, image.sceneMime || "image/jpeg"),
        characterUri,
        characterName,
        composition: image.composition,
        label: image.label || "",
        credit: image.credit || "",
        width,
        height,
      });
      await page.setContent(html, { waitUntil: "load" });
      fs.mkdirSync(path.dirname(image.outPath), { recursive: true });
      await page.locator(".card").screenshot({ path: image.outPath, type: "png" });
      results.push({ id: image.id, outPath: image.outPath, bytes: fs.statSync(image.outPath).size });
    }
    await page.close();
  } finally {
    await browser.close().catch(() => {});
  }

  fs.writeFileSync(outputPath, JSON.stringify({ status: "ok", results }), "utf8");
}

main().catch((error) => {
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ status: "error", errorCode: error?.code || "ATLAS_IMAGE_RENDER_FAILED", message: String(error?.message || error) }),
    "utf8",
  );
  process.exit(1);
});
