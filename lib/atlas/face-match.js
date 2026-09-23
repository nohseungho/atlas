// 미지 얼굴 일치 검수 — 순수 모듈.
//
// art_024에서 IP-Adapter로 만든 미지 5장이 ATLAS-MIJI-MASTER와 다른 얼굴로 공개됐다.
// 구도·헤어가 달라도 얼굴은 같아야 하므로, 해외 이미지는 얼굴 일치 검수 "pass" 기록이
// 있어야만 준비 완료로 보고 발행할 수 있다. 기록이 없으면 통과가 아니다.
//
// 기록 형식(visualAssets[].faceMatch, scene-art manifest items[role].faceMatch):
//   { status: "pass" | "fail", similarity, threshold, method, reference, checkedAt, reason? }
// 점수는 scripts/atlas-face-check.py 가 ArcFace(insightface buffalo_l) 임베딩으로 계산한다.

// ArcFace 코사인 유사도 기준. 같은 인물 실사진은 보통 0.5 이상, 닮은 타인은 0.2~0.45.
export const FACE_MATCH_THRESHOLD = 0.5;

// 얼굴 검수가 발행 필수인 채널.
export const FACE_MATCH_REQUIRED_CHANNELS = Object.freeze(["global"]);

export function faceMatchRequired(channel) {
  return FACE_MATCH_REQUIRED_CHANNELS.includes(channel);
}

export function faceMatchPassed(record) {
  if (!record || record.status !== "pass") return false;
  // 운영자 fail 기록이 있거나 점수가 기준 미만이면 pass 표기가 있어도 통과시키지 않는다.
  if (typeof record.similarity === "number" && record.similarity < (record.threshold ?? FACE_MATCH_THRESHOLD)) return false;
  return true;
}

// 필수 이미지 중 얼굴 검수를 통과하지 못한 것. 사유를 함께 돌려준다.
export function faceMatchIssues(assets = []) {
  return assets
    .filter((a) => !faceMatchPassed(a?.faceMatch))
    .map((a) => {
      const key = a?.key || a?.role || "image";
      const fm = a?.faceMatch;
      if (!fm) return `${key}: 얼굴 검수 기록 없음`;
      if (typeof fm.similarity === "number") return `${key}: ${fm.status} (${fm.similarity.toFixed(3)} < ${fm.threshold ?? FACE_MATCH_THRESHOLD})`;
      return `${key}: ${fm.status}${fm.reason ? ` — ${fm.reason}` : ""}`;
    });
}
