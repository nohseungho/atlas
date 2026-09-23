// 장면 연출 지시 — 역할마다 무엇이 달라야 하는지를 한곳에서 정한다. 순수 모듈.
//
// 배경: 캐릭터 마스터 1장을 배경 위에 반복 합성하던 시절에는 어느 이미지나 같은 얼굴 크롭이
// 같은 자리에 붙었다. 배경만 바뀌고 인물은 그대로라 "옷만 바뀐 같은 이미지"로 읽혔다.
// 실제로 좋았던 세트(art_021 EES, 국내 멀티탭)는 장면마다 머리 모양·자세·시점·카메라 거리가
// 전부 달랐다. 그 차이를 아래에 지시로 고정하고, 검증기가 중복을 막는다.

export const HAIR = Object.freeze({
  DOWN: "long hair worn down",
  UPDO: "hair tied up in a neat bun",
  HALF: "half-up hairstyle",
  PONYTAIL: "low ponytail",
  CAP: "hair tucked under a soft cap",
});

export const CAMERA = Object.freeze({
  WIDE: "wide shot, full body in the scene",
  MEDIUM: "medium shot from the waist up",
  CLOSE: "close shot, head and shoulders",
  OVER_SHOULDER: "over-the-shoulder shot from behind",
  LOW: "low angle from table height",
});

export const VIEWPOINT = Object.freeze({
  FRONT: "facing the camera",
  THREE_QUARTER: "three-quarter turn away from the camera",
  PROFILE: "side profile",
  // 얼굴 일치 검수가 필수라 뒷모습만 보이는 컷은 쓰지 않는다. 뒤에서 잡되 어깨 너머로 돌아본 얼굴이 보여야 한다.
  BACK: "seen from behind, looking back over her shoulder so her face is clearly visible",
  ANGLED_DOWN: "seen from slightly above",
});

// 해외 미지 5장. 같은 얼굴이되 머리·자세·시점·카메라 거리가 모두 다르다.
export const GLOBAL_DIRECTION = Object.freeze({
  featured: { hair: HAIR.HALF, camera: CAMERA.MEDIUM, viewpoint: VIEWPOINT.FRONT, posture: "standing, holding the document she is talking about" },
  context: { hair: HAIR.UPDO, camera: CAMERA.WIDE, viewpoint: VIEWPOINT.THREE_QUARTER, posture: "walking through the space with a shoulder bag" },
  comparison: { hair: HAIR.PONYTAIL, camera: CAMERA.LOW, viewpoint: VIEWPOINT.ANGLED_DOWN, posture: "seated at a table, comparing two items laid out in front of her" },
  checklist: { hair: HAIR.CAP, camera: CAMERA.OVER_SHOULDER, viewpoint: VIEWPOINT.BACK, posture: "crouched beside an open case, working through it item by item" },
  closing: { hair: HAIR.DOWN, camera: CAMERA.CLOSE, viewpoint: VIEWPOINT.PROFILE, posture: "pausing by a window, phone in hand" },
});

// 국내 수호 3장. 수호는 애니메이션 일러스트이므로 헤어스타일은 고정이고,
// 대신 자세·행동·시점·카메라 거리로 장면을 구분한다(멀티탭 세트가 그렇게 만들어졌다).
export const KOREA_DIRECTION = Object.freeze({
  info_why: { camera: CAMERA.MEDIUM, viewpoint: VIEWPOINT.THREE_QUARTER, posture: "leaning in to look closely at the problem spot, hand raised near it" },
  info_how: { camera: CAMERA.WIDE, viewpoint: VIEWPOINT.FRONT, posture: "crouched down mid-action, actually doing the step" },
  info_checklist: { camera: CAMERA.LOW, viewpoint: VIEWPOINT.PROFILE, posture: "seated at a low table, pointing at the item being checked" },
});

export function directionFor(channel, role) {
  return (channel === "korea" ? KOREA_DIRECTION : GLOBAL_DIRECTION)[role] || null;
}

function axisIssues(items, axis, label) {
  const issues = [];
  const seen = new Map();
  for (const item of items) {
    const value = item?.direction?.[axis];
    if (!value) continue; // 축이 없는 채널(수호의 hair)은 검사하지 않는다
    if (seen.has(value)) issues.push(`${item.key}: ${seen.get(value)}와 ${label}이 같습니다 (${value}).`);
    else seen.set(value, item.key);
  }
  return issues;
}

// 한 글 안의 이미지들이 축마다 서로 다른지. 하나라도 겹치면 반복 이미지로 본다.
export function directionVarietyIssues(items = []) {
  const issues = [];
  for (const item of items) {
    if (!item?.direction) issues.push(`${item?.key || "image"}: 장면 연출 지시가 없습니다.`);
  }
  return [
    ...issues,
    ...axisIssues(items, "hair", "머리 모양"),
    ...axisIssues(items, "camera", "카메라 거리"),
    ...axisIssues(items, "viewpoint", "시점"),
    ...axisIssues(items, "posture", "자세"),
  ];
}

// 생성 요청 프롬프트. 얼굴은 마스터로 고정하고, 나머지는 역할별 지시를 따른다.
export function scenePrompt({ identityPrompt, sceneIntent, direction, style }) {
  const parts = [
    sceneIntent,
    direction.posture,
    direction.camera,
    direction.viewpoint,
    direction.hair,
    style,
    "no text, no logo, no watermark, no readable signage",
  ].filter(Boolean);
  return `${parts.join(". ")}.\n\nIdentity lock: ${identityPrompt}. Keep the same face across every image in this set; vary everything else.`;
}
