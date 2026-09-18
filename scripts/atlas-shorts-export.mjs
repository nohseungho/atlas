// 국내 초안의 shorts 블록을 Story Shorts AI 입력 JSON으로 내보낸다. 렌더링/업로드 없음.
//   node scripts/atlas-shorts-export.mjs <draftId>
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildStoryShortsExport } from "../lib/atlas/shorts-export.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const id = String(process.argv[2] || "").trim();
if (!id) { console.error("사용법: node scripts/atlas-shorts-export.mjs <draftId>"); process.exit(1); }

const data = JSON.parse(fs.readFileSync(path.join(root, "data", "atlas", "korea-drafts.json"), "utf8"));
const draft = (data.items || []).find((item) => item.id === id);
if (!draft) { console.error(`초안을 찾지 못했습니다: ${id}`); process.exit(1); }
if (!draft.shorts) { console.error(`shorts 블록이 없습니다: ${id}`); process.exit(1); }

const output = buildStoryShortsExport(draft);
const dir = path.join(root, "data", "atlas", "shorts-exports");
fs.mkdirSync(dir, { recursive: true });
const target = path.join(dir, `${id}.story-shorts.json`);
fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ id, status: output.status, blockers: output.blockers, durationSeconds: output.shorts.durationSeconds, scenes: output.shorts.scenes.length, file: path.relative(root, target).split(path.sep).join("/") }, null, 2));
