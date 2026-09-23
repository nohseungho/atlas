// 장면 아트 자산 해석 — 이미지를 "만드는" 유일한 정상 경로.
//
// 규칙 하나: 캐릭터 마스터 1장을 배경 위에 반복 합성해서 장면을 지어내지 않는다.
// 실제 장면 아트(art_021 EES 세트, 국내 멀티탭 세트처럼 인물이 장면의 주체인 그림)가
// 있으면 그것을 쓰고, 없으면 미완료로 두고 생성 요청 프롬프트만 남긴다.
// 없는 장면을 있는 척 채우면 발행 게이트가 거짓으로 통과한다.
import fs from "fs";
import path from "path";
import { faceMatchPassed, faceMatchRequired } from "../face-match.js";

// 운영자가 외부에서 만든 장면 아트를 떨어뜨리는 자리.
//   국내: public/atlas/korea/suho/<topicSlug>/<role>.png
//   해외: public/atlas/global/miji/<topicSlug>/<role>.png
const ART_ROOT = (channel) =>
  channel === "korea"
    ? path.join(process.cwd(), "public", "atlas", "korea", "suho")
    : path.join(process.cwd(), "public", "atlas", "global", "miji");

const EXTENSIONS = [".png", ".webp", ".jpg", ".jpeg"];

export function artDirFor(channel, topicSlug) {
  return path.join(ART_ROOT(channel), String(topicSlug || "").trim());
}

// 역할에 해당하는 장면 아트 파일. 없으면 null.
export function findSceneArt(channel, topicSlug, role) {
  const dir = artDirFor(channel, topicSlug);
  for (const ext of EXTENSIONS) {
    const file = path.join(dir, `${role}${ext}`);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

// 생성기가 남긴 기록(data/atlas/scene-art/<channel>-<topic>.json). 없으면 null.
export function readSceneArtManifest(channel, topicSlug) {
  const file = path.join(process.cwd(), "data", "atlas", "scene-art", `${channel}-${String(topicSlug || "").trim()}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// 한 글의 이미지 세트를 훑어 준비된 것과 빠진 것을 가른다.
// ready = 실제 장면 아트가 있는 역할, missing = 생성이 필요한 역할.
// 얼굴 검수가 필수인 채널(해외 미지)은 파일이 있어도 faceMatch pass 기록이 없으면 missing이다.
// rejected = 파일은 있지만 얼굴 검수를 통과하지 못해 쓰면 안 되는 역할.
export function resolveSceneArt(channel, topicSlug, roles = []) {
  const ready = [];
  const missing = [];
  const rejected = [];
  const manifest = faceMatchRequired(channel) ? readSceneArtManifest(channel, topicSlug) : null;
  for (const role of roles) {
    const file = findSceneArt(channel, topicSlug, role);
    if (!file) {
      missing.push(role);
      continue;
    }
    if (faceMatchRequired(channel)) {
      const faceMatch = manifest?.items?.[role]?.faceMatch || null;
      if (!faceMatchPassed(faceMatch)) {
        missing.push(role);
        rejected.push({ role, file, faceMatch });
        continue;
      }
      ready.push({ role, file, faceMatch });
      continue;
    }
    ready.push({ role, file });
  }
  return { ready, missing, rejected, complete: missing.length === 0 && roles.length > 0 };
}

// 빠진 역할의 생성 요청서. 운영자가 외부 도구에서 그대로 쓰고,
// 결과 파일을 artDirFor() 아래에 <role>.png 로 넣으면 자동으로 연결된다.
export function buildArtRequest({ channel, topicSlug, character, items }) {
  return {
    channel,
    character,
    topicSlug,
    dropDirectory: path.relative(process.cwd(), artDirFor(channel, topicSlug)).replace(/\\/g, "/"),
    note: "각 파일을 <role>.png 이름으로 위 폴더에 넣으면 이미지 단계가 자동으로 완료됩니다. 얼굴은 마스터와 동일하게 유지하고, 머리 모양·자세·시점·카메라 거리는 항목마다 다르게 생성하세요.",
    items: items.map((item) => ({ role: item.role, fileName: `${item.role}.png`, prompt: item.prompt })),
  };
}

export function writeArtRequest(request, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  return outPath;
}
