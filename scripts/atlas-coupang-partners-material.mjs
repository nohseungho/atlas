// 쿠팡 파트너스 공식 상품소재를 국내 초안에 연결한다.
//   node scripts/atlas-coupang-partners-material.mjs <draftId>                    후보 조회만 (초안 변경 없음)
//   node scripts/atlas-coupang-partners-material.mjs <draftId> --apply <productId> 지정한 상품의 공식 이미지 저장 + 링크 연결
// Open API 키(COUPANG_PARTNERS_ACCESS_KEY / COUPANG_PARTNERS_SECRET_KEY)가 없으면 아무것도 하지 않고 안내만 출력한다.
// 일반 쿠팡 상품 페이지 이미지는 절대 가져오지 않는다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { coupangPartnersConfigured, findCoupangPartnersProduct } from "../lib/atlas/coupang-partners.js";
import { applyPartnersMaterial, imageExtensionFor, partnersImageUrl, pickPartnersProduct } from "../lib/atlas/coupang-partners-material.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const file = path.join(root, "data", "atlas", "korea-drafts.json");

function loadEnvLocal() {
  const envFile = path.join(root, ".env.local");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

async function main() {
  loadEnvLocal();
  const id = String(process.argv[2] || "").trim();
  const applyIndex = process.argv.indexOf("--apply");
  const productId = applyIndex >= 0 ? String(process.argv[applyIndex + 1] || "").trim() : "";
  if (!id) fail("사용법: node scripts/atlas-coupang-partners-material.mjs <draftId> [--apply <productId>]");

  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const draft = (data.items || []).find((item) => item.id === id);
  if (!draft) fail(`초안을 찾지 못했습니다: ${id}`);

  if (!coupangPartnersConfigured()) {
    console.log(JSON.stringify({
      id,
      status: "not_configured",
      code: "COUPANG_PARTNERS_NOT_CONFIGURED",
      message: "쿠팡 파트너스 Open API 키가 없어 공식 상품소재를 조회하지 않았습니다.",
      required: ["COUPANG_PARTNERS_ACCESS_KEY", "COUPANG_PARTNERS_SECRET_KEY"],
      howTo: "partners.coupang.com 로그인 → 링크 생성 → API 키 발급(최종 승인 계정 필요) 후 .env.local에 추가",
      manualAlternative: "파트너스 화면에서 동일 상품의 링크 생성 + 배너/상품 이미지 저장 후 affiliateUrl과 img_product_photo_1.src에 직접 연결",
    }, null, 2));
    return;
  }

  const result = await findCoupangPartnersProduct({ productName: draft.productName, limit: 10 });
  if (!result.ok) fail(JSON.stringify({ id, status: "error", ...result }, null, 2));

  const products = Array.isArray(result.candidates) && result.candidates.length ? result.candidates : [result.rawProduct];
  const candidates = products.map((p) => ({ productId: String(p.productId || ""), productName: p.productName, productUrl: p.productUrl, productImage: partnersImageUrl(p), productPrice: p.productPrice ?? null }));

  if (!productId) {
    console.log(JSON.stringify({ id, status: "candidates", productName: draft.productName, candidates, next: "정확한 모델을 확인한 뒤 --apply <productId> 로 연결" }, null, 2));
    return;
  }

  const picked = pickPartnersProduct(products, productId);
  if (!picked.ok) fail(JSON.stringify({ id, status: "error", code: picked.code, candidates }, null, 2));

  const imageUrl = partnersImageUrl(picked.product);
  if (!imageUrl) fail(JSON.stringify({ id, status: "error", code: "PARTNERS_IMAGE_MISSING", product: picked.product }, null, 2));

  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) fail(`공식 상품 이미지 다운로드 실패 HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const dir = path.join(root, ".atlas-data", "korea-assets", id);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `coupang-partners-product-1${imageExtensionFor(imageUrl, res.headers.get("content-type"))}`);
  fs.writeFileSync(target, buffer);
  const localPath = path.relative(root, target).split(path.sep).join("/");

  const updated = applyPartnersMaterial(draft, { product: picked.product, localImagePaths: [localPath] });
  data.items = data.items.map((item) => (item.id === id ? updated : item));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ id, status: "linked", affiliateUrl: updated.affiliateUrl, image: localPath, product: updated.coupangPartnersProduct }, null, 2));
}

main().catch((error) => fail(String(error?.stack || error)));
