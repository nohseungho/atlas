// 쿠팡 파트너스 소재 수동 인테이크 → ATLAS 초안 자동 연결.
// 쿠팡 로그인은 자동화하지 않는다. 사용자가 일반 Edge에서 partners.coupang.com에 로그인해
// 링크 생성 + 공식 상품 이미지 저장을 마친 뒤, 아래 인박스에 넣으면 이 스크립트가 검증 후 연결한다.
//
//   인박스: .atlas-data/coupang-partners/inbox/<draftId>/
//     link.txt              파트너스 링크 1줄 (https://link.coupang.com/a/...)
//     material.json (선택)  { "productName", "price", "discountRate", "productId", "vendorItemId", "link" }
//     *.jpg|png|webp        파트너스 화면에서 저장한 공식 상품 이미지 (파일명 순으로 product_1, product_2)
//
//   node scripts/atlas-coupang-partners-intake.mjs <draftId>
//   node scripts/atlas-coupang-partners-intake.mjs <draftId> --link <url> --images a.jpg,b.jpg [--name "..."] [--price 23900]
//
// 소재가 아직 없으면 MANUAL_LOGIN_REQUIRED(비차단)로 끝난다. 실제 발행은 하지 않는다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyPartnersMaterial, imageExtensionFor, validatePartnersMaterial } from "../lib/atlas/coupang-partners-material.js";
import { publishBlockers } from "../lib/atlas/korea-product-pipeline.js";
import { buildStoryShortsExport } from "../lib/atlas/shorts-export.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const DRAFTS = path.join(root, "data", "atlas", "korea-drafts.json");
const args = process.argv.slice(2);
const draftId = String(args.find((a) => !a.startsWith("--")) || "").trim();
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? String(args[i + 1] || "").trim() : ""; };
const out = (obj) => console.log(JSON.stringify(obj, null, 2));
const rel = (p) => path.relative(root, p).split(path.sep).join("/");

function readInbox(id) {
  const dir = path.join(root, ".atlas-data", "coupang-partners", "inbox", id);
  if (!fs.existsSync(dir)) return { dir, material: null };
  const files = fs.readdirSync(dir);
  const material = {};
  if (files.includes("material.json")) Object.assign(material, JSON.parse(fs.readFileSync(path.join(dir, "material.json"), "utf8")));
  if (files.includes("link.txt")) material.link = fs.readFileSync(path.join(dir, "link.txt"), "utf8").trim().split(/\r?\n/)[0];
  material.images = files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().map((f) => path.join(dir, f));
  return { dir, material: material.link || material.images.length ? material : null };
}

function main() {
  if (!draftId) throw new Error("사용법: node scripts/atlas-coupang-partners-intake.mjs <draftId> [--link <url> --images a.jpg,b.jpg]");
  const data = JSON.parse(fs.readFileSync(DRAFTS, "utf8"));
  const draft = data.items.find((item) => item.id === draftId);
  if (!draft) throw new Error(`초안을 찾지 못했습니다: ${draftId}`);

  const inbox = readInbox(draftId);
  const material = flag("--link") || flag("--images")
    ? { link: flag("--link"), productName: flag("--name"), price: flag("--price") ? Number(flag("--price")) : null, discountRate: flag("--discount") ? Number(flag("--discount")) : null, productId: flag("--product-id"), vendorItemId: flag("--vendor-item-id"), images: flag("--images").split(",").map((s) => s.trim()).filter(Boolean).map((p) => path.resolve(root, p)) }
    : inbox.material;

  if (!material) {
    out({
      id: draftId,
      status: "MANUAL_LOGIN_REQUIRED",
      blocking: false,
      message: "쿠팡 파트너스 로그인/링크 생성은 자동화하지 않습니다. 일반 Edge에서 직접 로그인해 링크와 공식 이미지를 만든 뒤 인박스에 넣으면 자동 연결됩니다.",
      product: { productId: draft.coupangProduct?.productId, vendorItemId: draft.coupangProduct?.vendorItemId, listingUrl: draft.coupangProduct?.listingUrl, expectedNameTokens: draft.coupangProduct?.expectedNameTokens || [] },
      inbox: rel(inbox.dir),
      put: ["link.txt (파트너스 링크 1줄)", "product_1.jpg / product_2.jpg (파트너스 화면의 공식 상품 이미지)", "material.json (선택: 정확한 상품명·판매가·할인율·productId·vendorItemId)"],
      then: `node scripts/atlas-coupang-partners-intake.mjs ${draftId}`,
      publishBlockers: publishBlockers(draft),
    });
    return;
  }

  const validation = validatePartnersMaterial(draft, material);
  const existing = material.images.filter((p) => fs.existsSync(p) && fs.statSync(p).size > 0);
  if (existing.length !== material.images.length) validation.issues.push("image file missing or empty");
  if (validation.issues.length) { out({ id: draftId, status: "material_rejected", applied: false, issues: validation.issues, material: { ...material, images: material.images.map(rel) } }); process.exit(2); }

  // 공식 이미지를 초안 자산 폴더로 복사 (product_1, product_2 …)
  const assetDir = path.join(root, ".atlas-data", "korea-assets", draftId);
  fs.mkdirSync(assetDir, { recursive: true });
  const saved = existing.slice(0, 2).map((src, index) => {
    const target = path.join(assetDir, `product_${index + 1}${imageExtensionFor(src)}`);
    fs.copyFileSync(src, target);
    if (!fs.statSync(target).size) throw new Error(`저장된 이미지가 비어 있습니다: ${target}`);
    return rel(target);
  });

  const acquiredAt = new Date().toISOString();
  const productId = String(material.productId || draft.coupangProduct?.productId || "");
  const vendorItemId = String(material.vendorItemId || draft.coupangProduct?.vendorItemId || "");
  const updated = applyPartnersMaterial(draft, { product: { productId, productName: material.productName || draft.productName, productUrl: material.link }, localImagePaths: saved });
  updated.images = updated.images.map((img) => (img.role === "product_photo" && saved.includes(img.src) ? { ...img, source: "coupang_partners", productId, vendorItemId, acquiredAt } : img));
  updated.coupangProduct = {
    ...(draft.coupangProduct || {}), source: "coupang_partners", productId, vendorItemId,
    officialName: material.productName || "", price: material.price ?? null, discountRate: material.discountRate ?? null,
    partnersLink: material.link, partnersLinkStatus: "linked", partnersImageStatus: "linked", acquiredAt,
  };
  if (updated.shorts?.sourceImages) {
    let cursor = 0;
    updated.shorts.sourceImages = updated.shorts.sourceImages.map((img) => (img.role === "product" && !img.path && saved[cursor] ? { ...img, path: saved[cursor++], source: "coupang_partners", status: "ready", acquiredAt } : img));
  }
  data.items = data.items.map((item) => (item.id === draftId ? updated : item));
  fs.writeFileSync(DRAFTS, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  // 쇼핑쇼츠 export도 같은 링크/공식 이미지로 갱신
  let shortsExport = null;
  if (updated.shorts) {
    const exportDir = path.join(root, "data", "atlas", "shorts-exports");
    fs.mkdirSync(exportDir, { recursive: true });
    const built = buildStoryShortsExport(updated);
    fs.writeFileSync(path.join(exportDir, `${draftId}.story-shorts.json`), `${JSON.stringify(built, null, 2)}\n`, "utf8");
    shortsExport = { status: built.status, blockers: built.blockers };
  }

  out({ id: draftId, status: "linked", affiliateUrl: updated.affiliateUrl, images: saved, officialName: material.productName || "", price: material.price ?? null, publishBlockers: publishBlockers(updated), shortsExport, state: updated.state });
}

try { main(); } catch (error) { console.error(String(error?.stack || error)); process.exit(1); }
