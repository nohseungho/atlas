// 국내 초안 → 쇼핑쇼츠용 데이터 export (data/atlas/shopping-exports/{draftId}.json). 미디어 생성 없음.
//   node scripts/atlas-shopping-export.mjs <draftId>
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildShoppingExport } from "../lib/atlas/shopping-export.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const id = String(process.argv[2] || "").trim();
if (!id) { console.error("사용법: node scripts/atlas-shopping-export.mjs <draftId>"); process.exit(1); }

const data = JSON.parse(fs.readFileSync(path.join(root, "data", "atlas", "korea-drafts.json"), "utf8"));
const draft = (data.items || []).find((item) => item.id === id);
if (!draft) { console.error(`초안을 찾지 못했습니다: ${id}`); process.exit(1); }

const output = buildShoppingExport(draft);
const dir = path.join(root, "data", "atlas", "shopping-exports");
fs.mkdirSync(dir, { recursive: true });
const target = path.join(dir, `${id}.json`);
fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ id, status: output.status, affiliateUrl: output.affiliateUrl, sourceImages: output.sourceImages.length, file: path.relative(root, target).split(path.sep).join("/") }, null, 2));
