// 로컬 장면 아트 생성 — 순수 모듈(파일·네트워크 없음).
//
// 이전 커밋까지는 장면 아트가 없으면 요청서만 남기고 운영자가 외부에서 만들어야 했다.
// 이 PC에는 무료 로컬 생성기(ComfyUI + SDXL 체크포인트 + IP-Adapter Plus-Face)가 있으므로
// 같은 요청 프롬프트를 그대로 로컬에서 실행한다. 유료 API는 쓰지 않는다.
//
// 얼굴 고정: 캐릭터 마스터(및 확정 세트)를 IP-Adapter 얼굴 참조로만 넣는다.
// 참조 이미지를 배경 위에 붙이지 않으므로 같은 얼굴 크롭이 반복되지 않는다.
// 머리 모양·자세·시점·카메라 거리는 scene-direction.js 지시가 담긴 요청 프롬프트가 정한다.
import { getCharacterDefinition } from "../character-channel-policy.js";

export const GENERATOR = Object.freeze({
  checkpoint: "dreamshaperXL_lightningDPMSDE.safetensors",
  ipadapter: "ip-adapter-plus-face_sdxl_vit-h.safetensors",
  clipVision: "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors",
  steps: 8,
  cfg: 2,
  sampler: "dpmpp_sde",
  scheduler: "karras",
});

// 채널별 캐릭터·화풍·크기. 캐릭터는 정책 파일에서만 가져온다.
export const CHANNEL_PROFILE = Object.freeze({
  korea: Object.freeze({
    characterId: "suho",
    width: 1216,
    height: 832,
    // 수호는 확정 애니메이션 세트(멀티탭) 전체를 얼굴 참조로 쓴다.
    // 수호 마스터는 이미 얼굴 기준 크롭이다. 멀티탭 장면 전체를 참조로 넣으면 그 구도(거실·쪼그려 앉기)가
    // 따라오므로 넣지 않는다.
    extraReferences: [],
    faceCrop: { x: 40, y: 60, width: 320, height: 320 },
    subject: "a young Korean man in his 20s, tousled dark-brown hair, large dark eyes, focused expression, dark green knit sweater",
    style: "anime illustration, korean webtoon style, clean lineart, soft cel shading, warm daylight, detailed cozy korean apartment interior",
    negative: "looking at viewer, posing for camera, portrait, photo, photorealistic, 3d render, realistic skin, old man, beard, woman, text, letters, watermark, logo, signage, deformed hands, extra fingers, lowres, blurry, collage, split screen, frame, border",
    // 수호는 화풍·옷·머리가 정체성의 대부분을 싣는다. 얼굴 참조를 세게 걸면 정면 미소 자세로만 수렴한다.
    ipWeight: 0.5,
    ipStartAt: 0.35,
    leadWithAction: true,
  }),
  global: Object.freeze({
    characterId: "miji",
    width: 1344,
    height: 768,
    extraReferences: [],
    // 마스터에서 얼굴만 잘라 참조한다. 머리카락·블라우스·정면 구도가 들어가면 5장이 전부 같은 사진이 된다.
    faceCrop: { x: 360, y: 330, width: 380, height: 400 },
    // art_024 사고 이후: Plus-Face(ArcFace 0.03~0.39)로는 미지 얼굴이 고정되지 않았다.
    // FaceID Plus v2는 검수와 같은 ArcFace 임베딩으로 조건을 거므로 얼굴 일치를 최우선으로 둔다.
    faceId: { preset: "FACEID PLUS V2", loraStrength: 0.6, weight: 0.8, weightV2: 1.2, startAt: 0.15, endAt: 1 },
    // 저장된 요청 프롬프트에는 옛 연출 문구가 섞여 있을 수 있어 장면 의도(첫 문장)만 쓰고
    // 연출은 현재 scene-direction 값으로 채운다.
    sceneFromIntentOnly: true,
    subject: "a Korean woman in her 30s, dark-brown hair color, warm brown almond-shaped eyes, oval face, soft jawline",
    style: "photorealistic editorial travel photograph, 35mm lens, natural soft light, realistic skin texture, shallow depth of field",
    negative: "(two people:1.4), (second person:1.3), twins, duplicate person, anime, illustration, cartoon, painting, 3d render, man, child, text, letters, watermark, logo, readable signage, deformed hands, extra fingers, lowres, blurry, collage, split screen, frame, border, studio portrait",
    ipWeight: 0.75,
    ipStartAt: 0.2,
  }),
});

export function channelProfile(channel) {
  const profile = CHANNEL_PROFILE[channel];
  if (!profile) throw new Error(`알 수 없는 채널: ${channel}`);
  return profile;
}

// 얼굴 참조 목록. 첫 번째는 항상 정책이 정한 마스터다.
export function referenceAssets(channel) {
  const profile = channelProfile(channel);
  const character = getCharacterDefinition(profile.characterId);
  return [character.masterAssetPath, ...profile.extraReferences];
}

// 요청 프롬프트에서 장면 부분만 쓴다. "Identity lock" 문단은 얼굴 참조가 대신하고,
// 이름(Miji/Suho)은 모델이 모르는 토큰이라 인물 묘사로 바꾼다.
// 연출 지시(direction)가 있으면 머리 모양·자세를 맨 앞에 강조한다. 얼굴 참조가 마스터의
// 긴 웨이브 머리까지 끌고 오므로, 강조하지 않으면 역할마다 머리 모양이 같아진다.
export function generationPrompt(channel, requestPrompt, direction = null) {
  const profile = channelProfile(channel);
  const character = getCharacterDefinition(profile.characterId);
  const scene = String(requestPrompt || "")
    .split(/\n\s*\nIdentity lock:/i)[0]
    .replace(/no text, no logo, no watermark, no readable signage\.?/i, "")
    .replace(new RegExp(`\\b${character.id}\\b`, "gi"), "the same person")
    .replace(/\s+/g, " ")
    .trim();
  if (!scene) throw new Error("장면 프롬프트가 비어 있습니다.");
  // leadWithAction 채널은 장면 첫 문장(무엇을 하고 있는가)을 맨 앞에 강조한다.
  // 뒤로 밀리면 정면 인물 사진으로 수렴한다(수호에서 확인).
  const sentences = scene.split(/(?<=\.)\s+/);
  if (profile.sceneFromIntentOnly) sentences.splice(1);
  const action = profile.leadWithAction ? sentences.shift().replace(/\.$/, "") : "";
  const lead = [
    action && `(${action}:1.4)`,
    direction?.hair && `(${direction.hair}:1.6)`,
    direction?.viewpoint && `(${direction.viewpoint}:1.3)`,
    direction?.camera && `(${direction.camera}:1.2)`,
    direction?.posture && `(${direction.posture}:1.2)`,
  ].filter(Boolean).join(", ");
  return [lead, profile.style, profile.subject, sentences.join(" ")].filter(Boolean).join(". ");
}

// 역할마다 다른 시드. 같은 역할을 다시 만들면 같은 결과가 나온다.
export function seedFor(channel, topicSlug, role, base = 0) {
  let h = 2166136261;
  for (const ch of `${channel}/${topicSlug}/${role}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h + Number(base || 0)) % 2 ** 32;
}

// ComfyUI API 워크플로. referenceNames는 ComfyUI input 폴더에 올라간 파일 이름.
// 머리를 묶거나 가리는 역할에서는 풀어 내린 긴 머리를 부정 프롬프트로 막는다.
export function negativePrompt(channel, direction = null) {
  const base = channelProfile(channel).negative;
  const hair = direction?.hair || "";
  if (!hair || /worn down/i.test(hair)) return base;
  return `${base}, (loose long hair:1.3), hair down, hair over shoulders`;
}

export function buildWorkflow({ channel, prompt, seed, referenceNames, prefix, direction = null }) {
  const profile = channelProfile(channel);
  if (!referenceNames?.length) throw new Error("얼굴 참조 이미지가 없습니다.");
  const g = GENERATOR;
  const wf = {
    ckpt: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: g.checkpoint } },
    ipa: { class_type: "IPAdapterModelLoader", inputs: { ipadapter_file: g.ipadapter } },
    clipv: { class_type: "CLIPVisionLoader", inputs: { clip_name: g.clipVision } },
    pos: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["ckpt", 1] } },
    neg: { class_type: "CLIPTextEncode", inputs: { text: negativePrompt(channel, direction), clip: ["ckpt", 1] } },
    latent: { class_type: "EmptyLatentImage", inputs: { width: profile.width, height: profile.height, batch_size: 1 } },
  };
  if (profile.faceId) return faceIdWorkflow(wf, profile, { seed, referenceNames, prefix });
  // 참조 이미지를 한 배치로 묶어 얼굴 임베딩을 평균낸다.
  referenceNames.forEach((name, i) => {
    wf[`ref${i}`] = { class_type: "LoadImage", inputs: { image: name } };
    let source = [`ref${i}`, 0];
    // 첫 참조(마스터)는 얼굴만 잘라 쓴다.
    if (i === 0 && profile.faceCrop) {
      wf.crop0 = { class_type: "ImageCrop", inputs: { image: source, ...profile.faceCrop } };
      source = ["crop0", 0];
    }
    wf[`prep${i}`] = { class_type: "PrepImageForClipVision", inputs: { image: source, interpolation: "LANCZOS", crop_position: "center", sharpening: 0 } };
  });
  let batch = ["prep0", 0];
  for (let i = 1; i < referenceNames.length; i += 1) {
    wf[`batch${i}`] = { class_type: "ImageBatch", inputs: { image1: batch, image2: [`prep${i}`, 0] } };
    batch = [`batch${i}`, 0];
  }
  wf.apply = {
    class_type: "IPAdapterAdvanced",
    inputs: {
      model: ["ckpt", 0],
      ipadapter: ["ipa", 0],
      clip_vision: ["clipv", 0],
      image: batch,
      weight: profile.ipWeight,
      weight_type: "linear",
      combine_embeds: "average",
      // 초반 스텝은 프롬프트가 구도를 잡게 두고, 그 뒤부터 얼굴을 고정한다.
      start_at: profile.ipStartAt ?? 0,
      end_at: 1,
      embeds_scaling: "V only",
    },
  };
  wf.sample = {
    class_type: "KSampler",
    inputs: {
      model: ["apply", 0],
      positive: ["pos", 0],
      negative: ["neg", 0],
      latent_image: ["latent", 0],
      seed,
      steps: g.steps,
      cfg: g.cfg,
      sampler_name: g.sampler,
      scheduler: g.scheduler,
      denoise: 1,
    },
  };
  wf.decode = { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["ckpt", 2] } };
  wf.save = { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: prefix || "atlas" } };
  return wf;
}

// FaceID Plus v2: 참조 얼굴의 ArcFace 임베딩(+CLIP 얼굴 크롭)으로 조건을 건다. 합성·img2img 없음.
function faceIdWorkflow(wf, profile, { seed, referenceNames, prefix }) {
  const g = GENERATOR;
  const f = profile.faceId;
  delete wf.ipa;
  delete wf.clipv;
  wf.ref0 = { class_type: "LoadImage", inputs: { image: referenceNames[0] } };
  wf.faceid_loader = {
    class_type: "IPAdapterUnifiedLoaderFaceID",
    inputs: { model: ["ckpt", 0], preset: f.preset, lora_strength: f.loraStrength, provider: "CUDA" },
  };
  wf.apply = {
    class_type: "IPAdapterFaceID",
    inputs: {
      model: ["faceid_loader", 0],
      ipadapter: ["faceid_loader", 1],
      image: ["ref0", 0],
      weight: f.weight,
      weight_faceidv2: f.weightV2,
      weight_type: "linear",
      combine_embeds: "concat",
      start_at: f.startAt,
      end_at: f.endAt,
      embeds_scaling: "V only",
    },
  };
  wf.sample = {
    class_type: "KSampler",
    inputs: {
      model: ["apply", 0],
      positive: ["pos", 0],
      negative: ["neg", 0],
      latent_image: ["latent", 0],
      seed,
      steps: g.steps,
      cfg: g.cfg,
      sampler_name: g.sampler,
      scheduler: g.scheduler,
      denoise: 1,
    },
  };
  wf.decode = { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["ckpt", 2] } };
  wf.save = { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: prefix || "atlas" } };
  return wf;
}
