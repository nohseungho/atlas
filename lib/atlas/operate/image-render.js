// 이미지 준비 단계.
//
// 정상 경로는 "실제 장면 아트를 찾아 연결"하는 것 하나뿐이다. 캐릭터 마스터를 배경 위에
// 반복 합성해 장면을 지어내지 않는다 — 그렇게 만든 이미지는 배경만 다르고 인물이 똑같아서
// 한 세트로 보면 같은 그림이었고, 발행 게이트만 거짓으로 통과시켰다.
// 아트가 없으면 미완료로 두고 생성 요청서만 남긴다(유료 API 호출 없음).
import fs from "fs";
import path from "path";
import { buildArtRequest, resolveSceneArt, writeArtRequest } from "./scene-art.js";
import { faceMatchPassed } from "../face-match.js";

const KOREA_ASSET_DIR = () => path.join(process.cwd(), ".atlas-data", "korea-assets");
const REQUEST_DIR = () => path.join(process.cwd(), ".atlas-data", "art-requests");

function safePart(value) {
  return String(value || "asset").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

// 국내: public/atlas/korea/suho/<topicSlug>/<role>.png 를 찾아 초안에 연결한다.
// role "product_photo"는 실제 제품 사진 자리라 여기서 건드리지 않는다.
export async function renderKoreaDraftImages(draft, { force = false } = {}) {
  const topicSlug = String(draft.topicId || "").replace(/^kr_info_/, "");
  const slots = (draft.images || []).filter((img) => img.role !== "product_photo");
  const { ready, missing } = resolveSceneArt("korea", topicSlug, slots.map((img) => img.role));
  const byRole = new Map(ready.map((r) => [r.role, r.file]));

  const dir = path.join(KOREA_ASSET_DIR(), safePart(draft.id));
  fs.mkdirSync(dir, { recursive: true });
  const images = (draft.images || []).map((img) => {
    const art = byRole.get(img.role);
    if (!art) {
      // 장면 아트가 없는 역할은 연결을 끊는다. 예전 합성 파일이 남아 있으면
      // 이미지가 준비된 것처럼 게이트를 통과하므로 그 파일도 지운다.
      const stale = String(img.src || "").trim();
      if (stale && stale.startsWith(dir) && fs.existsSync(stale)) {
        try { fs.rmSync(stale, { force: true }); } catch {}
      }
      return { ...img, src: "", sceneArtSource: "" };
    }
    // 네이버 업로더는 로컬 파일 경로를 쓰므로 초안 폴더로 복사해 연결한다.
    const target = path.join(dir, `${safePart(img.id)}${path.extname(art)}`);
    if (force || !fs.existsSync(target)) fs.copyFileSync(art, target);
    return { ...img, src: target, sceneArtSource: path.relative(process.cwd(), art).split(path.sep).join("/"), generatedAt: new Date().toISOString() };
  });

  const request = missing.length
    ? writeArtRequest(
        buildArtRequest({
          channel: "korea",
          topicSlug,
          character: "suho",
          items: slots.filter((img) => missing.includes(img.role)).map((img) => ({ role: img.role, prompt: img.prompt })),
        }),
        path.join(REQUEST_DIR(), `korea-${safePart(topicSlug)}.json`),
      )
    : "";

  return { images, rendered: ready, missing, artRequest: request };
}

// 해외: public/atlas/global/miji/<topicSlug>/<role>.png 를 찾아 기사 이미지 자리에 복사한다.
export async function renderGlobalArticleImages(article, { force = false } = {}) {
  const topicSlug = String(article.topicId || "").replace(/^gl_info_/, "");
  const assets = (Array.isArray(article.visualAssets) ? article.visualAssets : []).filter((a) => a.localSrc);
  const { ready, missing, rejected } = resolveSceneArt("global", topicSlug, assets.map((a) => a.role || a.key));
  const byRole = new Map(ready.map((r) => [r.role, r.file]));
  // 역할별 얼굴 검수 기록. 라우트가 기사 visualAssets[].faceMatch 로 옮겨 발행 게이트가 읽는다.
  const faceMatch = Object.fromEntries([...ready, ...rejected].map((r) => [r.role, r.faceMatch || null]));

  const copied = [];
  for (const asset of assets) {
    const art = byRole.get(asset.role || asset.key);
    if (!art) {
      // 합성으로 만들어 둔 파일이 남아 있으면 공개 이미지 게이트가 거짓 통과한다.
      const stale = path.join(process.cwd(), "public", asset.localSrc.replace(/^\//, ""));
      if (fs.existsSync(stale)) {
        try { fs.rmSync(stale, { force: true }); } catch {}
      }
      continue;
    }
    const target = path.join(process.cwd(), "public", asset.localSrc.replace(/^\//, ""));
    if (force || !fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(art, target);
    }
    copied.push({ id: asset.key, outPath: target });
  }

  const request = missing.length
    ? writeArtRequest(
        buildArtRequest({
          channel: "global",
          topicSlug,
          character: "miji",
          items: assets.filter((a) => missing.includes(a.role || a.key)).map((a) => ({ role: a.role || a.key, prompt: a.prompt })),
        }),
        path.join(REQUEST_DIR(), `global-${safePart(topicSlug)}.json`),
      )
    : "";

  return { rendered: copied, missing, rejected: rejected.map((r) => r.role), faceMatch, artRequest: request };
}

export function globalLocalImageStatus(article) {
  const assets = (Array.isArray(article?.visualAssets) ? article.visualAssets : []).filter((a) => a?.required !== false);
  // 파일이 있어도 미지 얼굴 검수를 통과하지 못했으면 준비된 이미지가 아니다.
  const ready = assets.filter((a) => {
    if (!a.localSrc || !faceMatchPassed(a.faceMatch)) return false;
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
