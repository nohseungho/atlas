import fs from "fs";
import path from "path";

const root = process.cwd();
const mustExist = [
  "app/atlas/korea/page.js",
  "app/api/atlas/korea-drafts/route.js",
  "app/api/atlas/korea-generate/route.js",
  "app/api/atlas/korea-publish/route.js",
  "app/api/atlas/korea-doctor/route.js",
  "app/api/atlas/korea-assets/route.js",
  "app/api/atlas/korea-auto-assets/route.js",
  "lib/atlas/korea-product-pipeline.js",
  "lib/atlas/korea-content-generator.js",
  "lib/atlas/naver-browser-publisher.js",
  "data/atlas/korea-drafts.json",
  "scripts/naver-blog-automation.mjs",
  "scripts/naver-blog-doctor.mjs",
  "scripts/naver-browser-worker.mjs",
  "scripts/ATLAS-KOREA-START.cmd",
];

const failures = [];
for (const rel of mustExist) {
  if (!fs.existsSync(path.join(root, rel))) failures.push(`missing: ${rel}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

if (!failures.length) {
  const packageJson = JSON.parse(read("package.json"));
  const drafts = JSON.parse(read("data/atlas/korea-drafts.json"));
  const pipeline = read("lib/atlas/korea-product-pipeline.js");
  const publisher = read("lib/atlas/naver-browser-publisher.js");
  const worker = read("scripts/naver-browser-worker.mjs");
  const publishRoute = read("app/api/atlas/korea-publish/route.js");

  if (!packageJson.scripts?.["naver:stage"]) failures.push("package script naver:stage missing");
  if (!packageJson.scripts?.["naver:publish"]) failures.push("package script naver:publish missing");
  if (!packageJson.scripts?.["naver:doctor"]) failures.push("package script naver:doctor missing");
  if (!packageJson.scripts?.["naver:verify"]) failures.push("package script naver:verify missing");

  const items = Array.isArray(drafts.items) ? drafts.items : [];
  const ids = new Set(items.map((item) => item.id));
  if (!ids.has("kr_multitap_224407589323")) failures.push("multitap update target missing");
  if (!ids.has("kr_philips_3000_kettle")) failures.push("Philips kettle draft missing");

  const multitap = items.find((item) => item.id === "kr_multitap_224407589323");
  if (multitap) {
    if (String(multitap.blogId) !== "who-ami") failures.push("multitap blogId changed");
    if (String(multitap.logNo) !== "224407589323") failures.push("multitap logNo changed");
    if (multitap.contentType !== "existing_post_update") failures.push("multitap must stay existing_post_update");
    if (multitap.updateMode !== "images_only") failures.push("multitap must stay images_only to protect existing text");
    if ((multitap.images || []).length !== 3) failures.push("multitap must keep exactly 3 planned body images");
  }

  if (!pipeline.includes("canPublishKoreaDraft")) failures.push("approval gate helper missing");
  if (!publishRoute.includes("APPROVAL_REQUIRED")) failures.push("server-side approval gate missing");
  const draftsRoute = read("app/api/atlas/korea-drafts/route.js");
  const koreaPage = read("app/atlas/korea/page.js");
  if (!draftsRoute.includes("defaultKoreaProductImages")) failures.push("repeatable Korea product intake missing");
  if (!koreaPage.includes('/api/atlas/product-import')) failures.push("one-link Korea product import missing");
  if (!koreaPage.includes("링크 하나로 추천 글 만들기")) failures.push("one-link Korea intake UI missing");
  if (!worker.includes('role === "product_reasons"')) failures.push("generic product image renderer missing");

  // Browser control is intentionally isolated from Next.js/Turbopack in a worker process.
  if (!publisher.includes("naver-browser-worker.mjs")) failures.push("isolated Naver browser worker wiring missing");
  if (!publisher.includes("ATLAS_NAVER_PROFILE_DIR")) failures.push("configurable Naver profile directory missing");
  if (!worker.includes("launchPersistentContext")) failures.push("persistent Naver browser profile missing");
  if (!worker.includes("images_only")) failures.push("existing-post image-only protection missing");
  if (!worker.includes("playwright-core")) failures.push("worker browser control dependency missing");

  const forbidden = [
    /OPENAI_API_KEY/i,
    /new\s+OpenAI\s*\(/i,
    /api\.openai\.com/i,
  ];
  const koreaSources = [
    read("lib/atlas/korea-content-generator.js"),
    read("lib/atlas/korea-product-pipeline.js"),
    publisher,
    worker,
  ].join("\n");
  if (forbidden.some((pattern) => pattern.test(koreaSources))) {
    failures.push("paid OpenAI dependency detected in ATLAS Korea path");
  }
}

if (failures.length) {
  console.error("ATLAS KOREA VERIFY: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("ATLAS KOREA VERIFY: PASS");
console.log("- required files present");
console.log("- existing Naver post target protected");
console.log("- approval gate present");
console.log("- persistent browser profile present in isolated worker");
console.log("- paid OpenAI dependency absent from Korea automation path");
