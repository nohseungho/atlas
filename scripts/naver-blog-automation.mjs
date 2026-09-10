import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runNaverBrowserJob } from "../lib/atlas/naver-browser-publisher.js";
import { canPublishKoreaDraft, validateKoreaDraft } from "../lib/atlas/korea-product-pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const file = path.join(root, "data", "atlas", "korea-drafts.json");
const mode = process.argv[2] === "publish" ? "publish" : "stage";
const id = String(process.argv[3] || "").trim();

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const items = Array.isArray(data.items) ? data.items : [];
const draft = id ? items.find((item) => item.id === id) : items.find((item) => item.state === (mode === "publish" ? "approved" : "ready_for_review"));

if (!draft) {
  console.error(mode === "publish" ? "발행 승인된 국내 글이 없습니다." : "검수 대기 중인 국내 글이 없습니다.");
  process.exit(2);
}

const validation = validateKoreaDraft(draft);
if (!validation.ok) {
  console.error(`국내 글 검증 실패: ${validation.issues.join(", ")}`);
  process.exit(3);
}
if (mode === "publish" && !canPublishKoreaDraft(draft)) {
  console.error("최종 발행 승인 상태가 아니므로 실제 네이버 발행을 차단했습니다.");
  process.exit(4);
}

try {
  const result = await runNaverBrowserJob(draft, { publish: mode === "publish" });
  console.log(JSON.stringify({ id: draft.id, mode, ...result }, null, 2));
  if (result.status === "login_required") process.exitCode = 5;
} catch (error) {
  console.error(JSON.stringify({ id: draft.id, mode, status: "failed", errorCode: error?.code || "NAVER_AUTOMATION_FAILED", error: String(error?.message || error) }, null, 2));
  process.exit(1);
}
