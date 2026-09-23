// ATLAS 로컬 이미지 렌더 워커 — 유료 API를 쓰지 않는다.
//
// 이미 설치된 playwright-core + Edge로 카드 이미지를 헤드리스 렌더해 실제 PNG 파일을 쓴다.
// 국내(수호)는 .atlas-data/korea-assets/<draftId>/, 해외(미지)는 public/images/articles/<slug>/에 저장한다.
// 캐릭터 마스터는 lib/atlas/character-channel-policy.js가 정한 파일만 쓴다.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { getCharacterDefinition } from "../lib/atlas/character-channel-policy.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const [, , inputPath, outputPath] = process.argv;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function characterDataUri(characterId) {
  const definition = getCharacterDefinition(characterId);
  const source = path.join(process.cwd(), definition.masterAssetPath);
  if (!fs.existsSync(source)) return "";
  return `data:image/png;base64,${fs.readFileSync(source).toString("base64")}`;
}

// 국내 카드: 2열 헤드/본문 박스. 기존 네이버 워커 카드와 같은 시각 규칙을 따른다.
function koreaCardHtml(card, characterImage, characterName) {
  const columns = (card.columns || [])
    .slice(0, 4)
    .map(([head, body]) => `<div class="box"><div class="head">${escapeHtml(head)}</div><div class="body">${escapeHtml(body)}</div></div>`)
    .join("");
  const character = characterImage ? `<img class="character" src="${characterImage}" alt="${escapeHtml(characterName)}">` : "";
  const cols = Math.max(1, Math.min((card.columns || []).length, 4));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#f4f4f5;font-family:"Malgun Gothic","Apple SD Gothic Neo",Arial,sans-serif;color:#18181b}
.card{position:relative;overflow:hidden;width:1200px;height:800px;padding:72px;background:linear-gradient(145deg,#fff,#f4f4f5);display:flex;flex-direction:column;justify-content:space-between}
.kicker{position:relative;z-index:2;font-size:26px;font-weight:700;color:#52525b}
.title{position:relative;z-index:2;font-size:56px;line-height:1.18;font-weight:900;letter-spacing:-2px;max-width:${characterImage ? "780px" : "1000px"};margin-top:18px}
.grid{position:relative;z-index:2;display:grid;grid-template-columns:repeat(${cols},1fr);gap:18px;margin-top:44px;max-width:${characterImage ? "820px" : "none"}}
.box{border:2px solid #d4d4d8;border-radius:24px;background:rgba(255,255,255,.94);padding:26px;min-height:180px}
.head{font-size:28px;font-weight:900}
.body{font-size:22px;line-height:1.5;margin-top:14px;color:#52525b}
.footer{position:relative;z-index:2;border-top:2px solid #e4e4e7;padding-top:24px;font-size:26px;font-weight:700;color:#3f3f46;max-width:${characterImage ? "760px" : "none"}}
.character{position:absolute;right:56px;bottom:0;width:290px;height:auto;z-index:1;pointer-events:none;-webkit-mask-image:linear-gradient(to right,transparent 0,#000 16%);mask-image:linear-gradient(to right,transparent 0,#000 16%)}
</style></head><body><div class="card">${character}<div><div class="kicker">${escapeHtml(card.kicker)}</div><div class="title">${escapeHtml(card.title)}</div><div class="grid">${columns}</div></div><div class="footer">${escapeHtml(card.footer)}</div></div></body></html>`;
}

// 해외 카드: 16:9 편집형. 미지 마스터를 오른쪽 진행자 패널로 합성한다.
function globalCardHtml(card, characterImage, characterName) {
  const lines = (card.lines || [])
    .slice(0, 3)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  const character = characterImage ? `<img class="character" src="${characterImage}" alt="${escapeHtml(characterName)}">` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#0f172a;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:#0f172a}
.card{position:relative;overflow:hidden;width:1600px;height:900px;display:grid;grid-template-columns:1fr 520px;background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 100%)}
.copy{padding:84px 64px;display:flex;flex-direction:column;justify-content:space-between}
.kicker{font-size:26px;font-weight:700;letter-spacing:4px;color:#4338ca}
.title{font-size:${(card.title || "").length > 40 ? 58 : 68}px;line-height:1.12;font-weight:800;letter-spacing:-1.5px;margin:26px 0 0}
ul{margin:36px 0 0;padding:0;list-style:none}
li{font-size:27px;line-height:1.5;color:#334155;padding-left:28px;position:relative;margin-bottom:20px}
li:before{content:"";position:absolute;left:0;top:14px;width:12px;height:12px;border-radius:50%;background:#4338ca}
.footer{font-size:24px;font-weight:700;letter-spacing:3px;color:#64748b;border-top:2px solid #cbd5e1;padding-top:26px}
.panel{position:relative;background:linear-gradient(160deg,#4338ca,#1e1b4b);overflow:hidden}
.character{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top}
</style></head><body><div class="card"><div class="copy"><div><div class="kicker">${escapeHtml(card.kicker)}</div><h1 class="title">${escapeHtml(card.title)}</h1><ul>${lines}</ul></div><div class="footer">${escapeHtml(card.footer)}</div></div><div class="panel">${character}</div></div></body></html>`;
}

async function main() {
  const job = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const jobs = Array.isArray(job.images) ? job.images : [];
  const characterImage = characterDataUri(job.character);
  const characterName = getCharacterDefinition(job.character).displayName;
  const results = [];

  const browser = await chromium.launch({ executablePath: job.browserPath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: job.layout === "global" ? 1600 : 1200, height: job.layout === "global" ? 900 : 800 } });
    for (const image of jobs) {
      const html = job.layout === "global"
        ? globalCardHtml(image.card, characterImage, characterName)
        : koreaCardHtml(image.card, characterImage, characterName);
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
