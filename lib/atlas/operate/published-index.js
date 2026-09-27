// 이미 공개된 글의 색인. 주제 선택과 발행 직전 중복 검사에 쓴다.
//
// 기존 저장소만 읽는다: articles.json(해외), korea-drafts.json(국내),
// publisher-state.json(Blogger에 있지만 ATLAS 기록이 없는 글), publishing.json(발행 job).
import { readJson } from "../../data-store.js";
import { ATLAS_CHANNEL_ID } from "../character-channel-policy.js";

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function safeRead(name, fallback) {
  try {
    return readJson(name);
  } catch {
    return fallback;
  }
}

// 한 공개 URL에 대응하는 초안 기록이 여러 개여도 블로그 글은 한 건이다.
export function uniquePublishedPosts(records = []) {
  const seen = new Set();
  return records.filter((record) => {
    const url = String(record.url || "").trim().replace(/[?#].*$/, "").replace(/\/$/, "");
    const key = url ? `url:${url}` : `id:${record.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function publishedIndex() {
  const articles = safeRead("articles.json", { articles: [] }).articles || [];
  const korea = safeRead("korea-drafts.json", { items: [] }).items || [];
  const publisherState = safeRead("publisher-state.json", {});
  const jobs = safeRead("publishing.json", { jobs: [] }).jobs || [];

  const publishedJobArticleIds = new Set(
    jobs.filter((job) => job.status === "succeeded" || job.publishedUrl).map((job) => job.articleId),
  );

  const global = articles
    .filter((a) => a.status === "published" || a.publishedUrl || publishedJobArticleIds.has(a.id))
    .map((a) => ({ id: a.id, title: a.title, slug: a.slug, keyword: a.keyword, topicId: a.topicId || "", url: a.publishedUrl || "" }));

  for (const post of publisherState.externalPosts || []) {
    global.push({ id: post.id, title: post.title, slug: "", keyword: "", topicId: "", url: post.url || "" });
  }

  const koreaPublished = uniquePublishedPosts(korea
    .filter((d) => d.state === "published" || d.publishedUrl)
    .map((d) => ({ id: d.id, title: d.title, slug: "", keyword: d.keyword || "", topicId: d.topicId || "", url: d.publishedUrl || "" })));

  return {
    [ATLAS_CHANNEL_ID.GLOBAL_BLOGGER]: global,
    [ATLAS_CHANNEL_ID.KOREA_NAVER]: koreaPublished,
  };
}

// 주제/초안이 이미 공개된 글과 겹치는지. 겹치면 사유를 돌려준다.
export function duplicateReason(candidate, publishedRecords = []) {
  const title = normalize(candidate.title);
  const slug = normalize(candidate.slug);
  const keyword = normalize(candidate.keyword);
  const topicId = String(candidate.topicId || candidate.id || "");
  for (const record of publishedRecords) {
    if (topicId && record.topicId && record.topicId === topicId) return `이미 발행된 글과 같은 주제입니다 (${record.url || record.id}).`;
    if (title && normalize(record.title) === title) return `같은 제목이 이미 공개되어 있습니다 (${record.url || record.id}).`;
    if (slug && normalize(record.slug) === slug) return `같은 slug가 이미 공개되어 있습니다 (${record.url || record.id}).`;
    if (keyword && normalize(record.keyword) === keyword) return `같은 키워드가 이미 공개되어 있습니다 (${record.url || record.id}).`;
  }
  return "";
}
