// 발행 직전 사용자 검수 — 순수 모듈(파일·네트워크 없음).
//
// 운영 규칙(2026-09-24):
//   - 국내·해외 모두 작성·이미지 생성·검수까지만 자동으로 진행한다. 자동 발행은 없다.
//   - 실제 공개 발행은 최종 검수 화면(제목·요약·이미지 전체·최근 글 비교)에서 사용자가
//     "발행"을 눌렀을 때만 일어난다. 그 전에는 Naver/Blogger 발행 API를 부르지 않는다.
//   - 최근 공개 글 5개와 핵심 검색의도가 겹치면(여권/보험/여행서류 등) 신규 주제로 교체해야 한다.
//   - 같은 카테고리 연속 발행은 경고한다.
//   - 캐릭터 얼굴 검수 실패 이미지가 있으면 발행하지 않는다.
//
// 승인 기록: record.userPublishApproval = { contentHash, approvedAt, via, confirm, usedAt? }
// 검수 화면이 본 내용(contentHash)과 발행 시점의 내용이 같아야 하고, 15분 안에 한 번만 쓸 수 있다.
// 한계: 로컬 API는 사람의 클릭과 스크립트 호출을 구분할 수 없다. 확인 문구·내용 해시·만료·1회 사용으로
// "검수 화면을 거치지 않은 발행"을 막는 것이며, 자동화 코드가 이 승인을 만들지 않는 것이 운영 규칙이다.
import crypto from "crypto";
import { faceMatchPassed } from "./face-match.js";

export const RECENT_POST_WINDOW = 5;
export const APPROVAL_TTL_MS = 15 * 60 * 1000;
export const CONFIRM_PHRASE = "발행";
export const SIMILARITY_BLOCK_JACCARD = 0.5;

// 핵심 검색의도 묶음. 최근 글과 같은 묶음에 걸리면 독자가 같은 질문으로 들어온 글로 본다.
export const INTENT_GROUPS = Object.freeze({
  travel_documents: /passport|visa\b|\beta\b|esta\b|etias|\bees\b|entry[- ]exit|border|travel documents?|id card|여권|비자|입국|출국|여행\s*서류|신분증/i,
  travel_insurance: /insurance|\bclaim|coverage|보험|보장|청구/i,
  travel_health: /vaccin|health risk|medical|medication|hospital|예방접종|병원|의약품/i,
  travel_money: /currency|exchange rate|\batm\b|foreign transaction|travel card|환전|환율|해외\s*결제/i,
  connectivity: /\besim\b|\bsim card|roaming|로밍|유심|이심/i,
  packing: /packing|luggage|baggage|carry-on|짐\s*싸|수하물|캐리어/i,
  holiday_gift: /추석|명절|설날|선물|gift/i,
  kitchen_storage: /글라스락|밀폐용기|반찬|보관\s*용기|남은\s*음식/i,
  electrical_safety: /멀티탭|콘센트|전기\s*안전|과부하/i,
  kitchen_appliance: /전기\s*주전자|전기\s*포트|kettle|주전자/i,
  home_humidity: /습도|결로|제습|가습|곰팡이|humidity|condensation/i,
});

function text(record) {
  return [record?.title, record?.keyword].filter(Boolean).join(" ");
}

export function intentsOf(record) {
  const value = text(record);
  return Object.entries(INTENT_GROUPS).filter(([, re]) => re.test(value)).map(([id]) => id);
}

function tokens(record) {
  return new Set(
    text(record)
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}
const STOP = new Set(["the", "and", "for", "your", "you", "with", "why", "how", "what", "before", "can", "that", "this", "trip", "travel", "abroad", "이유와", "아쉬운", "점"]);

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

// 공개 시각이 있는 기록만, 최신순으로 N개.
export function recentPosts(records = [], { excludeId = "", limit = RECENT_POST_WINDOW } = {}) {
  return records
    .filter((r) => r && r.id !== excludeId && r.publishedAt)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);
}

// 후보 글과 최근 글의 비교. blocking이 있으면 신규 주제로 교체해야 한다.
export function topicSimilarity(candidate, recent = []) {
  const candidateIntents = intentsOf(candidate);
  const candidateTokens = tokens(candidate);
  const comparisons = recent.map((post) => {
    const shared = intentsOf(post).filter((i) => candidateIntents.includes(i));
    const score = jaccard(candidateTokens, tokens(post));
    const sameCategory = Boolean(candidate.category && post.category && candidate.category === post.category);
    return {
      id: post.id,
      title: post.title,
      url: post.url || post.publishedUrl || "",
      publishedAt: post.publishedAt,
      category: post.category || "",
      sameCategory,
      sharedIntents: shared,
      jaccard: Number(score.toFixed(2)),
      verdict: shared.length || score >= SIMILARITY_BLOCK_JACCARD ? "similar" : "distinct",
    };
  });

  const blocking = comparisons
    .filter((c) => c.verdict === "similar")
    .map((c) =>
      c.sharedIntents.length
        ? `최근 글 "${c.title}"과 핵심 검색의도(${c.sharedIntents.join(", ")})가 겹칩니다. 신규 주제로 교체하세요.`
        : `최근 글 "${c.title}"과 제목·키워드가 ${Math.round(c.jaccard * 100)}% 겹칩니다. 신규 주제로 교체하세요.`,
    );
  const warnings = [];
  if (comparisons[0]?.sameCategory) warnings.push(`직전 글과 같은 카테고리(${comparisons[0].category})를 연속으로 발행합니다.`);
  return { candidateIntents, comparisons, blocking, warnings };
}

// 얼굴 검수. 해외(미지)는 pass 기록이 필수, 국내(수호 일러스트)는 fail 기록이 있으면 막는다.
export function faceReviewIssues(images = [], { required = false } = {}) {
  return images
    .filter((img) => (required ? !faceMatchPassed(img.faceMatch) : img.faceMatch?.status === "fail"))
    .map((img) => `${img.role}: 캐릭터 얼굴 검수 ${img.faceMatch?.status || "기록 없음"}`);
}

// 최종 검수 화면이 보여주는 묶음. contentHash는 화면이 본 내용 그대로를 가리킨다.
export function buildReviewPacket({ channel, record, images = [], recent = [], faceRequired = false }) {
  const similarity = topicSimilarity(record, recent);
  const faceIssues = faceReviewIssues(images, { required: faceRequired });
  const packet = {
    channel,
    id: record?.id || "",
    title: record?.title || "",
    summary: record?.excerpt || record?.quickAnswer || record?.metaDescription || String(record?.bodyText || "").split("\n")[0] || "",
    category: record?.category || "",
    images: images.map((img) => ({ role: img.role, src: img.src || "", alt: img.alt || "", faceMatch: img.faceMatch || null })),
    similarity,
    faceIssues,
    blocking: [...similarity.blocking, ...faceIssues],
    warnings: similarity.warnings,
  };
  packet.contentHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ c: packet.channel, id: packet.id, t: packet.title, s: packet.summary, i: packet.images.map((i) => [i.role, i.src]), b: packet.blocking }))
    .digest("hex")
    .slice(0, 32);
  return packet;
}

// 발행 API가 실제 공개 직전에 부른다. 빈 배열이어야만 발행할 수 있다.
export function userApprovalIssues(record, packet, now = Date.now()) {
  const issues = [];
  const approval = record?.userPublishApproval;
  if (packet.blocking.length) issues.push(...packet.blocking);
  if (!approval) {
    issues.push("사용자 발행 승인이 없습니다. 최종 검수 화면에서 \"발행\"을 눌러야 공개됩니다.");
    return issues;
  }
  if (approval.confirm !== CONFIRM_PHRASE) issues.push("확인 문구가 없습니다.");
  if (approval.usedAt) issues.push("이미 사용된 승인입니다. 다시 검수 후 승인하세요.");
  if (approval.contentHash !== packet.contentHash) issues.push("승인 이후 제목·요약·이미지가 바뀌었습니다. 다시 검수하세요.");
  const age = now - Date.parse(approval.approvedAt || 0);
  if (!(age >= 0 && age <= APPROVAL_TTL_MS)) issues.push("승인 후 15분이 지났습니다. 다시 검수하세요.");
  return issues;
}
