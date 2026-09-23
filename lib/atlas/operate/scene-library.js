// 장면 사진 원천 — Wikimedia Commons의 자유 라이선스 사진만 쓴다. 유료 API를 호출하지 않는다.
//
// 이미지는 "실제 장면 사진 + 캐릭터 패널"로 만든다. 역할마다 다른 사진을 지정해 두는 이유는,
// 같은 배경을 돌려쓰면 옷만 바뀐 것처럼 보이는 반복 이미지가 되기 때문이다.
// 여기에 장면이 선언되지 않은 주제는 장면 렌더 대상이 아니다(카드형으로 되돌아가지 않는다).
import fs from "fs";
import path from "path";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "ATLAS/1.0 (blog scene sourcing; https://blog.naver.com/who-ami)";
const CACHE_DIR = () => path.join(process.cwd(), ".atlas-data", "scene-cache");

// 자유 라이선스만 통과시킨다. 그 밖의 표기는 출처를 신뢰할 수 없으므로 거부한다.
const FREE_LICENSE = /^(CC BY|CC BY-SA|CC0|Public domain|PDM)/i;

// 주제 → 역할 → 장면. label은 이미지 위에 얹는 짧은 한 줄이며, 문장·목록은 넣지 않는다.
export const TOPIC_SCENES = Object.freeze({
  kr_info_autumn_humidity: {
    info_why: { file: "File:Condensation Windows1.jpg", label: "창가에 맺히는 결로" },
    info_how: { file: "File:Winterbourne main bedroom 2016.jpg", label: "가구와 외벽 사이" },
    info_checklist: { file: "File:2023 Czujnik temperatury i wilgotności Xiaomi (2).jpg", label: "습도 40~60%" },
  },
  kr_info_heating_prep: {
    info_why: { file: "File:Adjusting the temperature on a thermostat in a home setting.jpg", label: "첫 가동 전 점검" },
    info_how: { file: "File:247 Home Rescue radiator thermostat.jpg", label: "실내온도와 온돌온도" },
    info_checklist: { file: "File:Radiator-250558 1280.jpg", label: "난방비가 새는 자리" },
  },
  kr_info_fridge_reset: {
    info_why: { file: "File:Food into a refrigerator - 20111002.jpg", label: "칸마다 다른 온도" },
    info_how: { file: "File:Vegetables in Refrigerator Bin.jpg", label: "채소칸의 기준" },
    info_checklist: { file: "File:Fruits in Refrigerator Bin.jpg", label: "숙성 가스는 따로" },
  },
  gl_info_passport_validity: {
    featured: { file: "File:Passport documents desk (Unsplash).jpg", label: "Before you book" },
    context: { file: "File:20180412-144358-otopeni-henri-coanda-airport-passport-control-2018.jpg", label: "At the border" },
    comparison: { file: "File:Singapore Airlines Check-in Counter@PEK (20140801125831).JPG", label: "Checked at the desk" },
    checklist: { file: "File:Packing Suitcase in Car Boot for a Holiday.jpg", label: "Five-minute check" },
    closing: { file: "File:AeroportodeSantiago31mar2007-04.jpg", label: "Renew before you pay" },
  },
});

export function scenesForTopic(topicId) {
  return TOPIC_SCENES[topicId] || null;
}

export function sceneFor(topicId, role) {
  return TOPIC_SCENES[topicId]?.[role] || null;
}

function cachePathFor(file) {
  const safe = file.replace(/^File:/, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  return path.join(CACHE_DIR(), safe);
}

function strip(value) {
  return String(value?.value || "").replace(/<[^>]+>/g, "").trim();
}

// 사진 한 장을 내려받아 캐시하고 라이선스 표기를 돌려준다.
// 이미 받아둔 파일은 다시 받지 않는다(불필요한 재생성 금지).
export async function fetchScene(file, { width = 1600 } = {}) {
  const target = cachePathFor(file);
  const metaPath = `${target}.json`;
  if (fs.existsSync(target) && fs.existsSync(metaPath)) {
    return { ...JSON.parse(fs.readFileSync(metaPath, "utf8")), filePath: target, cached: true };
  }

  const url = `${COMMONS_API}?${new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: String(width),
    titles: file,
  })}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw Object.assign(new Error(`Commons 조회 실패 (${res.status}): ${file}`), { code: "SCENE_LOOKUP_FAILED" });
  const page = Object.values((await res.json()).query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl) throw Object.assign(new Error(`장면 사진을 찾지 못했습니다: ${file}`), { code: "SCENE_NOT_FOUND" });

  const license = strip(info.extmetadata?.LicenseShortName);
  if (!FREE_LICENSE.test(license)) {
    throw Object.assign(new Error(`자유 라이선스가 아닙니다 (${license}): ${file}`), { code: "SCENE_LICENSE_REJECTED" });
  }

  const image = await fetch(info.thumburl, { headers: { "User-Agent": USER_AGENT } });
  if (!image.ok) throw Object.assign(new Error(`사진 내려받기 실패 (${image.status}): ${file}`), { code: "SCENE_DOWNLOAD_FAILED" });

  fs.mkdirSync(CACHE_DIR(), { recursive: true });
  fs.writeFileSync(target, Buffer.from(await image.arrayBuffer()));
  const meta = {
    file,
    license,
    author: strip(info.extmetadata?.Artist).slice(0, 80),
    sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(file)}`,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return { ...meta, filePath: target, cached: false };
}

// 이미지 아래에 한 줄로 붙는 출처 표기.
export function creditLine(meta) {
  return [meta.author, meta.license, "Wikimedia Commons"].filter(Boolean).join(" · ");
}
