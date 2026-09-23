// 최종 검수 묶음을 저장소 데이터로 만들고, 사용자 발행 승인을 기록·소비한다.
// 규칙과 판정은 lib/atlas/publish-review.js 에 있다. 여기서는 읽고 쓰기만 한다.
import { readJson, writeJson } from "../../data-store.js";
import { APPROVAL_TTL_MS, CONFIRM_PHRASE, buildReviewPacket, recentPosts, userApprovalIssues } from "../publish-review.js";
import { faceMatchRequired } from "../face-match.js";

const ARTICLES = "articles.json";
const KOREA = "korea-drafts.json";

function publicPath(value) {
  const src = String(value || "").trim();
  if (!src) return "";
  if (/^https?:\/\//.test(src) || src.startsWith("/")) return src;
  return `/${src.replace(/^public\//, "")}`;
}

export function globalRecent(excludeId) {
  const articles = readJson(ARTICLES).articles || [];
  return recentPosts(
    articles
      .filter((a) => a.status === "published" || a.publishedUrl)
      .map((a) => ({ id: a.id, title: a.title, keyword: a.keyword, category: a.category, publishedAt: a.publishedAt, url: a.publishedUrl })),
    { excludeId },
  );
}

export function koreaRecent(excludeId) {
  const items = readJson(KOREA).items || [];
  return recentPosts(
    items
      .filter((d) => d.state === "published" || d.publishedUrl)
      .map((d) => ({ id: d.id, title: d.title, keyword: d.keyword, category: d.category || d.contentType, publishedAt: d.publishedAt, url: d.publishedUrl })),
    { excludeId },
  );
}

export function globalReviewPacket(article) {
  const images = (article.visualAssets || [])
    .filter((a) => a.required !== false)
    .map((a) => ({ role: a.key || a.role, src: a.publicUrl || publicPath(a.localSrc), alt: a.alt, faceMatch: a.faceMatch || null }));
  return buildReviewPacket({ channel: "global", record: article, images, recent: globalRecent(article.id), faceRequired: faceMatchRequired("global") });
}

export function koreaReviewPacket(draft) {
  const images = (draft.images || [])
    .filter((img) => img.role !== "product_photo")
    .map((img) => ({ role: img.role, src: publicPath(img.sceneArtSource) || img.src || "", alt: img.alt, faceMatch: img.faceMatch || null }));
  return buildReviewPacket({ channel: "korea", record: { ...draft, category: draft.category || draft.contentType }, images, recent: koreaRecent(draft.id), faceRequired: faceMatchRequired("korea") });
}

function findRecord(channel, id) {
  if (channel === "global") {
    const data = readJson(ARTICLES);
    return { data, record: (data.articles || []).find((a) => a.id === id), save: () => writeJson(ARTICLES, data) };
  }
  const data = readJson(KOREA);
  return { data, record: (data.items || []).find((d) => d.id === id), save: () => writeJson(KOREA, data) };
}

function packetFor(channel, record) {
  return channel === "global" ? globalReviewPacket(record) : koreaReviewPacket(record);
}

// 검수 화면의 "발행" 버튼만 부른다. 화면이 본 contentHash와 지금 내용이 같아야 승인된다.
export function recordUserApproval({ channel, id, contentHash, confirm }) {
  const { record, save } = findRecord(channel, id);
  if (!record) return { ok: false, issues: ["대상 글을 찾지 못했습니다."] };
  if (confirm !== CONFIRM_PHRASE) return { ok: false, issues: [`확인 문구 "${CONFIRM_PHRASE}"가 필요합니다.`] };
  const packet = packetFor(channel, record);
  if (packet.blocking.length) return { ok: false, issues: packet.blocking, packet };
  if (!contentHash || contentHash !== packet.contentHash) return { ok: false, issues: ["검수 화면 이후 내용이 바뀌었습니다. 새로고침 후 다시 확인하세요."], packet };
  record.userPublishApproval = { contentHash, confirm, approvedAt: new Date().toISOString(), via: "operate_review_screen", ttlMs: APPROVAL_TTL_MS };
  save();
  return { ok: true, approval: record.userPublishApproval };
}

// 발행 API가 실제 공개 직전에 부른다.
export function checkUserApproval(channel, record) {
  const packet = packetFor(channel, record);
  return { issues: userApprovalIssues(record, packet), packet };
}

// 발행 성공 후 승인을 소비한다(재사용 불가).
export function consumeUserApproval(channel, id) {
  const { record, save } = findRecord(channel, id);
  if (record?.userPublishApproval && !record.userPublishApproval.usedAt) {
    record.userPublishApproval.usedAt = new Date().toISOString();
    save();
  }
}
